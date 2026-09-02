// ============================================================
// DecisionCart — Agent Types
// Type-safe foundation for the bounded commerce agent.
// All agent execution state is observable and deterministic.
// ============================================================

import type { ParsedShoppingIntent } from "@/lib/ai/types";
import type { DecisionResult, Product, UserPreference } from "@/types";
import type { ProviderInfo } from "@/catalog/provider";

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

// --- Tool Result Types ---

/** Metadata about a catalog search fetch operation. */
export interface CatalogSearchMetadata {
  totalCount?: number;
  budgetFiltered?: boolean;
  cached?: boolean;
  note?: string;
  fallbackUsed?: boolean;
  fallbackProviderId?: string;
  primaryProviderId?: string;
  dataSourceType?: "demo" | "external" | "merchant" | "hybrid";
}

/** Typed result from the search_catalog bounded tool. */
export interface CatalogSearchToolResult {
  /** Whether the tool execution succeeded. */
  success: boolean;
  /** Products returned by the catalog provider. */
  products: Product[];
  /** Information about which provider supplied the data. */
  provider: ProviderInfo;
  /** ISO 8601 timestamp of when data was fetched. */
  fetchedAt: string;
  /** Optional metadata about the fetch operation. */
  metadata?: CatalogSearchMetadata;
  /** Human-readable summary of the search result. */
  outputSummary: string;
  /** Error message when success is false. */
  error?: string;
}

/** Typed result from the run_decision bounded tool. */
export interface DecisionToolResult {
  /** Whether the tool execution succeeded. */
  success: boolean;
  /** Typed result from the deterministic decision engine, when successful. */
  decisionResult?: DecisionResult;
  /** The effective category used for the decision. */
  effectiveCategory: string;
  /** Human-readable summary of the decision output. */
  outputSummary: string;
  /** Error message when success is false. */
  error?: string;
}

// --- Agent Result ---

/**
 * The final result of an agent run.
 * Concrete tool outputs are typed to avoid untyped Record fields.
 */
export interface AgentResult {
  /** Final status of the agent execution. */
  status: AgentStatus;
  /** The parsed intent that was processed. */
  parsedIntent: ParsedShoppingIntent;
  /** Observable execution steps in order. */
  steps: AgentStep[];
  /** Typed result from the catalog search tool, if executed. */
  catalogSearchResult?: CatalogSearchToolResult;
  /** Typed result from the decision runner tool, if executed. */
  decisionResult?: DecisionToolResult;
  /** Error message if the agent run failed. */
  error?: string;
}
