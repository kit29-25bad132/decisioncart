"use client";

import type { ScoredProduct, AttributeConfig } from "@/types";

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
        {/* Product Name */}
        <p className="text-xs font-medium text-zinc-400 mb-1">{product.brand}</p>
        <h3 className="text-xl font-semibold text-zinc-900 mb-3">
          {product.name}
        </h3>

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

        {/* Why #1 */}
        {topContributions.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wide">
              Why it ranked first
            </p>
            <div className="space-y-2">
              {topContributions.map((c) => {
                const pct = Math.round(c.contribution * 100);
                return (
                  <div key={c.attributeKey}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-zinc-600">{c.label}</span>
                      <span className="font-mono text-zinc-500 text-xs">
                        {pct}% contribution
                      </span>
                    </div>
                    <div className="w-full bg-zinc-100 rounded-full h-1.5">
                      <div
                        className="bg-zinc-900 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(c.normalizedValue * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
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
          {weaknesses.length > 0 && (
            <div>
              <p className="text-xs font-medium text-amber-600 mb-1">Trade-offs</p>
              <ul className="text-sm text-zinc-600 space-y-0.5">
                {weaknesses.map((w) => (
                  <li key={w}>− {w}</li>
                ))}
              </ul>
            </div>
          )}
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
