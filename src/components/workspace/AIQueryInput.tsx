"use client";

import { useState, useCallback } from "react";
import type { PriorityItem, Constraint } from "@/types";
import type { AIParseResult } from "@/lib/ai/types";
import type { AgentStep, AgentResult } from "@/agent/agent-types";

/** Response from POST /api/agent/run */
interface AgentRunResponse {
  success: boolean;
  source: "ai" | "fallback";
  agentResult?: AgentResult;
  error?: string;
  trace?: { runId: string; persisted: boolean; error?: string };
}

interface AIQueryInputProps {
  currentCategory: string;
  currentPriorities: PriorityItem[];
  currentBudget?: { min?: number; max?: number };
  currentConstraints?: Constraint[];
  onParsed: (intent: {
    category: string;
    budget?: { min?: number; max?: number };
    priorities: PriorityItem[];
    constraints: Constraint[];
    source: "ai" | "fallback";
    originalQuery: string;
    agentSteps?: AgentStep[];
    agentStatus?: "running" | "completed" | "failed";      agentError?: string;
      agentResult?: AgentResult;
      tracePersisted?: boolean;
    }) => void;
}

export function AIQueryInput({
  currentCategory,
  currentPriorities,
  currentBudget,
  currentConstraints,
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
        const response = await fetch("/api/agent/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: trimmed,
            currentCategory,
            currentPreferences: {
              category: currentCategory,
              budget: currentBudget,
              priorities: currentPriorities,
              constraints: currentConstraints,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        const agentResponse: AgentRunResponse = await response.json();

        // The agent endpoint returns the parsed intent inside agentResult.parsedIntent
        // but we need to reconstruct the AIParseResult for backward compatibility
        const agentResult = agentResponse.agentResult;

        if (agentResult && agentResult.parsedIntent) {
          const parsedIntent = agentResult.parsedIntent;

          // Build a compatible AIParseResult for the existing UI display
          const parseResult: AIParseResult = {
            success: agentResponse.success,
            source: agentResponse.source,
            intent: parsedIntent,
            error: agentResponse.error,
          };

          setLastResult(parseResult);
          setQueryHistory((prev) => [...prev, trimmed]);
          onParsed({
            category: parsedIntent.category,
            budget: parsedIntent.budget,
            priorities: parsedIntent.priorities,
            constraints: parsedIntent.constraints,
            source: agentResponse.source,
            originalQuery: trimmed,
            agentSteps: agentResult.steps,
            agentStatus:
              agentResult.status === "completed"
                ? "completed"
                : agentResult.status === "failed"
                  ? "failed"
                  : "running",
            agentError: agentResult.error,
            agentResult,
            tracePersisted: agentResponse.trace?.persisted,
          });
          setQuery("");
        } else {
          // Agent returned no parsed intent — this can happen on parse failure
          setError(agentResponse.error ?? "Failed to understand your query");
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Network error";
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [query, isLoading, currentCategory, currentBudget, currentPriorities, currentConstraints, onParsed]
  );

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-zinc-900 flex items-center justify-center">
              <svg
                className="w-3.5 h-3.5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-800">
                Ask DecisionCart
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Describe what you need — in your own words
              </p>
            </div>
          </div>
          {queryHistory.length > 0 && (
            <span className="text-[10px] font-medium text-zinc-400 bg-zinc-50 px-2.5 py-1 rounded-full border border-zinc-100">
              {queryHistory.length} {queryHistory.length === 1 ? "query" : "queries"}
            </span>
          )}
        </div>
      </div>

      {/* Input Form */}
      <div className="px-6 pb-5">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='e.g. "Best phone under ₹30,000 with great camera and battery"'
              disabled={isLoading}
              className="w-full px-4 py-3.5 rounded-xl border border-zinc-200 text-sm text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 disabled:opacity-50 transition-all bg-zinc-50/50 hover:bg-zinc-50"
              aria-label="Describe what product you are looking for"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="px-5 py-3.5 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 active:bg-zinc-950 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-sm"
            aria-label={isLoading ? "Searching..." : "Search for products"}
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
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                  />
                </svg>
                Search
              </>
            )}
          </button>
        </form>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center gap-2.5 text-xs text-zinc-400 mt-3 ml-1">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-pulse" />
              <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-pulse [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-pulse [animation-delay:300ms]" />
            </div>
            <span>Understanding your needs and analyzing products...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-3 border border-red-100">
            <svg
              className="w-3.5 h-3.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            {error}
          </div>
        )}
      </div>

      {/* Parsed Intent Display */}
      {lastResult?.success && lastResult.intent && (
        <div className="border-t border-zinc-100 bg-zinc-50/50 px-6 py-5">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
              <svg
                className="w-3 h-3"
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
              {lastResult.source === "ai" ? "AI" : "Smart"} match
              {lastResult.source === "fallback" && lastResult.aiAvailable === false && (
                <span className="text-emerald-600 ml-1">(AI unavailable)</span>
              )}
              {lastResult.source === "fallback" && lastResult.aiAvailable === true && (
                <span className="text-amber-700 ml-1">(AI failed, fallback used)</span>
              )}
            </span>
            <span className="text-xs text-zinc-400">
              {Math.round(lastResult.intent.confidence * 100)}% confidence
            </span>
          </div>

          <p className="text-[11px] font-medium text-zinc-400 mb-2.5 uppercase tracking-wider">
            DecisionCart understood
          </p>

          <div className="space-y-2">
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
            {[...lastResult.intent.priorities]
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
            <p className="text-xs text-zinc-400 mt-4 pt-3 border-t border-zinc-200">
              Tip: Say &ldquo;I care more about camera&rdquo; to refine your preferences
            </p>
          )}
        </div>
      )}

      {/* Quick Suggestions */}
      {!lastResult && !isLoading && (
        <div className="px-6 pb-5 border-t border-zinc-100 pt-4">
          <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Try asking
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setQuery(s)}
                className="text-xs text-zinc-500 bg-white hover:bg-zinc-50 px-3.5 py-2 rounded-full border border-zinc-200 hover:border-zinc-300 transition-all hover:text-zinc-700 hover:shadow-sm"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function ParsedItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <svg
        className="w-3.5 h-3.5 text-emerald-500 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      <span className="text-zinc-400 capitalize min-w-[70px]">{label}:</span>
      <span className="text-zinc-800 font-medium capitalize">{value}</span>
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
