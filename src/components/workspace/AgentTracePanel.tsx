"use client";

import { useState } from "react";
import type { AgentStep, ToolStepStatus } from "@/agent/agent-types";

interface AgentTracePanelProps {
  /** Observable agent steps from the orchestrator. */
  steps: AgentStep[];
  /** High-level agent status: "running" | "completed" | "failed" */
  status: "running" | "completed" | "failed";
  /** Optional overall error message. */
  error?: string;
}

/**
 * Agent Activity panel — shows the orchestrator's execution trace.
 *
 * Displays each tool step with:
 * - Status indicator (pending / running / completed / failed)
 * - Human-readable label
 * - Input/output summaries (no secrets)
 * - Timing information
 * - Error details on failure
 */
export function AgentTracePanel({
  steps,
  status,
  error,
}: AgentTracePanelProps) {
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  if (steps.length === 0) return null;

  const toggleExpand = (stepId: string) => {
    setExpandedStepId((prev) => (prev === stepId ? null : stepId));
  };

  const totalDuration = computeTotalDuration(steps);

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-zinc-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-zinc-900 flex items-center justify-center">
              <span className="text-white text-[10px]">🤖</span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-800">
                DecisionCart Agent
              </h3>
              <p className="text-[10px] text-zinc-400 mt-0.5">
                {status === "completed"
                  ? "All steps completed"
                  : status === "failed"
                    ? "Agent execution failed"
                    : "Processing..."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {totalDuration !== null && (
              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-50 px-2 py-0.5 rounded-full border border-zinc-100">
                {formatDuration(totalDuration)}
              </span>
            )}
            <StatusBadge status={status} />
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="px-6 py-4">
        <div className="space-y-0">
          {steps.map((step, index) => {
            const isExpanded = expandedStepId === step.id;
            const hasDetails =
              step.inputSummary || step.outputSummary || step.error;
            const isLast = index === steps.length - 1;

            return (
              <div key={step.id}>
                <button
                  onClick={() => hasDetails && toggleExpand(step.id)}
                  className={`w-full flex items-center gap-3 py-3 text-left group transition-colors ${
                    hasDetails
                      ? "hover:bg-zinc-50 -mx-2 px-2 rounded-lg cursor-pointer"
                      : "cursor-default"
                  }`}
                  aria-expanded={hasDetails ? isExpanded : undefined}
                >
                  {/* Connector line + status dot */}
                  <div className="flex flex-col items-center shrink-0">
                    <StatusDot status={step.status} degraded={step.degraded} />
                    {!isLast && (
                      <div
                        className={`w-px h-3 mt-1 ${
                          step.status === "completed" && !step.degraded
                            ? "bg-emerald-300"
                            : step.status === "completed" && step.degraded
                              ? "bg-amber-300"
                              : step.status === "failed"
                                ? "bg-red-300"
                                : "bg-zinc-200"
                        }`}
                      />
                    )}
                  </div>

                  {/* Label + status */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm ${
                          step.status === "completed" && !step.degraded
                            ? "text-zinc-700 font-medium"
                            : step.status === "completed" && step.degraded
                              ? "text-amber-700 font-medium"
                              : step.status === "failed"
                                ? "text-red-700 font-medium"
                                : step.status === "running"
                                  ? "text-zinc-700"
                                  : "text-zinc-400"
                        }`}
                      >
                        {step.label}
                      </span>
                      {step.status === "completed" && step.degraded && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-100">
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                          </svg>
                          Limited data
                        </span>
                      )}
                      {step.status === "running" && (
                        <div className="flex gap-0.5">
                          <span className="w-1 h-1 bg-zinc-400 rounded-full animate-pulse" />
                          <span className="w-1 h-1 bg-zinc-400 rounded-full animate-pulse [animation-delay:150ms]" />
                          <span className="w-1 h-1 bg-zinc-400 rounded-full animate-pulse [animation-delay:300ms]" />
                        </div>
                      )}
                    </div>

                    {/* Timing */}
                    {step.startedAt && step.completedAt && (
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {formatDuration(step.completedAt - step.startedAt)}
                      </span>
                    )}
                  </div>

                  {/* Status icon + expand chevron */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <StatusIcon status={step.status} degraded={step.degraded} />
                    {hasDetails && (
                      <svg
                        className={`w-3.5 h-3.5 text-zinc-300 transition-transform ${
                          isExpanded ? "rotate-90" : ""
                        }`}
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
                    )}
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && hasDetails && (
                  <div className="ml-7 mr-2 mb-3 p-3 bg-zinc-50 rounded-xl border border-zinc-100 space-y-2">
                    {step.inputSummary && (
                      <DetailRow
                        label="Input"
                        value={step.inputSummary}
                        type="info"
                      />
                    )}
                    {step.outputSummary && (
                      <DetailRow
                        label="Output"
                        value={step.outputSummary}
                        type="success"
                      />
                    )}
                    {step.error && (
                      <DetailRow
                        label="Error"
                        value={step.error}
                        type="error"
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Overall error */}
      {error && (
        <div className="px-6 pb-4">
          <div className="p-3 bg-red-50 rounded-xl border border-red-100">
            <div className="flex items-start gap-2">
              <svg
                className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0"
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
              <p className="text-xs text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function StatusDot({ status, degraded }: { status: ToolStepStatus; degraded?: boolean }) {
  const cls =
    status === "completed" && !degraded
      ? "bg-emerald-500"
      : status === "completed" && degraded
        ? "bg-amber-500"
        : status === "failed"
          ? "bg-red-500"
          : status === "running"
            ? "bg-zinc-900 animate-pulse"
            : "bg-zinc-200 border border-zinc-300";

  return <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cls}`} />;
}

function StatusIcon({ status, degraded }: { status: ToolStepStatus; degraded?: boolean }) {
  if (status === "completed" && degraded) {
    return (
      <svg
        className="w-4 h-4 text-amber-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
        />
      </svg>
    );
  }
  if (status === "completed") {
    return (
      <svg
        className="w-4 h-4 text-emerald-500"
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
    );
  }
  if (status === "failed") {
    return (
      <svg
        className="w-4 h-4 text-red-500"
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
    );
  }
  if (status === "running") {
    return (
      <svg
        className="w-4 h-4 text-zinc-900 animate-spin"
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
    );
  }
  return null;
}

function DetailRow({
  label,
  value,
  type,
}: {
  label: string;
  value: string;
  type: "info" | "success" | "error";
}) {
  const bgClass =
    type === "error"
      ? "bg-red-50 text-red-700 border-red-100"
      : type === "success"
        ? "bg-emerald-50/50 text-emerald-700 border-emerald-100/50"
        : "bg-white text-zinc-600 border-zinc-100";

  return (
    <div className={`p-2 rounded-lg border ${bgClass}`}>
      <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-0.5">
        {label}
      </p>
      <p className="text-xs leading-relaxed">{value}</p>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "running" | "completed" | "failed";
}) {
  const config =
    status === "completed"
      ? {
          bg: "bg-emerald-50",
          text: "text-emerald-700",
          border: "border-emerald-100",
          label: "Completed",
        }
      : status === "failed"
        ? {
            bg: "bg-red-50",
            text: "text-red-700",
            border: "border-red-100",
            label: "Failed",
          }
        : {
            bg: "bg-zinc-50",
            text: "text-zinc-600",
            border: "border-zinc-200",
            label: "Running",
          };

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-medium ${config.bg} ${config.text} ${config.border} px-2.5 py-1 rounded-full border`}
    >
      {status === "running" && (
        <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-pulse" />
      )}
      {config.label}
    </span>
  );
}

// --- Helpers ---

function computeTotalDuration(steps: AgentStep[]): number | null {
  const startedSteps = steps.filter((s) => s.startedAt);
  if (startedSteps.length === 0) return null;

  const earliest = Math.min(...startedSteps.map((s) => s.startedAt!));
  const latestEnd = steps.some((s) => s.completedAt)
    ? Math.max(
        ...steps.filter((s) => s.completedAt).map((s) => s.completedAt!)
      )
    : Date.now();

  return latestEnd - earliest;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
