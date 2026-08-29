"use client";

import { useState, useCallback } from "react";
import type { PriorityItem, Constraint } from "@/types";
import type { AIParseResult } from "@/lib/ai/types";

interface AIQueryInputProps {
  currentCategory: string;
  currentPriorities: PriorityItem[];
  currentBudget?: { min?: number; max?: number };
  onParsed: (intent: {
    category: string;
    budget?: { min?: number; max?: number };
    priorities: PriorityItem[];
    constraints: Constraint[];
  }) => void;
}

export function AIQueryInput({
  currentCategory,
  currentPriorities,
  currentBudget,
  onParsed,
}: AIQueryInputProps) {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<AIParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queryHistory, setQueryHistory] = useState<string[]>([]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (!trimmed || isLoading) return;

      setIsLoading(true);
      setError(null);
      setLastResult(null);

      try {
        const response = await fetch("/api/decision/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: trimmed,
            currentCategory,
            currentPreferences: {
              category: currentCategory,
              budget: currentBudget,
              priorities: currentPriorities,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        const result: AIParseResult = await response.json();

        if (result.success && result.intent) {
          setLastResult(result);
          setQueryHistory((prev) => [...prev, trimmed]);
          onParsed({
            category: result.intent.category,
            budget: result.intent.budget,
            priorities: result.intent.priorities,
            constraints: result.intent.constraints,
          });
          setQuery("");
        } else {
          setError(result.error ?? "Failed to understand your query");
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Network error";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [query, isLoading, currentCategory, currentBudget, currentPriorities, onParsed]
  );

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-medium text-zinc-400 tracking-wide uppercase">
            Ask DecisionCart
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Describe what you&apos;re looking for in natural language
          </p>
        </div>
        {queryHistory.length > 0 && (
          <span className="text-xs text-zinc-300 bg-zinc-50 px-2 py-1 rounded-full">
            {queryHistory.length} query{queryHistory.length !== 1 ? "ies" : "y"}
          </span>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex gap-3 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='e.g. "Best phone under ₹30,000 with great camera and battery"'
          disabled={isLoading}
          className="flex-1 px-4 py-3 rounded-xl border border-zinc-200 text-sm text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent disabled:opacity-50 transition-all"
        />
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="px-5 py-3 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Thinking...
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
              Search
            </>
          )}
        </button>
      </form>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-zinc-400 mb-3">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-pulse" />
            <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-pulse [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-pulse [animation-delay:300ms]" />
          </div>
          Understanding your needs...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3">
          {error}
        </div>
      )}

      {/* Parsed Intent Display */}
      {lastResult?.success && lastResult.intent && (
        <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-100">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              {lastResult.source === "ai" ? "AI" : "Smart"} match
            </span>
            <span className="text-xs text-zinc-400">
              {Math.round(lastResult.intent.confidence * 100)}% confidence
            </span>
          </div>

          <p className="text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wide">
            DecisionCart understood:
          </p>

          <div className="space-y-1.5">
            <ParsedItem
              label="Category"
              value={lastResult.intent.category}
            />
            {lastResult.intent.budget?.max && (
              <ParsedItem
                label="Budget"
                value={`Under ₹${lastResult.intent.budget.max.toLocaleString()}`}
              />
            )}
            {lastResult.intent.budget?.min && (
              <ParsedItem
                label="Min Budget"
                value={`Above ₹${lastResult.intent.budget.min.toLocaleString()}`}
              />
            )}
            {lastResult.intent.priorities
              .sort((a, b) => b.importance - a.importance)
              .slice(0, 4)
              .map((p) => (
                <ParsedItem
                  key={p.attributeKey}
                  label={p.attributeKey.replace(/_/g, " ")}
                  value={
                    p.importance === 3
                      ? "High priority"
                      : p.importance === 2
                        ? "Medium"
                        : "Low priority"
                  }
                />
              ))}
          </div>

          {queryHistory.length > 1 && (
            <p className="text-xs text-zinc-400 mt-3 pt-3 border-t border-zinc-200">
              Tip: You can say &ldquo;I care more about camera&rdquo; to refine your preferences
            </p>
          )}
        </div>
      )}

      {/* Quick Suggestions */}
      {!lastResult && !isLoading && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setQuery(s)}
              className="text-xs text-zinc-500 bg-zinc-50 hover:bg-zinc-100 px-3 py-1.5 rounded-full border border-zinc-100 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function ParsedItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <svg
        className="w-3.5 h-3.5 text-emerald-500 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      <span className="text-zinc-500 capitalize">{label}:</span>
      <span className="text-zinc-800 font-medium">{value}</span>
    </div>
  );
}

// --- Constants ---

const SUGGESTIONS = [
  "Best phone under ₹30,000 with great camera",
  "Laptop under ₹60,000 for coding",
  "Phone with best battery life",
  "Lightweight laptop with good display",
];
