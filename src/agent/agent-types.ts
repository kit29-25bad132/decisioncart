// ============================================================
// DecisionCart — Agent Types
// Type-safe foundation for the bounded commerce agent.
// All agent execution state is observable and deterministic.
// ============================================================

import type { ParsedShoppingIntent } from "@/lib/ai/types";
import type { UserPreference } from "@/types";

// --- Agent Status ---

/** High-level status of the entire agent execution. */
export type AgentStatus = "idle" | "running" | "completed" | "failed";

// --- Tool Names ---

/**
 * Controlled union of agent tool names.
 * The agent must NOT accept arbitrary tool names from an LLM.
 * Future V1 tools are declared here even if not yet implemented.
 */
export type AgentToolName =
  | "search_catalog"
  | "run_decision"
  | "compare_products"
  | "verify_purchase";

// --- Tool Step Status ---

/** Execution status of a single tool step within the agent run. */
export type ToolStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

// --- Agent Step ---

/**
 * An observable execution step within the agent run.
 * Only stores execution metadata — no hidden chain-of-thought or private reasoning.
 */
export interface AgentStep {
  /** Unique identifier for this execution step. */
  id: string;
  /** The tool this step executes. */
  tool: AgentToolName;
  /** Current execution status of this step. */
  status: ToolStepStatus;
  /** Human-readable label describing what this step does. */
  label: string;
  /** Timestamp when execution of this step actually started (undefined until the tool begins running). */
  startedAt?: number;
  /** Timestamp when execution completed (undefined if still running or not started). */
  completedAt?: number;
  /** Brief summary of the input passed to this step (no secrets). */
  inputSummary?: string;
  /** Brief summary of the output produced by this step (no secrets). */
  outputSummary?: string;
  /** Error message if the step failed. */
  error?: string;
}

// --- Agent Input ---

/**
 * Input to the agent orchestrator.
 * Built on top of the existing ParsedShoppingIntent — no new parsing.
 */
export interface AgentInput {
  /** The parsed shopping intent from the existing AI/fallback parser. */
  intent: ParsedShoppingIntent;
  /** Optional override for category (otherwise derived from intent). */
  category?: string;
  /** Optional current preferences for context (e.g. refinement scenarios). */
  currentPreferences?: UserPreference;
}

// --- Agent Result ---

/**
 * The final result of an agent run.
 * The recommendation field is kept generic to avoid coupling with DecisionResult
 * at this early stage. Concrete tool outputs are attached via `toolResults`.
 */
export interface AgentResult {
  /** Final status of the agent execution. */
  status: AgentStatus;
  /** The parsed intent that was processed. */
  parsedIntent: ParsedShoppingIntent;
  /** Observable execution steps in order. */
  steps: AgentStep[];
  /** Optional recommendation data from tool execution (generic to allow evolution). */
  recommendation?: Record<string, unknown>;
  /** Error message if the agent run failed. */
  error?: string;
}
