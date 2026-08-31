"use client";

import { useState, useMemo, useCallback } from "react";
import type { UserPreference, PriorityItem, Constraint, ParserSource, ConstraintRelaxationSuggestion } from "@/types";
import { runDecision, buildDecisionMatrix } from "@/engine/decision-engine";
import { calculateDecisionConfidence, buildWhyMatches, buildTradeOffNotes } from "@/engine/decision-confidence";
import { validatePurchaseSelection } from "@/engine/purchase-selection";
import { getCategoryConfig } from "@/catalog/categories";
import { getCatalog } from "@/catalog/demo-data";
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

const DEFAULT_BUDGET = 35000;
const INITIAL_CATEGORIES = [
  { key: "smartphone", label: "Smartphone" },
  { key: "laptop", label: "Laptop" },
];

function buildDefaultPriorities(category: string): PriorityItem[] {
  const config = getCategoryConfig(category);
  if (!config) return [];
  return config.attributes.map((attr) => ({
    attributeKey: attr.key,
    importance: 2, // default to Medium
  }));
}

export function DecisionWorkspace() {
  const [category, setCategory] = useState("smartphone");
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [priorities, setPriorities] = useState<PriorityItem[]>(
    buildDefaultPriorities("smartphone")
  );
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [showManualControls, setShowManualControls] = useState(false);

  // --- Phase 5A: Purchase Selection State ---
  const [purchaseProductId, setPurchaseProductId] = useState<string | null>(null);

  // --- Decision Insight Panel State ---
  const [hasParsedQuery, setHasParsedQuery] = useState(false);
  const [lastParserSource, setLastParserSource] = useState<ParserSource>("fallback");
  const [lastOriginalQuery, setLastOriginalQuery] = useState("");

  const categoryConfig = useMemo(() => getCategoryConfig(category)!, [category]);

  const preference: UserPreference = useMemo(
    () => ({
      category,
      budget: { max: budget },
      priorities,
      constraints,
    }),
    [category, budget, priorities, constraints]
  );

  const catalog = useMemo(() => getCatalog(category), [category]);

  const result = useMemo(
    () => runDecision(catalog, preference, categoryConfig),
    [catalog, preference, categoryConfig]
  );

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
        )
      ),
    [result.scoredProducts, categoryConfig]
  );

  // --- Purchase Selection Validation ---
  // INVARIANT: purchaseProductId must always be null or in current scoredProducts.
  const validatedPurchaseId = useMemo(
    () => validatePurchaseSelection(purchaseProductId, result.scoredProducts),
    [purchaseProductId, result.scoredProducts]
  );

  // Clear checkout request when purchase selection becomes invalid
  // CheckoutReadiness manages its own internal checkout state

  // Auto-select top product for inspection
  const effectiveSelectedId =
    selectedProductId ??
    (result.scoredProducts.length > 0
      ? result.scoredProducts[0].product.id
      : null);

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
    }) => {
      setCategory(intent.category);

      if (intent.budget?.max) {
        setBudget(intent.budget.max);
      }

      // Use priorities directly from the parse result.
      // The parse dispatcher (parseShoppingQuery) already handles refinement
      // merging, so returned priorities reflect the effective preference state.
      setPriorities(intent.priorities);

      // Constraints: the merge logic in parseShoppingQuery already handles
      // preserving existing constraints during refinement.
      setConstraints(intent.constraints);

      // Update Decision Insight Panel state
      setHasParsedQuery(true);
      setLastParserSource(intent.source);
      setLastOriginalQuery(intent.originalQuery);

      // Reset inspection selection
      setSelectedProductId(null);
      // Reset purchase selection (new query may change results)
      setPurchaseProductId(null);
    },
    []
  );

  const handlePriorityChange = useCallback(
    (attributeKey: string, importance: number) => {
      setPriorities((prev) => {
        const existing = prev.find((p) => p.attributeKey === attributeKey);
        if (existing) {
          return prev.map((p) =>
            p.attributeKey === attributeKey ? { ...p, importance } : p
          );
        }
        return [...prev, { attributeKey, importance }];
      });
      // NOTE: Priority changes do NOT automatically invalidate purchase selection
      // if the product remains eligible. This is intentional per spec.
      // The validatedPurchaseId useMemo handles eligibility check.
    },
    []
  );

  const handleCategoryChange = useCallback(
    (newCategory: string) => {
      setCategory(newCategory);
      setPriorities(buildDefaultPriorities(newCategory));
      setSelectedProductId(null);
      setConstraints([]);
      setPurchaseProductId(null);
      if (newCategory === "laptop") setBudget(60000);
      else setBudget(DEFAULT_BUDGET);
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
      if (suggestion.type === "budget") {
        if (suggestion.attributeKey === undefined && suggestion.suggestedValue !== undefined) {
          // Budget suggestion
          if (suggestion.id === "budget-max") {
            setBudget(suggestion.suggestedValue);
          } else if (suggestion.id === "budget-min") {
            // For min budget, we still set budget to the suggested value
            setBudget(suggestion.suggestedValue);
          }
        }
      } else if (suggestion.type === "constraint" && suggestion.attributeKey && suggestion.suggestedValue !== undefined && suggestion.operator) {
        // Constraint suggestion — update the constraint
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

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
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

        {/* Toggle Manual Controls */}
        <div className="mb-6">
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
                onBudgetChange={(newBudget) => {
                  setBudget(newBudget);
                  // Budget changes may invalidate purchase selection
                  // (validatedPurchaseId useMemo handles this)
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

        {/* Empty State */}
        {isEmpty && result.emptyResultAnalysis && (
          <EmptyResultPanel
            analysis={result.emptyResultAnalysis}
            onApplySuggestion={handleApplySuggestion}
            onViewProduct={handleViewProduct}
          />
        )}
        {isEmpty && !result.emptyResultAnalysis && (
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
