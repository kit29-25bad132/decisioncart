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

export function ExplanationPanel({
  scoredProduct,
  attributes,
  userPriorityLabels,
  isPurchaseSelected,
  onSelectForPurchase,
}: ExplanationPanelProps) {
  const { contributions, product } = scoredProduct;

  const sorted = [...contributions]
    .filter((c) => c.weight > 0)
    .sort((a, b) => b.contribution - a.contribution);

  if (sorted.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
      <h2 className="text-sm font-medium text-zinc-400 mb-1 tracking-wide uppercase">
        Why This Ranking?
      </h2>
      <p className="text-xs text-zinc-400 mb-5">
        Transparent breakdown of how {scoredProduct.product.name} was scored
      </p>

      <div className="space-y-4">
        {sorted.map((c) => {
          const pct = Math.round(c.contribution * 100);
          const normPct = Math.round(c.normalizedValue * 100);
          const priorityLabel = userPriorityLabels[c.attributeKey] ?? "Low";

          return (
            <div key={c.attributeKey} className="border-b border-zinc-50 pb-4 last:border-0 last:pb-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-zinc-700">
                  {c.label}
                </span>
                <span className="text-xs font-mono text-zinc-500">
                  {pct}% of total score
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-zinc-400 mb-0.5">Your Priority</p>
                  <p className="font-medium text-zinc-700">{priorityLabel}</p>
                </div>
                <div>
                  <p className="text-zinc-400 mb-0.5">Product Performance</p>
                  <p className="font-medium text-zinc-700">
                    {c.available
                      ? typeof c.rawValue === "number"
                        ? `${c.rawValue.toLocaleString()}${attributes.find((a) => a.key === c.attributeKey)?.unit ? ` ${attributes.find((a) => a.key === c.attributeKey)!.unit}` : ""}`
                        : String(c.rawValue)
                      : "Unknown"}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-400 mb-0.5">Normalized</p>
                  <p className="font-medium text-zinc-700">{normPct}/100</p>
                </div>
              </div>

              <div className="mt-2 w-full bg-zinc-100 rounded-full h-1.5">
                <div
                  className="bg-zinc-800 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${normPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Select This Product Action */}
      {onSelectForPurchase && (
        <div className="mt-6 pt-4 border-t border-zinc-100">
          {isPurchaseSelected ? (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 px-4 py-2.5 rounded-xl">
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
              Selected for purchase
            </div>
          ) : (
            <button
              onClick={() => onSelectForPurchase(product.id)}
              className="w-full px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-all shadow-sm"
            >
              Select This Product
            </button>
          )}
        </div>
      )}
    </div>
  );
}
