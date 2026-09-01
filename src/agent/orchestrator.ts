// ============================================================
// DecisionCart — Agent Orchestrator (Step 2: search_catalog)
// Deterministic execution of bounded commerce tools.
// No LLM-driven reasoning. No payment. No catalog mutation.
// ============================================================

import type {
  AgentInput,
  AgentResult,
  AgentStep,
  AgentToolName,
  ToolStepStatus,
} from "./agent-types";
import { executeCatalogSearch } from "./tools/catalog-search";

// --- Deterministic Step Plan ---

/**
 * Ordered list of tool steps for a standard commerce query.
 * This is the fixed execution plan — not decided by an LLM.
 * Only search_catalog is executed in Step 2; others remain pending.
 */
interface StepPlanEntry {
  tool: AgentToolName;
  label: string;
}

const DEFAULT_STEP_PLAN: StepPlanEntry[] = [
  { tool: "search_catalog", label: "Search catalog for matching products" },
  { tool: "run_decision", label: "Run deterministic decision engine" },
  { tool: "compare_products", label: "Compare top products and generate insights" },
];

// --- ID Generation ---

let stepCounter = 0;

/**
 * Generate a deterministic, unique step ID.
 * Resolves across multiple orchestrator invocations within a process.
 */
function generateStepId(tool: AgentToolName): string {
  stepCounter += 1;
  return `step-${stepCounter}-${tool}`;
}

// --- Orchestrator ---

/**
 * Run the agent orchestrator.
 *
 * Step 2 implementation:
 * - Creates a deterministic execution plan with observable step entries.
 * - Executes ONLY search_catalog via the bounded tool.
 * - run_decision and compare_products remain pending (future steps).
 * - Returns "completed" on success, "failed" on catalog search failure.
 */
export async function runAgent(input: AgentInput): Promise<AgentResult> {
  // Validate input
  if (!input.intent) {
    return {
      status: "failed",
      parsedIntent: input.intent,
      steps: [],
      error: "Missing parsed intent",
    };
  }

  // Build the execution plan — all steps start as pending.
  const steps = buildSteps(DEFAULT_STEP_PLAN);

  // Find the search_catalog step
  const searchStep = steps.find((s) => s.tool === "search_catalog");

  if (!searchStep) {
    return {
      status: "failed",
      parsedIntent: input.intent,
      steps,
      error: "Internal error: search_catalog step not found in plan.",
    };
  }

  // --- Execute search_catalog ---

  // Transition: pending → running
  searchStep.status = "running";
  searchStep.startedAt = Date.now();
  searchStep.inputSummary = buildSearchInputSummary(input);

  try {
    const toolResult = await executeCatalogSearch({
      intent: input.intent,
      categoryOverride: input.category,
    });

    // Transition: running → completed or failed
    searchStep.completedAt = Date.now();

    if (toolResult.success) {
      searchStep.status = "completed";
      searchStep.outputSummary = toolResult.outputSummary;

      return {
        status: "completed",
        parsedIntent: input.intent,
        steps,
        catalogSearchResult: toolResult,
      };
    } else {
      searchStep.status = "failed";
      searchStep.error = toolResult.error;
      searchStep.outputSummary = toolResult.outputSummary;

      return {
        status: "failed",
        parsedIntent: input.intent,
        steps,
        catalogSearchResult: toolResult,
        error: toolResult.error,
      };
    }
  } catch (err: unknown) {
    // Unexpected error — should not happen since executeCatalogSearch catches internally
    searchStep.completedAt = Date.now();
    searchStep.status = "failed";

    const errorMessage =
      err instanceof Error ? err.message : "Unexpected orchestrator error";
    searchStep.error = errorMessage;
    searchStep.outputSummary = `Catalog search failed: ${errorMessage}.`;

    return {
      status: "failed",
      parsedIntent: input.intent,
      steps,
      error: errorMessage,
    };
  }
}

// --- Internal Helpers ---

/**
 * Build deterministic AgentStep entries from a step plan.
 * Each step gets a unique ID and a pending initial status.
 */
function buildSteps(plan: StepPlanEntry[]): AgentStep[] {
  return plan.map((entry) => ({
    id: generateStepId(entry.tool),
    tool: entry.tool,
    status: "pending" as ToolStepStatus,
    label: entry.label,
  }));
}

/**
 * Build a brief input summary for the catalog search step.
 * No secrets — only observable metadata.
 */
function buildSearchInputSummary(input: AgentInput): string {
  const parts: string[] = [];

  const category = input.category ?? input.intent.category;
  if (category) {
    parts.push(`category="${category}"`);
  }

  const budget = input.intent.budget;
  if (budget?.max !== undefined) {
    parts.push(`maxBudget=${budget.max}`);
  }
  if (budget?.min !== undefined) {
    parts.push(`minBudget=${budget.min}`);
  }

  return parts.length > 0 ? parts.join(", ") : "no parameters";
}
