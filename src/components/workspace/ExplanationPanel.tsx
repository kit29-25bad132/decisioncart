"use client";

import type { ScoredProduct, AttributeConfig } from "@/types";

interface ExplanationPanelProps {
  scoredProduct: ScoredProduct;
  attributes: AttributeConfig[];
  userPriorityLabels: Record<string, string>;
  /** Whether this product is already purchase-selected. */
  isPurchaseSelected?: boolean;
  /** Handler for explicit purchase selection. */
  onSelectForPurchase?: (productId: string) => void;
}

/**
 * Format contribution value to a human-readable points string.
 * Uses enough precision to show small but real contributions
 * without misleading false-zero display.
 */
function formatContributionPoints(contribution: number): string {
  const points = contribution * 100;
  if (points === 0) return "0";
  if (points < 0.1) return points.toFixed(2);
  if (points < 10) return points.toFixed(1);
  return points.toFixed(1);
}

/**
 * Format weight as a human-readable percentage string.
 */
function formatWeightPercent(weight: number): string {
  const pct = weight * 100;
  if (pct < 0.1) return "<0.1%";
  if (pct < 1) return pct.toFixed(1) + "%";
  return Math.round(pct) + "%";
}

export function ExplanationPanel({
  scoredProduct,
  attributes,
  userPriorityLabels,
  isPurchaseSelected,
  onSelectForPurchase,
}: ExplanationPanelProps) {
  const { contributions, product, totalScore } = scoredProduct;

  const sorted = [...contributions]
    .filter((c) => c.weight > 0)
    .sort((a, b) => b.contribution - a.contribution);

  if (sorted.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-zinc-800">
            Why This Ranking?
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Transparent breakdown of how {scoredProduct.product.name} was scored
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {sorted.map((c) => {
          const normPct = Math.round(c.normalizedValue * 100);
          const priorityLabel = userPriorityLabels[c.attributeKey] ?? "Low";
          const attrUnit = attributes.find((a) => a.key === c.attributeKey)?.unit;

          return (
            <div
              key={c.attributeKey}
              className="border-b border-zinc-50 pb-5 last:border-0 last:pb-0"
            >
              {/* Header: attribute name + contribution points */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-zinc-800">
                  {c.label}
                </span>
                <span className="text-xs font-mono text-zinc-500 bg-zinc-50 px-2 py-0.5 rounded-md border border-zinc-100">
                  +{formatContributionPoints(c.contribution)} pts
                </span>
              </div>

              {/* 4-Column Grid: Priority, Performance, Normalized, Decision Weight */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
                <div className="bg-zinc-50 rounded-lg p-2.5">
                  <p className="text-zinc-400 mb-0.5 text-[10px] uppercase tracking-wider">Decision Weight</p>
                  <p className="font-semibold text-zinc-700">
                    {formatWeightPercent(c.weight)}
                  </p>
                </div>
                <div className="bg-zinc-50 rounded-lg p-2.5">
                  <p className="text-zinc-400 mb-0.5 text-[10px] uppercase tracking-wider">Product Performance</p>
                  <p className="font-semibold text-zinc-700">
                    {c.available
                      ? typeof c.rawValue === "number"
                        ? `${c.rawValue.toLocaleString()}${attrUnit ? ` ${attrUnit}` : ""}`
                        : String(c.rawValue)
                      : "Unknown"}
                  </p>
                </div>
                <div className="bg-zinc-50 rounded-lg p-2.5">
                  <p className="text-zinc-400 mb-0.5 text-[10px] uppercase tracking-wider">Normalized</p>
                  <p className="font-semibold text-zinc-700">{normPct}/100</p>
                </div>
                <div className="bg-zinc-50 rounded-lg p-2.5">
                  <p className="text-zinc-400 mb-0.5 text-[10px] uppercase tracking-wider">Your Priority</p>
                  <p className="font-semibold text-zinc-700">{priorityLabel}</p>
                </div>
              </div>

              {/* Progress bar = normalized performance (clearly labeled) */}
              <div>
                <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
                  <span>Normalized performance</span>
                  <span className="font-mono">{normPct}/100</span>
                </div>
                <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-zinc-800 h-1.5 rounded-full animate-progress-fill"
                    style={{ width: `${normPct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Score Breakdown Summary */}
      <div className="mt-6 pt-5 border-t border-zinc-100">
        <p className="text-[11px] font-medium text-zinc-400 mb-3 uppercase tracking-wider">
          Score Breakdown
        </p>
        <div className="space-y-1.5">
          {sorted.map((c) => {
            const points = c.contribution * 100;
            return (
              <div
                key={c.attributeKey}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-zinc-600">{c.label}</span>
                <span className="font-mono text-zinc-500">
                  {points === 0 ? "—" : `+${formatContributionPoints(c.contribution)}`}
                </span>
              </div>
            );
          })}
          <div className="flex items-center justify-between text-xs font-semibold pt-2 border-t border-zinc-100">
            <span className="text-zinc-700">Final Decision Score</span>
            <span className="font-mono text-zinc-900 text-sm">
              {totalScore} / 100
            </span>
          </div>
        </div>
      </div>

      {/* Select This Product Action */}
      {onSelectForPurchase && (
        <div className="mt-6 pt-4 border-t border-zinc-100">
          {isPurchaseSelected ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 px-4 py-3 rounded-xl border border-emerald-100">
              <svg
                className="w-4 h-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Selected for purchase — scroll down to proceed
            </div>
          ) : (
            <button
              onClick={() => onSelectForPurchase(product.id)}
              className="w-full px-4 py-3 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 active:bg-zinc-950 transition-all shadow-sm"
            >
              Select This Product
            </button>
          )}
        </div>
      )}
    </div>
  );
}
