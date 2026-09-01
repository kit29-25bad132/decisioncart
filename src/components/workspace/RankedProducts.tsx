"use client";

import type { ScoredProduct } from "@/types";
import { ProductVisual } from "./ProductVisual";

interface RankedProductsProps {
  scoredProducts: ScoredProduct[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** ID of the product explicitly chosen for purchase. */
  purchaseId: string | null;
}

export function RankedProducts({
  scoredProducts,
  selectedId,
  onSelect,
  purchaseId,
}: RankedProductsProps) {
  if (scoredProducts.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-zinc-800">
            Ranked Products
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Click to see why each product scored the way it did
          </p>
        </div>
        <span className="text-xs text-zinc-400 bg-zinc-50 px-2.5 py-1 rounded-full border border-zinc-100">
          {scoredProducts.length} products
        </span>
      </div>

      <div className="space-y-2">
        {scoredProducts.map((sp) => {
          const isSelected = sp.product.id === selectedId;
          const isPurchaseSelected = sp.product.id === purchaseId;
          const isTop = sp.rank === 1;

          // Score bar width relative to the top score
          const topScore = scoredProducts[0]?.totalScore ?? 100;
          const barWidth = Math.round((sp.totalScore / topScore) * 100);

          return (
            <button
              key={sp.product.id}
              onClick={() => onSelect(sp.product.id)}
              className={`w-full text-left p-4 rounded-xl transition-all duration-200 border ${
                isSelected
                  ? "border-zinc-900 bg-zinc-50 shadow-sm"
                  : "border-zinc-100 hover:border-zinc-300 hover:bg-zinc-50/50 hover:shadow-sm"
              }`}
              aria-label={`${sp.product.name}, ranked #${sp.rank}, score ${sp.totalScore} out of 100`}
              aria-pressed={isSelected}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <ProductVisual category={sp.product.category} brand={sp.product.brand} size="sm" className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          isTop
                            ? "bg-zinc-900 text-white"
                            : "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {sp.rank}
                      </span>
                      <span className="text-xs text-zinc-400">{sp.product.brand}</span>
                      {isPurchaseSelected && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                          Selected
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-zinc-900 text-sm truncate">
                      {sp.product.name}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs text-zinc-500 font-medium">
                        ₹{sp.product.price.toLocaleString()}
                      </span>
                      <div className="flex-1 max-w-[120px]">
                        <div className="w-full bg-zinc-100 rounded-full h-1">
                          <div
                            className={`h-1 rounded-full transition-all duration-500 ${
                              isTop ? "bg-zinc-900" : "bg-zinc-300"
                            }`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-xl font-bold text-zinc-900 tabular-nums">
                    {sp.totalScore}
                  </div>
                  <div className="text-[10px] text-zinc-400 font-medium">/ 100</div>
                </div>
              </div>

              {/* Mini strengths */}
              {sp.strengths.length > 0 && (
                <div className="mt-2.5 ml-9 flex flex-wrap gap-1">
                  {sp.strengths.slice(0, 2).map((s) => (
                    <span
                      key={s}
                      className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-100/50"
                    >
                      +{s}
                    </span>
                  ))}
                  {sp.weaknesses.slice(0, 1).map((w) => (
                    <span
                      key={w}
                      className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-100/50"
                    >
                      −{w}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
