"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import type { UserPreference, PriorityItem, Constraint, ParserSource, ConstraintRelaxationSuggestion } from "@/types";
import type { AgentStep, AgentResult } from "@/agent/agent-types";
import { runDecision, buildDecisionMatrix, resolveEffectiveSelectedId } from "@/engine/decision-engine";
import { calculateDecisionConfidence, buildWhyMatches, buildTradeOffNotes } from "@/engine/decision-confidence";
import { validatePurchaseSelection } from "@/engine/purchase-selection";
import { resolveCategoryConfig } from "@/catalog/category-resolver";
import type { Product } from "@/types";
import { fetchProducts } from "@/catalog/registry";
import { Header } from "./Header";
import { AIQueryInput } from "./AIQueryInput";
import { QueryInput } from "./QueryInput";
import { PriorityControls } from "./PriorityControls";
import { BestMatchCard } from "./BestMatchCard";
import { RankedProducts } from "./RankedProducts";
import { DecisionMatrix } from "./DecisionMatrix";
import { ExplanationPanel } from "./ExplanationPanel";
import { TradeOffSection } from "./TradeOffSection";
import { DecisionSummary } from "./DecisionSummary";
import { CheckoutReadiness } from "./CheckoutReadiness";
import { DecisionInsightPanel } from "./DecisionInsightPanel";
import { EmptyResultPanel } from "./EmptyResultPanel";
import { CompareTopProducts } from "./CompareTopProducts";
import { AgentTracePanel } from "./AgentTracePanel";
import { ReviewIntelligencePanel } from "./ReviewIntelligencePanel";
import type { ProductReviewIntelligence } from "@/reviews/types";

const DEFAULT_BUDGET_MAX = 35000;
const INITIAL_CATEGORIES = [
  { key: "smartphone", label: "Smartphone" },
  { key: "laptop", label: "Laptop" },
];

function buildDefaultPriorities(category: string): PriorityItem[] {
  const result = resolveCategoryConfig(category);
  if (!result) return [];
  return result.config.attributes.map((attr) => ({
    attributeKey: attr.key,
    importance: attr.defaultImportance ?? 2,
  }));
}

export function DecisionWorkspace() {
  const [category, setCategory] = useState("smartphone");
  const [budget, setBudget] = useState<{ min?: number; max?: number }>({ max: DEFAULT_BUDGET_MAX });
  const [priorities, setPriorities] = useState<PriorityItem[]>(
    buildDefaultPriorities("smartphone")
  );
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [showManualControls, setShowManualControls] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  // --- Phase 5A: Purchase Selection State ---
  const [purchaseProductId, setPurchaseProductId] = useState<string | null>(null);

  // --- Decision Insight Panel State ---
  const [hasParsedQuery, setHasParsedQuery] = useState(false);
  const [lastParserSource, setLastParserSource] = useState<ParserSource>("fallback");
  const [lastOriginalQuery, setLastOriginalQuery] = useState("");

  // --- Agent Trace State ---
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [agentStatus, setAgentStatus] = useState<"running" | "completed" | "failed" | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);

  // --- Agent Result State ---
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null);
  const [useAgentResult, setUseAgentResult] = useState(false);

  // --- Review Intelligence State ---
  const [reviewIntelligence, setReviewIntelligence] = useState<Record<string, ProductReviewIntelligence>>({});

  const categoryConfig = useMemo(() => {
    const result = resolveCategoryConfig(category);
    if (!result) {
      // Fallback to first available category if resolved config is missing
      const fallback = resolveCategoryConfig(INITIAL_CATEGORIES[0].key);
      return fallback?.config ?? { category, label: category, attributes: [] };
    }
    return result.config;
  }, [category]);

  const preference: UserPreference = useMemo(
    () => ({
      category,
      budget,
      priorities,
      constraints,
    }),
    [category, budget, priorities, constraints]
  );

  const [catalog, setCatalog] = useState<Product[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchProducts({ category })
      .then((result) => {
        if (!cancelled) {
          setCatalog(result.products);
          setCatalogError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Failed to load products";
          setCatalogError(message);
          setCatalog([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [category]);

  const result = useMemo(() => {
    // Use server-side agent result when available and successful
    if (useAgentResult && agentResult?.decisionResult?.decisionResult) {
      return agentResult.decisionResult.decisionResult;
    }
    // Fallback: local decision execution
    return runDecision(catalog, preference, categoryConfig);
  }, [useAgentResult, agentResult, catalog, preference, categoryConfig]);

  const matrix = useMemo(
    () =>
      buildDecisionMatrix(
        result.scoredProducts.map((sp) => sp.product),
        categoryConfig.attributes,
        new Map(
          result.scoredProducts.map((sp) => [
            sp.product.id,
            Object.fromEntries(
              sp.contributions.map((c) => [c.attributeKey, c.normalizedValue])
            ),
          ])
        ),
        new Map(
          result.scoredProducts.map((sp) => [sp.product.id, sp.totalScore])
        )
      ),
    [result.scoredProducts, categoryConfig]
  );

  // --- Purchase Selection Validation ---
  const validatedPurchaseId = useMemo(
    () => validatePurchaseSelection(purchaseProductId, result.scoredProducts),
    [purchaseProductId, result.scoredProducts]
  );

  // Auto-select top product for inspection (prevents stale selections)
  const effectiveSelectedId = resolveEffectiveSelectedId(
    selectedProductId,
    result.scoredProducts
  );

  const selectedScored = result.scoredProducts.find(
    (sp) => sp.product.id === effectiveSelectedId
  );

  // Purchase selection scored product
  const purchaseScored = useMemo(
    () =>
      validatedPurchaseId
        ? result.scoredProducts.find((sp) => sp.product.id === validatedPurchaseId) ?? null
        : null,
    [validatedPurchaseId, result.scoredProducts]
  );

  // --- Decision Confidence for Purchase Selection ---
  const purchaseConfidence = useMemo(() => {
    if (!purchaseScored) return null;
    return calculateDecisionConfidence({
      selectedProduct: purchaseScored,
      allScoredProducts: result.scoredProducts,
      attributes: categoryConfig.attributes,
      priorities,
      budget: preference.budget,
    });
  }, [purchaseScored, result.scoredProducts, categoryConfig.attributes, priorities, preference.budget]);

  const purchaseWhyMatches = useMemo(() => {
    if (!purchaseScored || !purchaseConfidence) return [];
    return buildWhyMatches({
      selectedProduct: purchaseScored,
      allScoredProducts: result.scoredProducts,
      attributes: categoryConfig.attributes,
      priorities,
      budget: preference.budget,
    });
  }, [purchaseScored, purchaseConfidence, result.scoredProducts, categoryConfig.attributes, priorities, preference.budget]);

  const purchaseTradeOffNotes = useMemo(() => {
    if (!purchaseScored) return [];
    return buildTradeOffNotes(purchaseScored);
  }, [purchaseScored]);

  // Build priority labels for explanation
  const priorityLabels: Record<string, string> = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const p of priorities) {
      labels[p.attributeKey] =
        p.importance === 3 ? "High" : p.importance === 2 ? "Medium" : "Low";
    }
    return labels;
  }, [priorities]);

  // --- Handlers ---

  const handleAIParsed = useCallback(
    (intent: {
      category: string;
      budget?: { min?: number; max?: number };
      priorities: PriorityItem[];
      constraints: Constraint[];
      source: ParserSource;
      originalQuery: string;
      agentSteps?: AgentStep[];
      agentStatus?: "running" | "completed" | "failed";
      agentError?: string;
      agentResult?: AgentResult;
    }) => {
      setCategory(intent.category);

      if (intent.budget) {
        setBudget(intent.budget);
      }

      setPriorities(intent.priorities);
      setConstraints(intent.constraints);

      // Update Decision Insight Panel state
      setHasParsedQuery(true);
      setLastParserSource(intent.source);
      setLastOriginalQuery(intent.originalQuery);

      // Update Agent Trace state
      setAgentSteps(intent.agentSteps ?? []);
      setAgentStatus(intent.agentStatus ?? null);
      setAgentError(intent.agentError ?? null);

      // Store full agent result for server-side decision output
      const agent = intent.agentResult ?? null;
      setAgentResult(agent);
      setUseAgentResult(
        agent !== null &&
        agent.status === "completed" &&
        agent.decisionResult?.success === true
      );

      // Store review intelligence from agent result
      if (agent?.reviewAnalysisResult?.success) {
        setReviewIntelligence(agent.reviewAnalysisResult.reviews);
      } else {
        setReviewIntelligence({});
      }

      // Reset inspection selection
      setSelectedProductId(null);
      // Reset purchase selection
      setPurchaseProductId(null);
    },
    []
  );

  const handlePriorityChange = useCallback(
    (attributeKey: string, importance: number) => {
      setUseAgentResult(false);
      setPriorities((prev) => {
        const existing = prev.find((p) => p.attributeKey === attributeKey);
        if (existing) {
          return prev.map((p) =>
            p.attributeKey === attributeKey ? { ...p, importance } : p
          );
        }
        return [...prev, { attributeKey, importance }];
      });
    },
    []
  );

  const handleCategoryChange = useCallback(
    (newCategory: string) => {
      setUseAgentResult(false);
      setCategory(newCategory);
      setPriorities(buildDefaultPriorities(newCategory));
      setSelectedProductId(null);
      setConstraints([]);
      setPurchaseProductId(null);
      setBudget({ max: newCategory === "laptop" ? 60000 : DEFAULT_BUDGET_MAX });
    },
    []
  );

  // --- Purchase Selection Handler ---
  const handleSelectForPurchase = useCallback((productId: string) => {
    setPurchaseProductId(productId);
  }, []);

  const handleDeselectPurchase = useCallback(() => {
    setPurchaseProductId(null);
  }, []);

  const handleProceedToCheckout = useCallback(() => {
    // Phase 5B/5C will attach Razorpay order creation here
  }, []);

  const isEmpty = result.scoredProducts.length === 0;

  // --- Empty Result Handlers ---
  const handleApplySuggestion = useCallback(
    (suggestion: ConstraintRelaxationSuggestion) => {
      setUseAgentResult(false);
      if (suggestion.type === "budget" && suggestion.suggestedValue !== undefined) {
        if (suggestion.id === "budget-max") {
          setBudget((prev) => ({ ...prev, max: suggestion.suggestedValue }));
        } else if (suggestion.id === "budget-min") {
          setBudget((prev) => ({ ...prev, min: suggestion.suggestedValue }));
        }
      } else if (suggestion.type === "constraint" && suggestion.attributeKey && suggestion.suggestedValue !== undefined && suggestion.operator) {
        setConstraints((prev) => {
          const existing = prev.find(
            (c) => c.attributeKey === suggestion.attributeKey
          );
          if (existing) {
            return prev.map((c) =>
              c.attributeKey === suggestion.attributeKey
                ? { ...c, value: suggestion.suggestedValue, operator: suggestion.operator }
                : c
            );
          }
          return prev;
        });
      }
    },
    []
  );

  const handleViewProduct = useCallback(
    (productId: string) => {
      setSelectedProductId(productId);
      setShowManualControls(false);
    },
    []
  );

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header categoryLabel={categoryConfig.label} />

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
        {/* AI Query Input */}
        <div className="mb-6">
          <AIQueryInput
            currentCategory={category}
            currentPriorities={priorities}
            currentBudget={preference.budget}
            currentConstraints={constraints}
            onParsed={handleAIParsed}
          />
        </div>

        {/* Decision Insight Panel */}
        {hasParsedQuery && (
          <div className="mb-6">
            <DecisionInsightPanel
              categoryLabel={categoryConfig.label}
              budget={preference.budget}
              priorities={priorities}
              attributes={categoryConfig.attributes}
              parserSource={lastParserSource}
              originalQuery={lastOriginalQuery}
            />
          </div>
        )}

        {/* Agent Trace Panel */}
        {agentSteps.length > 0 && agentStatus && (
          <div className="mb-6">
            <AgentTracePanel
              steps={agentSteps}
              status={agentStatus}
              error={agentError ?? undefined}
            />
          </div>
        )}

        {/* Toggle Manual Controls */}
        <div className="mb-4">
          <button
            onClick={() => setShowManualControls(!showManualControls)}
            className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors flex items-center gap-1.5"
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform ${showManualControls ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
            {showManualControls ? "Hide" : "Show"} manual controls
          </button>
        </div>

        {/* Manual Controls (collapsible) */}
        {showManualControls && (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px] mb-8">
            <div className="space-y-6">
              <QueryInput
                preference={preference}
                categoryConfig={categoryConfig}
                onBudgetChange={(newMax) => {
                  setUseAgentResult(false);
                  setBudget((prev) => ({ ...prev, max: newMax }));
                }}
                onCategoryChange={handleCategoryChange}
                categories={INITIAL_CATEGORIES}
              />
              <PriorityControls
                attributes={categoryConfig.attributes}
                priorities={priorities}
                onPriorityChange={handlePriorityChange}
              />
            </div>

            <div className="space-y-6">
              {selectedScored && (
                <BestMatchCard
                  scoredProduct={selectedScored}
                  attributes={categoryConfig.attributes}
                />
              )}
            </div>
          </div>
        )}

        {/* Best Match (always visible) */}
        {!showManualControls && selectedScored && (
          <div className="mb-8 max-w-md">
            <BestMatchCard
              scoredProduct={selectedScored}
              attributes={categoryConfig.attributes}
            />
          </div>
        )}

        {/* Catalog Error */}
        {catalogError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 mb-6">
            <p className="text-sm text-red-700">
              Unable to load products: {catalogError}
            </p>
            <p className="text-xs text-red-500 mt-1">
              Please try again or check your connection.
            </p>
          </div>
        )}

        {/* Empty State */}
        {isEmpty && !catalogError && result.emptyResultAnalysis && (
          <EmptyResultPanel
            analysis={result.emptyResultAnalysis}
            onApplySuggestion={handleApplySuggestion}
            onViewProduct={handleViewProduct}
            relaxationResult={
              useAgentResult
                ? agentResult?.relaxationResult?.result
                : undefined
            }
          />
        )}
        {isEmpty && !catalogError && !result.emptyResultAnalysis && (
          <div className="bg-white rounded-2xl border border-zinc-200 p-12 text-center shadow-sm">
            <p className="text-zinc-400 text-sm">
              No products match your criteria. Try adjusting your budget or priorities.
            </p>
          </div>
        )}

        {/* Results */}
        {!isEmpty && (
          <div className="space-y-8">
            {/* Ranked Products */}
            <RankedProducts
              scoredProducts={result.scoredProducts}
              selectedId={effectiveSelectedId}
              onSelect={setSelectedProductId}
              purchaseId={validatedPurchaseId}
            />

            {/* Explanation */}
            {selectedScored && (
              <ExplanationPanel
                scoredProduct={selectedScored}
                attributes={categoryConfig.attributes}
                userPriorityLabels={priorityLabels}
                isPurchaseSelected={selectedScored.product.id === validatedPurchaseId}
                onSelectForPurchase={handleSelectForPurchase}
              />
            )}

            {/* Review Intelligence */}
            {selectedScored && reviewIntelligence[selectedScored.product.id] && (
              <ReviewIntelligencePanel
                review={reviewIntelligence[selectedScored.product.id]}
              />
            )}

            {/* Decision Summary (shown when purchase is selected) */}
            {purchaseScored && purchaseConfidence && (
              <DecisionSummary
                scoredProduct={purchaseScored}
                confidence={purchaseConfidence}
                whyMatches={purchaseWhyMatches}
                tradeOffNotes={purchaseTradeOffNotes}
                onDeselect={handleDeselectPurchase}
              />
            )}

            {/* Checkout Readiness (shown when purchase is selected) */}
            {purchaseScored && purchaseConfidence && (
              <CheckoutReadiness
                key={purchaseScored.product.id}
                scoredProduct={purchaseScored}
                confidence={purchaseConfidence}
                onProceedToCheckout={handleProceedToCheckout}
              />
            )}

            {/* Compare Top Choices Toggle */}
            {result.scoredProducts.length >= 2 && (
              <div className="flex justify-center">
                <button
                  onClick={() => setShowComparison(!showComparison)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-zinc-200 text-sm font-medium text-zinc-700 hover:border-zinc-300 hover:text-zinc-900 hover:shadow-sm transition-all shadow-sm"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                  {showComparison ? "Hide" : "Compare"} Top {Math.min(result.scoredProducts.length, 3)}
                </button>
              </div>
            )}

            {/* Comparison Panel */}
            {showComparison && result.scoredProducts.length >= 2 && (
              <CompareTopProducts
                scoredProducts={result.scoredProducts}
                attributes={categoryConfig.attributes}
                priorities={priorities}
                budget={preference.budget}
                agentComparisonResult={
                  useAgentResult
                    ? (agentResult?.comparisonResult?.comparison ?? null)
                    : null
                }
              />
            )}

            {/* Trade-offs */}
            <TradeOffSection tradeOffs={result.tradeOffs} />

            {/* Decision Matrix */}
            <DecisionMatrix matrix={matrix} />
          </div>
        )}
      </main>
    </div>
  );
}
