"use client";

import { useMemo } from "react";
import type {
  ScoredProduct,
  AttributeConfig,
  PriorityItem,
} from "@/types";
import { ProductVisual } from "./ProductVisual";
import {
  compareTopProducts,
  type ComparisonResult,
  type AttributeComparison,
  type ComparedProduct,
} from "@/engine/compare-helpers";
import { calculateWeights } from "@/engine/decision-engine";

interface CompareTopProductsProps {
  scoredProducts: ScoredProduct[];
  attributes: AttributeConfig[];
  priorities: PriorityItem[];
  budget?: { min?: number; max?: number };
  /** Pre-computed comparison from server-side agent result. */
  agentComparisonResult?: ComparisonResult | null;
}

export function CompareTopProducts({
  scoredProducts,
  attributes,
  priorities,
  budget,
  agentComparisonResult,
}: CompareTopProductsProps) {
  const weights = useMemo(
    () => calculateWeights(priorities, attributes),
    [priorities, attributes]
  );

  const localComparison = useMemo<ComparisonResult | null>(
    () =>
      compareTopProducts(scoredProducts, attributes, priorities, weights, budget),
    [scoredProducts, attributes, priorities, weights, budget]
  );

  // Use agent-provided comparison when available, otherwise fall back to local
  const comparison = agentComparisonResult ?? localComparison;

  if (!comparison) return null;
  if (comparison.products.length < 2) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-800 mb-1">
          Compare Top Choices
        </h2>
        <p className="text-xs text-zinc-400 mb-5">
          Side-by-side comparison of the top {comparison.products.length} ranked products
        </p>

        {/* Comparison Table */}
        <ComparisonTable comparison={comparison} />
      </div>

      {/* Why Winner Wins */}
      <WhySection comparison={comparison} />

      {/* Best For Insights */}
      <BestForSection comparison={comparison} />

      {/* DecisionCart Insight */}
      <DecisionInsightSection comparison={comparison} />

      {/* Priority Sensitivity */}
      {comparison.prioritySensitivity.length > 0 && (
        <PrioritySensitivitySection comparison={comparison} />
      )}
    </div>
  );
}

// --- Comparison Table ---

function ComparisonTable({ comparison }: { comparison: ComparisonResult }) {
  const { products, attributes: attrComparisons } = comparison;

  return (
    <div className="overflow-x-auto -mx-6 px-6">
      <table className="w-full text-sm min-w-[600px]">
        <thead>
          <tr className="border-b border-zinc-100">
            <th className="text-left py-3 pr-4 text-[10px] font-medium text-zinc-400 uppercase tracking-wider sticky left-0 bg-white z-10 min-w-[140px]">
              Attribute
            </th>
            {products.map((p, i) => (
              <th
                key={p.product.id}
                className="text-center py-3 px-3 min-w-[130px]"
              >
                <div className="flex flex-col items-center gap-1.5">
                  <div className="flex items-center gap-2">
                    <ProductVisual
                      category={p.product.category}
                      brand={p.product.brand}
                      size="sm"
                    />
                    <span
                      className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                        i === 0
                          ? "bg-zinc-900 text-white"
                          : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {i + 1}
                    </span>
                  </div>
                  <span className="font-medium text-zinc-900 text-xs">
                    {p.product.name}
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    {p.product.brand}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Price row */}
          <tr className="border-b border-zinc-50">
            <td className="py-3 pr-4 text-[10px] font-medium text-zinc-400 uppercase tracking-wider sticky left-0 bg-white z-10">
              Price
            </td>
            {products.map((p) => (
              <td key={p.product.id} className="py-3 px-3 text-center">
                <span className="text-xs font-medium text-zinc-700">
                  ₹{p.product.price.toLocaleString()}
                </span>
              </td>
            ))}
          </tr>

          {/* Score row */}
          <tr className="border-b border-zinc-50">
            <td className="py-3 pr-4 text-[10px] font-medium text-zinc-400 uppercase tracking-wider sticky left-0 bg-white z-10">
              Decision Score
            </td>
            {products.map((p) => (
              <td key={p.product.id} className="py-3 px-3 text-center">
                <span className="text-sm font-bold text-zinc-900">
                  {p.score}
                </span>
                <span className="text-xs text-zinc-400 ml-0.5">/100</span>
              </td>
            ))}
          </tr>

          {/* Attribute rows */}
          {attrComparisons.map((ac) => (
            <AttributeRow key={ac.attributeKey} comparison={ac} products={products} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Attribute Row ---

function AttributeRow({
  comparison: ac,
  products,
}: {
  comparison: AttributeComparison;
  products: ComparedProduct[];
}) {
  const directionIcon =
    ac.comparisonDirection === "higher_is_better" ? "↑" : "↓";

  return (
    <tr className="border-b border-zinc-50 last:border-0">
      <td className="py-3 pr-4 sticky left-0 bg-white z-10">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-zinc-700">{ac.label}</span>
          <span className="text-[10px] text-zinc-300">{directionIcon}</span>
        </div>
        {ac.unit && (
          <span className="text-[10px] text-zinc-300">{ac.unit}</span>
        )}
      </td>
      {products.map((p) => {
        const val = ac.values.find((v) => v.productId === p.product.id);
        const isWinner = ac.winnerProductId === p.product.id;

        return (
          <td key={p.product.id} className="py-3 px-3 text-center">
            <CellValue value={val} isWinner={isWinner} attr={ac} />
          </td>
        );
      })}
    </tr>
  );
}

// --- Cell Value ---

function CellValue({
  value,
  isWinner,
  attr,
}: {
  value: AttributeComparison["values"][0] | undefined;
  isWinner: boolean;
  attr: AttributeComparison;
}) {
  if (!value || !value.available) {
    return (
      <span className="text-xs text-zinc-300">—</span>
    );
  }

  const display = formatAttrValue(value.rawValue, attr);
  const normPct =
    value.normalizedValue !== null ? Math.round(value.normalizedValue * 100) : null;

  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className={`text-xs font-medium ${
          isWinner ? "text-zinc-900" : "text-zinc-600"
        }`}
      >
        {display}
        {isWinner && (
          <span className="ml-1 text-emerald-600">✓</span>
        )}
      </span>
      {normPct !== null && (
        <div className="w-16 bg-zinc-100 rounded-full h-1">
          <div
            className={`h-1 rounded-full transition-all duration-500 ${
              isWinner ? "bg-zinc-800" : "bg-zinc-300"
            }`}
            style={{ width: `${normPct}%` }}
          />
        </div>
      )}
    </div>
  );
}

// --- Format Attribute Value ---

function formatAttrValue(
  raw: number | boolean | string | null,
  attr: AttributeComparison
): string {
  if (raw === null || raw === undefined) return "—";
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  if (typeof raw === "number") {
    if (attr.unit) return `${raw.toLocaleString()} ${attr.unit}`;
    return raw.toLocaleString();
  }
  return String(raw);
}

// --- Why Section ---

function WhySection({ comparison }: { comparison: ComparisonResult }) {
  const { winner, runnerUp, whyWinnerWins, whyChooseAlternatives } = comparison;

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-800 mb-5">
        Why This Ranking?
      </h2>

      {/* Winner */}
      <div className="mb-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-zinc-900 text-white text-[10px] font-bold">
            1
          </div>
          <span className="text-sm font-semibold text-zinc-900">
            {winner.product.name}
          </span>
          <span className="text-xs text-zinc-400">wins</span>
          <span className="text-xs font-mono text-zinc-400 ml-auto">
            {winner.score}/100
          </span>
        </div>
        <ul className="ml-8.5 space-y-2">
          {whyWinnerWins.reasons.map((reason, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
              <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
              {reason}
            </li>
          ))}
        </ul>
      </div>

      {/* Alternatives */}
      {runnerUp && whyChooseAlternatives[runnerUp.product.id] && (
        <div className="border-t border-zinc-100 pt-5">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-zinc-100 text-zinc-600 text-[10px] font-bold">
              2
            </div>
            <span className="text-sm font-semibold text-zinc-900">
              {runnerUp.product.name}
            </span>
            <span className="text-xs text-zinc-400">— why you might choose this</span>
            <span className="text-xs font-mono text-zinc-400 ml-auto">
              {runnerUp.score}/100
            </span>
          </div>
          <ul className="ml-8.5 space-y-2">
            {whyChooseAlternatives[runnerUp.product.id].reasons.map(
              (reason, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                  <span className="text-amber-500 mt-0.5 shrink-0">→</span>
                  {reason}
                </li>
              )
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// --- Best For Section ---

function BestForSection({ comparison }: { comparison: ComparisonResult }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-800 mb-4">
        Best For
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {comparison.bestForInsights.map((insight, i) => (
          <div
            key={insight.productId}
            className={`p-4 rounded-xl border ${
              i === 0 ? "border-zinc-900 bg-zinc-50" : "border-zinc-100"
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className={`w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center ${
                  i === 0
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {i + 1}
              </span>
              <p className="text-sm font-medium text-zinc-900">
                {insight.productName}
              </p>
            </div>
            <p className="text-xs text-zinc-500">{insight.insight}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Decision Insight Section ---

function DecisionInsightSection({
  comparison,
}: {
  comparison: ComparisonResult;
}) {
  return (
    <div className="bg-zinc-900 rounded-2xl p-6 text-white">
      <h2 className="text-[11px] font-medium text-zinc-400 mb-3 uppercase tracking-wider">
        DecisionCart Insight
      </h2>
      <p className="text-sm text-zinc-200 leading-relaxed">
        {comparison.decisionInsight}
      </p>
    </div>
  );
}

// --- Priority Sensitivity Section ---

function PrioritySensitivitySection({
  comparison,
}: {
  comparison: ComparisonResult;
}) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-800 mb-1">
        What If Your Priorities Change?
      </h2>
      <p className="text-xs text-zinc-400 mb-4">
        How the winner changes if a different attribute becomes your top priority
      </p>
      <div className="space-y-2">
        {comparison.prioritySensitivity.map((item) => (
          <div
            key={item.attributeKey}
            className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 border border-zinc-100 hover:border-zinc-200 transition-colors"
          >
            <span className="text-lg">{getAttrEmoji(item.attributeKey)}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-500">
                If <span className="font-medium text-zinc-700">{item.attributeLabel}</span> is most important
              </p>
            </div>
            <span className="text-xs font-medium text-zinc-900 shrink-0">
              → {item.winnerProductName}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Helpers ---

function getAttrEmoji(key: string): string {
  const map: Record<string, string> = {
    camera_score: "📷",
    battery_mah: "🔋",
    battery_hours: "🔋",
    display_inches: "🖥",
    ram_gb: "⚡",
    processor_score: "⚡",
    storage_gb: "💾",
    ssd_gb: "💾",
    five_g: "📶",
    weight_kg: "⚖",
  };
  return map[key] ?? "✦";
}
