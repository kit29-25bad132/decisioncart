"use client";

import type { ScoredProduct, DecisionConfidence } from "@/types";

interface DecisionSummaryProps {
  scoredProduct: ScoredProduct;
  confidence: DecisionConfidence;
  whyMatches: string[];
  tradeOffNotes: string[];
  onDeselect: () => void;
}

const CONFIDENCE_STYLES: Record<
  string,
  { bg: string; text: string; bar: string; barBg: string }
> = {
  high: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    bar: "bg-emerald-500",
    barBg: "bg-emerald-100",
  },
  good: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    bar: "bg-blue-500",
    barBg: "bg-blue-100",
  },
  moderate: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    bar: "bg-amber-500",
    barBg: "bg-amber-100",
  },
  low: {
    bg: "bg-red-50",
    text: "text-red-700",
    bar: "bg-red-500",
    barBg: "bg-red-100",
  },
};

export function DecisionSummary({
  scoredProduct,
  confidence,
  whyMatches,
  tradeOffNotes,
  onDeselect,
}: DecisionSummaryProps) {
  const { product, totalScore, rank } = scoredProduct;
  const confStyle = CONFIDENCE_STYLES[confidence.level];

  return (
    <div className="bg-white rounded-2xl border-2 border-zinc-900 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-zinc-900 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
            Your Decision
          </p>
          <h3 className="text-lg font-semibold text-white mt-0.5">
            {product.name}
          </h3>
        </div>
        <button
          onClick={onDeselect}
          className="text-xs text-zinc-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500"
        >
          Change
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Product Details */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-zinc-50 rounded-xl p-3">
            <p className="text-[10px] text-zinc-400 mb-1 uppercase tracking-wider">Brand</p>
            <p className="text-sm font-semibold text-zinc-900">{product.brand}</p>
          </div>
          <div className="bg-zinc-50 rounded-xl p-3">
            <p className="text-[10px] text-zinc-400 mb-1 uppercase tracking-wider">Price</p>
            <p className="text-sm font-semibold text-zinc-900">
              ₹{product.price.toLocaleString()}
            </p>
          </div>
          <div className="bg-zinc-50 rounded-xl p-3">
            <p className="text-[10px] text-zinc-400 mb-1 uppercase tracking-wider">Score</p>
            <p className="text-sm font-semibold text-zinc-900">
              {totalScore}/100
            </p>
          </div>
          <div className="bg-zinc-50 rounded-xl p-3">
            <p className="text-[10px] text-zinc-400 mb-1 uppercase tracking-wider">Rank</p>
            <p className="text-sm font-semibold text-zinc-900">
              #{rank}
            </p>
          </div>
        </div>

        {/* Decision Confidence */}
        <div>
          <p className="text-[11px] font-medium text-zinc-400 mb-3 uppercase tracking-wider">
            Decision Confidence
          </p>
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 shrink-0">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  className={confStyle.barBg}
                  strokeWidth="3"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  className={confStyle.bar}
                  strokeWidth="3"
                  strokeDasharray={`${(confidence.score / 100) * 97.39} 97.39`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-zinc-900">
                {confidence.score}%
              </span>
            </div>
            <div>
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${confStyle.bg} ${confStyle.text}`}
              >
                {confidence.level.charAt(0).toUpperCase() +
                  confidence.level.slice(1)}{" "}
                Confidence
              </span>
              <p className="text-xs text-zinc-500 mt-1.5">
                {confidence.explanation}
              </p>
            </div>
          </div>
        </div>

        {/* Why This Matches */}
        {whyMatches.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-zinc-400 mb-3 uppercase tracking-wider">
              Why this matches you
            </p>
            <ul className="space-y-2">
              {whyMatches.map((reason, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-zinc-700">
                  <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Trade-offs */}
        {tradeOffNotes.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-zinc-400 mb-3 uppercase tracking-wider">
              Trade-offs
            </p>
            <ul className="space-y-2">
              {tradeOffNotes.map((note, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                  <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
                  {note}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
