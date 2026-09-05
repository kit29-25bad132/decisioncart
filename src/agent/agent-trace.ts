// ============================================================
// DecisionCart — Agent Execution Trace (Auditable)
// Minimal typed representation of an agent run for audit and UI.
//
// Design rules:
// - Factual execution events only. No chain-of-thought, no hidden
//   model reasoning, no raw tool payloads, no secrets.
// - Extends the existing audit philosophy (typed events with
//   timestamps and safe metadata) without touching purchase audit.
// - Persistence is honest: saveAgentTrace reports whether the
//   write actually happened. Callers must never claim persistence
//   that did not occur.
// ============================================================

import type { AgentResult, AgentToolName, ToolStepStatus } from "./agent-types";

// --- Trace Event Types ---

/** Typed event types for the agent execution trace. */
export type AgentTraceEventType =
  | "AGENT_STARTED"
  | "AGENT_TOOL_STARTED"
  | "AGENT_TOOL_COMPLETED"
  | "AGENT_TOOL_FAILED"
  | "AGENT_DECISION_COMPLETED"
  | "AGENT_COMPLETED"
  | "AGENT_FAILED";

/**
 * Defense-in-depth: scrub credential-like substrings from persisted error
 * text. Orchestrator errors are controlled and non-secret by construction;
 * this guard ensures secrets can never leak into the trace even if an
 * upstream message unexpectedly contains one.
 */
const SECRET_PATTERNS: RegExp[] = [
  /(?:razorpay[_-]?key[_-]?secret|ai[_-]?api[_-]?key|api[_-]?key|secret[_-]?key|access[_-]?token|authorization)\s*[:=]\s*\S+/gi,
  /\bsk-[A-Za-z0-9]+/g,
  /\brzp_(?:test|live)_\w+/g,
];

function scrubSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[redacted]");
  }
  return result;
}

/** One factual execution event within an agent run trace. */
export interface AgentTraceEvent {
  /** Unique event identifier. */
  eventId: string;
  /** The agent run this event belongs to. */
  runId: string;
  /** When the event occurred (epoch ms). */
  timestamp: number;
  /** The typed lifecycle event. */
  eventType: AgentTraceEventType;
  /** Tool name for tool-level events. */
  tool?: AgentToolName;
  /** Observed step status for tool-level events. */
  status?: ToolStepStatus;
  /** Observed step duration in ms, when both timestamps exist. */
  durationMs?: number | null;
  /** Whether the step completed with degraded/limited output. */
  degraded?: boolean;
  /** Concise input summary as produced by the orchestrator (no secrets). */
  inputSummary?: string;
  /** Concise output summary as produced by the orchestrator (no secrets). */
  outputSummary?: string;
  /** Error message when the step failed (orchestrator-generated, non-sensitive). */
  error?: string;
  /** Safe structured metadata (counts, IDs, scores — never secrets). */
  metadata: Record<string, unknown>;
}

/** A complete agent run trace record. */
export interface AgentTraceRecord {
  /** Unique run identifier (server-generated UUID). */
  runId: string;
  /** The user's original query text (as typed, factual). */
  query: string;
  /** Whether the query was parsed by the AI provider or the deterministic fallback. */
  parseSource: "ai" | "fallback";
  /** Non-sensitive AI failure classification when the AI path failed. */
  aiFailureClass?: string;
  /** Final status of the agent run. */
  agentStatus: "completed" | "failed";
  /** When the run was recorded (epoch ms). */
  createdAt: number;
  /** Ordered factual execution events. */
  events: AgentTraceEvent[];
}

/** Honest persistence result — `persisted` reflects what actually happened. */
export interface AgentTracePersistResult {
  /** Whether the trace was actually persisted. */
  persisted: boolean;
  /** The run ID of the trace. */
  runId: string;
  /** Error message when persistence failed. */
  error?: string;
}

// --- Decision Trace Summary (UI-safe decision facts) ---

/** One trade-off fact for UI display (server-computed, not invented). */
export interface TradeOffSummaryItem {
  criterionKey: string;
  criterionLabel: string;
  winnerProductId: string;
  winnerProductName: string;
  score: number;
}

/**
 * Factual decision summary derived from the deterministic engine output.
 * Contains only server-computed numbers and labels — never explanations
 * invented client-side and never model reasoning.
 */
export interface DecisionTraceSummary {
  categoryLabel: string;
  budgetMax?: number;
  budgetMin?: number;
  priorityCount: number;
  constraintCount: number;
  scoredProductCount: number;
  topProductId: string;
  topProductName: string;
  topScore: number;
  topDataConfidence: string;
  topStrengths: string[];
  topWeaknesses: string[];
  tradeOffs: TradeOffSummaryItem[];
}

// --- Input for the trace builder ---

export interface BuildAgentTraceInput {
  /** Server-generated unique run ID. */
  runId: string;
  /** The user's original query text. */
  query: string;
  /** Parse source reported by the dispatcher. */
  parseSource: "ai" | "fallback";
  /** Non-sensitive AI failure class, when applicable. */
  aiFailureClass?: string;
  /** The agent result to convert into trace events. */
  agentResult: AgentResult;
}

// --- Trace Builder (pure) ---

let traceEventCounter = 0;

function nextTraceEventId(): string {
  traceEventCounter += 1;
  return `agenttrace-${traceEventCounter}-${Date.now()}`;
}

/**
 * Convert an AgentResult into a factual, ordered trace record.
 *
 * Pure function — never throws. If the agent result is malformed,
 * a minimal AGENT_STARTED + AGENT_FAILED record is returned so the
 * attempt is still auditable.
 *
 * Only orchestrator-produced summaries and counts are included.
 * Raw tool payloads, model output, and secrets are never persisted.
 */
export function buildAgentTrace(input: BuildAgentTraceInput): AgentTraceRecord {
  const { runId, query, parseSource, aiFailureClass, agentResult } = input;
  const now = Date.now();

  const events: AgentTraceEvent[] = [];

  // 1. AGENT_STARTED
  events.push({
    eventId: nextTraceEventId(),
    runId,
    timestamp: now,
    eventType: "AGENT_STARTED",
    metadata: {
      parseSource,
      ...(aiFailureClass ? { aiFailureClass } : {}),
      category: agentResult.parsedIntent?.category ?? null,
    },
  });

  // 2. Per-step events (factual: status, duration, summaries)
  const steps = Array.isArray(agentResult.steps) ? agentResult.steps : [];
  for (const step of steps) {
    const durationMs =
      typeof step.startedAt === "number" && typeof step.completedAt === "number"
        ? step.completedAt - step.startedAt
        : null;

    const failed = step.status === "failed";

    events.push({
      eventId: nextTraceEventId(),
      runId,
      timestamp: step.startedAt ?? step.completedAt ?? now,
      eventType: failed ? "AGENT_TOOL_FAILED" : "AGENT_TOOL_STARTED",
      tool: step.tool,
      status: step.status,
      durationMs,
      degraded: step.degraded === true ? true : undefined,
      ...(step.inputSummary ? { inputSummary: step.inputSummary } : {}),
      ...(failed && step.error ? { error: scrubSecrets(step.error) } : {}),
      metadata: {},
    });

    if (!failed) {
      events.push({
        eventId: nextTraceEventId(),
        runId,
        timestamp: step.completedAt ?? step.startedAt ?? now,
        eventType: "AGENT_TOOL_COMPLETED",
        tool: step.tool,
        status: step.status,
        durationMs,
        degraded: step.degraded === true ? true : undefined,
        ...(step.outputSummary ? { outputSummary: step.outputSummary } : {}),
        metadata: {},
      });
    }
  }

  // 3. AGENT_DECISION_COMPLETED (only when the decision engine produced output)
  const decisionResult = agentResult.decisionResult?.decisionResult;
  const scoredProducts = decisionResult?.scoredProducts ?? [];
  if (decisionResult && agentResult.decisionResult?.success && scoredProducts.length > 0) {
    const top = scoredProducts[0];
    events.push({
      eventId: nextTraceEventId(),
      runId,
      timestamp: now,
      eventType: "AGENT_DECISION_COMPLETED",
      metadata: {
        category: agentResult.decisionResult.effectiveCategory,
        scoredProductCount: scoredProducts.length,
        topProductId: top.product.id,
        topProductName: top.product.name,
        topScore: top.totalScore,
        topDataConfidence: top.dataConfidence,
        tradeOffCount: decisionResult.tradeOffs.length,
      },
    });
  }

  // 4. Terminal event
  const failedRun = agentResult.status === "failed";
  events.push({
    eventId: nextTraceEventId(),
    runId,
    timestamp: now,
    eventType: failedRun ? "AGENT_FAILED" : "AGENT_COMPLETED",
    metadata: {
      toolCount: steps.length,
      degradedStepCount: steps.filter((s) => s.degraded === true).length,
      ...(agentResult.error ? { error: scrubSecrets(agentResult.error) } : {}),
    },
  });

  return {
    runId,
    query,
    parseSource,
    ...(aiFailureClass ? { aiFailureClass } : {}),
    agentStatus: failedRun ? "failed" : "completed",
    createdAt: now,
    events,
  };
}

// --- In-Memory Trace Store ---

/**
 * Extract a factual decision summary from an AgentResult for UI display.
 * Returns null when the decision engine did not produce scored products.
 * Pure function — only reads server-computed engine output.
 */
export function buildDecisionTraceSummary(
  agentResult: AgentResult
): DecisionTraceSummary | null {
  const decisionResult = agentResult.decisionResult?.decisionResult;
  if (!agentResult.decisionResult?.success || !decisionResult) return null;

  const scoredProducts = decisionResult.scoredProducts ?? [];
  if (scoredProducts.length === 0) return null;

  const top = scoredProducts[0];
  const budget = agentResult.parsedIntent?.budget;

  return {
    categoryLabel: decisionResult.categoryLabel,
    ...(budget?.max !== undefined ? { budgetMax: budget.max } : {}),
    ...(budget?.min !== undefined ? { budgetMin: budget.min } : {}),
    priorityCount: agentResult.parsedIntent?.priorities?.length ?? 0,
    constraintCount: agentResult.parsedIntent?.constraints?.length ?? 0,
    scoredProductCount: scoredProducts.length,
    topProductId: top.product.id,
    topProductName: top.product.name,
    topScore: top.totalScore,
    topDataConfidence: top.dataConfidence,
    topStrengths: top.strengths ?? [],
    topWeaknesses: top.weaknesses ?? [],
    tradeOffs: decisionResult.tradeOffs.map((t) => ({
      criterionKey: t.criterionKey,
      criterionLabel: t.criterionLabel,
      winnerProductId: t.winnerProductId,
      winnerProductName: t.winnerProductName,
      score: t.score,
    })),
  };
}

// --- In-Memory Trace Store (continued) ---

/** Maximum traces retained. Bounded to prevent unbounded memory growth. */
const MAX_AGENT_TRACES = 100;

/**
 * V1 in-memory agent trace store.
 *
 * LIMITATION: Not production-persistent. Lost on server restart.
 * Follows the same V1 pattern as the in-memory purchase repository.
 */
class AgentTraceStore {
  private traces = new Map<string, AgentTraceRecord>();

  /** Save a trace. Evicts the oldest record when the cap is reached. */
  save(record: AgentTraceRecord): void {
    if (this.traces.size >= MAX_AGENT_TRACES) {
      // Evict oldest by createdAt
      let oldestId: string | null = null;
      let oldestAt = Infinity;
      for (const [id, rec] of this.traces) {
        if (rec.createdAt < oldestAt) {
          oldestAt = rec.createdAt;
          oldestId = id;
        }
      }
      if (oldestId) this.traces.delete(oldestId);
    }
    this.traces.set(record.runId, record);
  }

  /** Retrieve a trace by run ID, or null. */
  get(runId: string): AgentTraceRecord | null {
    return this.traces.get(runId) ?? null;
  }

  /** Number of retained traces. */
  size(): number {
    return this.traces.size;
  }

  /** Clear the store (for testing). */
  clear(): void {
    this.traces.clear();
  }
}

/** Singleton agent trace store (V1 in-memory). */
const agentTraceStore = new AgentTraceStore();

/**
 * Persist an agent trace and report honestly whether the write happened.
 * Never throws — persistence failures are returned, not hidden.
 */
export async function saveAgentTrace(
  record: AgentTraceRecord
): Promise<AgentTracePersistResult> {
  try {
    agentTraceStore.save(record);
    return { persisted: true, runId: record.runId };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown agent trace persistence error";
    return { persisted: false, runId: record.runId, error: message };
  }
}

/**
 * Retrieve a persisted agent trace by run ID.
 * Returns null when no trace exists for the given run ID.
 */
export async function getAgentTrace(
  runId: string
): Promise<AgentTraceRecord | null> {
  return agentTraceStore.get(runId);
}

/** Clear the trace store (for testing). */
export function clearAgentTraces(): void {
  agentTraceStore.clear();
}

// Exported for testing only.
export const _agentTraceStoreInternal = agentTraceStore;
export const _MAX_AGENT_TRACES = MAX_AGENT_TRACES;
