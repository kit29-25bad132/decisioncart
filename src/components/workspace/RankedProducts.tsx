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
      <h2 className="text-sm font-medium text-zinc-400 mb-1 tracking-wide uppercase">
        Ranked Products
      </h2>
      <p className="text-xs text-zinc-400 mb-5">
        Click a product to see detailed explanation
      </p>

      <div className="space-y-3">
        {scoredProducts.map((sp) => {
          const isSelected = sp.product.id === selectedId;
          const isPurchaseSelected = sp.product.id === purchaseId;
          const isTop = sp.rank === 1;

          return (
            <button
              key={sp.product.id}
              onClick={() => onSelect(sp.product.id)}
              className={`w-full text-left p-4 rounded-xl transition-all border ${
                isSelected
                  ? "border-zinc-900 bg-zinc-50 shadow-sm"
                  : "border-zinc-100 hover:border-zinc-300 hover:bg-zinc-50/50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <ProductVisual category={sp.product.category} brand={sp.product.brand} size="sm" className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        isTop
                          ? "bg-zinc-900 text-white"
                          : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {sp.rank}
                    </span>
                    <span className="text-xs text-zinc-400">{sp.product.brand}</span>
                    {isPurchaseSelected && (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                        Selected
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-zinc-900 text-sm truncate">
                    {sp.product.name}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-zinc-500">
                      ₹{sp.product.price.toLocaleString()}
                    </span>
                    <span className="text-xs text-zinc-300">·</span>
                    <span className="text-xs font-mono text-zinc-500">
                      Score: {sp.totalScore}
                    </span>
                  </div>
                </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-lg font-bold text-zinc-900">
                    {sp.totalScore}
                  </div>
                  <div className="text-xs text-zinc-400">/ 100</div>
                </div>
              </div>

              {/* Mini strengths */}
              {sp.strengths.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {sp.strengths.slice(0, 2).map((s) => (
                    <span
                      key={s}
                      className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full"
                    >
                      +{s}
                    </span>
                  ))}
                  {sp.weaknesses.slice(0, 1).map((w) => (
                    <span
                      key={w}
                      className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full"
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
