"use client";

import { useState, useEffect } from "react";
import type { PriorityItem, AttributeConfig, ParserSource } from "@/types";

interface DecisionInsightPanelProps {
  categoryLabel: string;
  budget?: { min?: number; max?: number };
  priorities: PriorityItem[];
  attributes: AttributeConfig[];
  parserSource: ParserSource;
  originalQuery: string;
}

export function DecisionInsightPanel({
  categoryLabel,
  budget,
  priorities,
  attributes,
  parserSource,
  originalQuery,
}: DecisionInsightPanelProps) {
  const [activeStep, setActiveStep] = useState(0);

  // Animate through processing steps on mount
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    for (let i = 0; i < STEPS.length; i++) {
      timers.push(
        setTimeout(() => setActiveStep(i + 1), 200 + i * 300)
      );
    }
    return () => timers.forEach(clearTimeout);
  }, []);

  // Sort priorities by importance (highest first) and take top 3
  const topPriorities = [...priorities]
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 3)
    .map((p) => {
      const attr = attributes.find((a) => a.key === p.attributeKey);
      return attr?.label ?? p.attributeKey;
    });

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-zinc-100">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
            <svg
              className="w-3 h-3 text-emerald-600"
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
          </div>
          <h3 className="text-sm font-semibold text-zinc-800">
            DecisionCart understood your request
          </h3>
        </div>
        <p className="text-xs text-zinc-400 mt-1 ml-7.5">
          &ldquo;{originalQuery}&rdquo;
        </p>
      </div>

      <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-3 gap-6">
        {/* Understanding Section */}
        <div className="sm:col-span-1">
          <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Understood
          </p>
          <div className="space-y-3">
            {/* Category */}
            <InsightItem label="Category" value={categoryLabel} />

            {/* Budget */}
            {budget?.max && (
              <InsightItem
                label="Budget"
                value={`Under ₹${budget.max.toLocaleString()}`}
              />
            )}
            {budget?.min && !budget?.max && (
              <InsightItem
                label="Budget"
                value={`Above ₹${budget.min.toLocaleString()}`}
              />
            )}

            {/* Top Priorities */}
            {topPriorities.length > 0 && (
              <div>
                <p className="text-xs text-zinc-400 mb-1.5">Top Priorities</p>
                <div className="flex flex-wrap gap-1.5">
                  {topPriorities.map((label) => (
                    <span
                      key={label}
                      className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-50 border border-zinc-100 text-xs text-zinc-600 font-medium"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Processing Status */}
        <div className="sm:col-span-1">
          <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Processing
          </p>
          <div className="space-y-2.5">
            {STEPS.map((step, i) => {
              const done = activeStep > i;
              return (
                <div key={step} className="flex items-center gap-2.5">
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center transition-all duration-300 ${
                      done
                        ? "bg-emerald-500"
                        : "bg-zinc-100 border border-zinc-200"
                    }`}
                  >
                    {done && (
                      <svg
                        className="w-2.5 h-2.5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                  <span
                    className={`text-xs transition-colors duration-300 ${
                      done ? "text-zinc-700 font-medium" : "text-zinc-300"
                    }`}
                  >
                    {step}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Parser Source */}
        <div className="sm:col-span-1">
          <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-3">
            Source
          </p>
          <div className="flex items-start gap-2.5">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                parserSource === "ai"
                  ? "bg-violet-50 border border-violet-100"
                  : "bg-zinc-50 border border-zinc-100"
              }`}
            >
              {parserSource === "ai" ? (
                <svg
                  className="w-4 h-4 text-violet-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4 text-zinc-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                  />
                </svg>
              )}
            </div>
            <div>
              <p className="text-xs text-zinc-700 font-medium leading-snug">
                {parserSource === "ai"
                  ? "Interpreted using DecisionCart AI"
                  : "Interpreted using DecisionCart Smart Parser"}
              </p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {parserSource === "ai"
                  ? "Advanced language understanding"
                  : "Deterministic keyword analysis"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---

function InsightItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-400 mb-0.5">{label}</p>
      <p className="text-sm text-zinc-800 font-medium">{value}</p>
    </div>
  );
}

// --- Constants ---

const STEPS = [
  "Query understood",
  "Preferences structured",
  "Products analyzed",
  "Transparent ranking generated",
];
