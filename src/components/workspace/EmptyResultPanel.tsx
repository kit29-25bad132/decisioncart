"use client";

import type {
  EmptyResultAnalysis,
  ConstraintRelaxationSuggestion,
  ClosestMatch,
} from "@/types";

interface EmptyResultPanelProps {
  analysis: EmptyResultAnalysis;
  onApplySuggestion: (suggestion: ConstraintRelaxationSuggestion) => void;
  onViewProduct: (productId: string) => void;
}

export function EmptyResultPanel({
  analysis,
  onApplySuggestion,
  onViewProduct,
}: EmptyResultPanelProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-8 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <svg
              className="w-5 h-5 text-amber-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-900">
              No Exact Match Found
            </h3>
            <p className="text-sm text-zinc-500 mt-1">{analysis.reason}</p>
          </div>
        </div>

        {/* Failed Requirements */}
        {analysis.failedRequirements.length > 0 && (
          <div className="mt-6 pt-4 border-t border-zinc-100">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
              Your strict requirements
            </p>
            <div className="flex flex-wrap gap-2">
              {analysis.failedRequirements.map((req, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-medium"
                >
                  <svg
                    className="w-3 h-3 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  {req.description}
                  <span className="text-red-400 font-normal">
                    ({req.excludedProductCount} excluded)
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Why section */}
        {analysis.failedRequirements.length > 1 && (
          <div className="mt-4 pt-4 border-t border-zinc-100">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
              Why no products matched
            </p>
            <div className="space-y-1.5">
              {analysis.failedRequirements.slice(0, 3).map((req, i) => (
                <p key={i} className="text-sm text-zinc-600">
                  {i === 0
                    ? `${req.description} is the most restrictive — it eliminated ${req.excludedProductCount} products.`
                    : `${req.description} also eliminated additional products.`}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Relaxation Suggestions */}
      {analysis.suggestions.length > 0 && (
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
          <h3 className="text-sm font-medium text-zinc-900 mb-4">
            Try one of these adjustments
          </h3>
          <div className="space-y-3">
            {analysis.suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onApply={onApplySuggestion}
              />
            ))}
          </div>
        </div>
      )}

      {/* Closest Matches */}
      {analysis.closestMatches.length > 0 && (
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
          <h3 className="text-sm font-medium text-zinc-900 mb-4">
            Closest Matches
          </h3>
          <div className="space-y-3">
            {analysis.closestMatches.map((match) => (
              <ClosestMatchCard
                key={match.product.id}
                match={match}
                onView={onViewProduct}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function SuggestionCard({
  suggestion,
  onApply,
}: {
  suggestion: ConstraintRelaxationSuggestion;
  onApply: (s: ConstraintRelaxationSuggestion) => void;
}) {
  return (
    <button
      onClick={() => onApply(suggestion)}
      className="w-full text-left p-4 rounded-xl border border-zinc-100 hover:border-zinc-300 hover:bg-zinc-50 transition-all group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900 group-hover:text-zinc-950">
            {suggestion.title}
          </p>
          <p className="text-xs text-zinc-500 mt-1">{suggestion.explanation}</p>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
            +{suggestion.matchingProductCount}
          </span>
          <svg
            className="w-4 h-4 text-zinc-300 group-hover:text-zinc-500 transition-colors"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </div>
    </button>
  );
}

function ClosestMatchCard({
  match,
  onView,
}: {
  match: ClosestMatch;
  onView: (id: string) => void;
}) {
  const progressPct =
    match.totalRequirements > 0
      ? Math.round((match.metRequirements / match.totalRequirements) * 100)
      : 0;

  return (
    <div className="p-4 rounded-xl border border-zinc-100">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900 truncate">
            {match.product.name}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Meets {match.metRequirements} of {match.totalRequirements}{" "}
            requirements
          </p>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 bg-zinc-100 rounded-full overflow-hidden w-32">
            <div
              className="h-full bg-amber-400 rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-700">
            ₹{match.product.price.toLocaleString()}
          </span>
          <button
            onClick={() => onView(match.product.id)}
            className="text-xs text-zinc-500 hover:text-zinc-900 underline underline-offset-2 transition-colors"
          >
            View
          </button>
        </div>
      </div>

      {/* Unmet details */}
      {match.unmetDetails.length > 0 && (
        <div className="mt-3 pt-3 border-t border-zinc-50">
          <p className="text-xs text-zinc-400 mb-1">Missing:</p>
          <div className="flex flex-wrap gap-1.5">
            {match.unmetDetails.map((detail, i) => (
              <span
                key={i}
                className="inline-flex items-center px-2 py-0.5 rounded bg-zinc-50 text-zinc-600 text-xs"
              >
                {detail.description}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
