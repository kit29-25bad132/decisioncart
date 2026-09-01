"use client";

import type { ScoredProduct, AttributeConfig } from "@/types";
import { ProductVisual } from "./ProductVisual";

interface BestMatchCardProps {
  scoredProduct: ScoredProduct;
  attributes: AttributeConfig[];
}

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  high: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  medium: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  low: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  unknown: { bg: "bg-zinc-50", text: "text-zinc-500", dot: "bg-zinc-400" },
};

export function BestMatchCard({ scoredProduct, attributes }: BestMatchCardProps) {
  const { product, totalScore, strengths, weaknesses, dataConfidence, contributions, missingAttributes } =
    scoredProduct;
  const confStyle = CONFIDENCE_STYLES[dataConfidence];

  // Top contributing attributes
  const topContributions = contributions
    .filter((c) => c.available && c.weight > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3);

  return (
    <div className="bg-white rounded-2xl border-2 border-zinc-900 p-6 shadow-lg relative overflow-hidden">
      {/* Badge */}
      <div className="absolute top-0 right-0 bg-zinc-900 text-white text-xs font-semibold px-4 py-1.5 rounded-bl-xl">
        Best Match
      </div>

      <div className="pt-2">
        {/* Product Visual + Name */}
        <div className="flex items-center gap-3 mb-2">
          <ProductVisual category={product.category} brand={product.brand} size="lg" />
          <div>
            <p className="text-xs font-medium text-zinc-400 mb-0.5">{product.brand}</p>
            <h3 className="text-xl font-semibold text-zinc-900">
              {product.name}
            </h3>
          </div>
        </div>

        {/* Score & Price Row */}
        <div className="flex items-baseline gap-4 mb-5">
          <div>
            <span className="text-3xl font-bold text-zinc-900">{totalScore}</span>
            <span className="text-sm text-zinc-400 ml-1">/ 100</span>
          </div>
          <div className="text-lg font-semibold text-zinc-700">
            ₹{product.price.toLocaleString()}
          </div>
        </div>

        {/* Confidence */}
        <div
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${confStyle.bg} ${confStyle.text} mb-5`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${confStyle.dot}`} />
          Data confidence: {dataConfidence}
        </div>

        {/* Why #1 — Compact Summary */}
        {topContributions.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wide">
              Why it ranked first
            </p>
            <div className="space-y-1.5">
              {topContributions.slice(0, 2).map((c, i) => {
                return (
                  <div
                    key={c.attributeKey}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="text-zinc-400 text-xs font-mono w-4">
                      {i + 1}.
                    </span>
                    <span className="text-zinc-700 font-medium">
                      {c.label}
                    </span>
                    <span className="text-zinc-400 text-xs">
                      — strongest contribution
                    </span>
                  </div>
                );
              })}
              <p className="text-xs text-zinc-400 mt-1">
                Decision weight: {Math.round(topContributions[0].weight * 100)}%
                {' · '}Normalized: {Math.round(topContributions[0].normalizedValue * 100)}/100
              </p>
            </div>
          </div>
        )}

        {/* Strengths & Weaknesses */}
        <div className="grid grid-cols-2 gap-4">
          {strengths.length > 0 && (
            <div>
              <p className="text-xs font-medium text-emerald-600 mb-1">Strengths</p>
              <ul className="text-sm text-zinc-600 space-y-0.5">
                {strengths.map((s) => (
                  <li key={s}>+ {s}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
              <p className="text-xs font-medium text-amber-600 mb-1">Trade-offs</p>
              {weaknesses.length > 0 ? (
                <ul className="text-sm text-zinc-600 space-y-0.5">
                  {weaknesses.map((w) => (
                    <li key={w}>− {w}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-400 italic">
                  No significant trade-offs based on your current priorities.
                </p>
              )}
            </div>
        </div>

        {missingAttributes.length > 0 && (
          <div className="mt-4 text-xs text-zinc-400">
            Missing data:{" "}
            {missingAttributes
              .map((attrKey: string) => {
                const attr = attributes.find((a) => a.key === attrKey);
                return attr?.label ?? attrKey;
              })
              .join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}
