"use client";

import { useState, useMemo, useCallback } from "react";
import type { UserPreference, PriorityItem } from "@/types";
import { runDecision, buildDecisionMatrix } from "@/engine/decision-engine";
import { getCategoryConfig } from "@/catalog/categories";
import { getCatalog } from "@/catalog/demo-data";
import { Header } from "./Header";
import { QueryInput } from "./QueryInput";
import { PriorityControls } from "./PriorityControls";
import { BestMatchCard } from "./BestMatchCard";
import { RankedProducts } from "./RankedProducts";
import { DecisionMatrix } from "./DecisionMatrix";
import { ExplanationPanel } from "./ExplanationPanel";
import { TradeOffSection } from "./TradeOffSection";

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
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const categoryConfig = useMemo(() => getCategoryConfig(category)!, [category]);

  const preference: UserPreference = useMemo(
    () => ({
      category,
      budget: { max: budget },
      priorities,
    }),
    [category, budget, priorities]
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

  // Auto-select top product
  const effectiveSelectedId =
    selectedProductId ??
    (result.scoredProducts.length > 0
      ? result.scoredProducts[0].product.id
      : null);

  const selectedScored = result.scoredProducts.find(
    (sp) => sp.product.id === effectiveSelectedId
  );

  // Build priority labels for explanation
  const priorityLabels: Record<string, string> = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const p of priorities) {
      labels[p.attributeKey] =
        p.importance === 3 ? "High" : p.importance === 2 ? "Medium" : "Low";
    }
    return labels;
  }, [priorities]);

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
    },
    []
  );

  const handleCategoryChange = useCallback(
    (newCategory: string) => {
      setCategory(newCategory);
      setPriorities(buildDefaultPriorities(newCategory));
      setSelectedProductId(null);
      // Reset budget for new category
      if (newCategory === "laptop") setBudget(60000);
      else setBudget(DEFAULT_BUDGET);
    },
    []
  );

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header categoryLabel={categoryConfig.label} />

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        {/* Top Controls */}
        <div className="grid gap-6 lg:grid-cols-[1fr_320px] mb-8">
          <div className="space-y-6">
            <QueryInput
              preference={preference}
              categoryConfig={categoryConfig}
              onBudgetChange={setBudget}
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

        {/* Empty State */}
        {result.scoredProducts.length === 0 && (
          <div className="bg-white rounded-2xl border border-zinc-200 p-12 text-center shadow-sm">
            <p className="text-zinc-400 text-sm">
              No products match your criteria. Try adjusting your budget or constraints.
            </p>
          </div>
        )}

        {/* Results */}
        {result.scoredProducts.length > 0 && (
          <div className="space-y-8">
            {/* Ranked Products */}
            <RankedProducts
              scoredProducts={result.scoredProducts}
              selectedId={effectiveSelectedId}
              onSelect={setSelectedProductId}
            />

            {/* Explanation */}
            {selectedScored && (
              <ExplanationPanel
                scoredProduct={selectedScored}
                attributes={categoryConfig.attributes}
                userPriorityLabels={priorityLabels}
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
