"use client";

import type { ProductReviewIntelligence } from "@/reviews/types";

interface ReviewIntelligencePanelProps {
  review: ProductReviewIntelligence;
}

const SENTIMENT_STYLES: Record<
  string,
  { bg: string; text: string; label: string; emoji: string }
> = {
  very_positive: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    label: "Very Positive",
    emoji: "😊",
  },
  positive: {
    bg: "bg-emerald-50",
    text: "text-emerald-600",
    label: "Positive",
    emoji: "👍",
  },
  mixed: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    label: "Mixed",
    emoji: "😐",
  },
  negative: {
    bg: "bg-red-50",
    text: "text-red-700",
    label: "Negative",
    emoji: "👎",
  },
};

export function ReviewIntelligencePanel({
  review,
}: ReviewIntelligencePanelProps) {
  const sentimentStyle = SENTIMENT_STYLES[review.overallSentiment];

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-800">
            Review Intelligence
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Structured review analysis from aggregated user feedback
          </p>
        </div>
        <div
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${sentimentStyle.bg} ${sentimentStyle.text}`}
        >
          <span>{sentimentStyle.emoji}</span>
          {sentimentStyle.label}
        </div>
      </div>

      {/* Sentiment Score Bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1.5">
          <span>Sentiment Score</span>
          <span className="font-mono font-medium text-zinc-600">
            {review.sentimentScore}/100
          </span>
        </div>
        <div className="w-full bg-zinc-100 rounded-full h-2 overflow-hidden">
          <div
            className="h-2 rounded-full transition-all duration-500"
            style={{
              width: `${review.sentimentScore}%`,
              backgroundColor:
                review.sentimentScore >= 75
                  ? "#22c55e"
                  : review.sentimentScore >= 50
                    ? "#f59e0b"
                    : "#ef4444",
            }}
          />
        </div>
      </div>

      {/* Summary */}
      <p className="text-sm text-zinc-600 leading-relaxed mb-5">
        {review.summary}
      </p>

      {/* Strengths & Concerns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* What Users Love */}
        {review.strengths.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-emerald-600 mb-2.5 uppercase tracking-wider">
              What users love
            </p>
            <ul className="space-y-2">
              {review.strengths.map((s) => (
                <li
                  key={s.attributeKey}
                  className="flex items-start gap-2 text-sm text-zinc-600"
                >
                  <span className="text-emerald-500 mt-0.5 shrink-0">
                    ✓
                  </span>
                  <span>{s.description}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Common Concerns */}
        {review.concerns.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-amber-600 mb-2.5 uppercase tracking-wider">
              Common concerns
            </p>
            <ul className="space-y-2">
              {review.concerns.map((c) => (
                <li
                  key={c.attributeKey}
                  className="flex items-start gap-2 text-sm text-zinc-600"
                >
                  <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
                  <span>{c.description}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Confidence */}
      <div className="mt-4 pt-3 border-t border-zinc-100">
        <span className="text-[10px] text-zinc-400 uppercase tracking-wider">
          Analysis confidence: {review.confidence}
        </span>
      </div>
    </div>
  );
}
