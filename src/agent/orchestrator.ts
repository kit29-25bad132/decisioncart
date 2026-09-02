// ============================================================
// DecisionCart — Agent Orchestrator (Step 4: search_catalog + run_decision + compare_products)
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
import type { Product } from "@/types";
import { executeCatalogSearch } from "./tools/catalog-search";
import { executeDecisionRunner } from "./tools/decision-runner";
import { executeProductComparison } from "./tools/product-comparison";

// --- Deterministic Step Plan ---

/**
 * Ordered list of tool steps for a standard commerce query.
 * This is the fixed execution plan — not decided by an LLM.
 * All three tools are now executed in sequence.
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
 * Step 4 implementation:
 * - Creates a deterministic execution plan with observable step entries.
 * - Executes search_catalog via the bounded tool.
 * - If search_catalog succeeds, executes run_decision.
 * - If run_decision succeeds, executes compare_products.
 * - Returns "completed" on full success, "failed" on any failure.
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

  let catalogResult;
  try {
    catalogResult = await executeCatalogSearch({
      intent: input.intent,
      categoryOverride: input.category,
    });

    // Transition: running → completed or failed
    searchStep.completedAt = Date.now();

    if (catalogResult.success) {
      searchStep.status = "completed";
      searchStep.outputSummary = catalogResult.outputSummary;
    } else {
      searchStep.status = "failed";
      searchStep.error = catalogResult.error;
      searchStep.outputSummary = catalogResult.outputSummary;

      return {
        status: "failed",
        parsedIntent: input.intent,
        steps,
        catalogSearchResult: catalogResult,
        error: catalogResult.error,
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

  // --- Execute run_decision ---

  const decisionStep = steps.find((s) => s.tool === "run_decision");

  if (!decisionStep) {
    return {
      status: "failed",
      parsedIntent: input.intent,
      steps,
      catalogSearchResult: catalogResult,
      error: "Internal error: run_decision step not found in plan.",
    };
  }

  // Transition: pending → running
  decisionStep.status = "running";
  decisionStep.startedAt = Date.now();
  decisionStep.inputSummary = buildDecisionInputSummary(
    catalogResult.products,
    input
  );

  let decisionToolResult;
  try {
    decisionToolResult = await executeDecisionRunner({
      intent: input.intent,
      products: catalogResult.products,
      categoryOverride: input.category,
    });

    // Transition: running → completed or failed
    decisionStep.completedAt = Date.now();

    if (decisionToolResult.success) {
      decisionStep.status = "completed";
      decisionStep.outputSummary = decisionToolResult.outputSummary;
    } else {
      decisionStep.status = "failed";
      decisionStep.error = decisionToolResult.error;
      decisionStep.outputSummary = decisionToolResult.outputSummary;

      return {
        status: "failed",
        parsedIntent: input.intent,
        steps,
        catalogSearchResult: catalogResult,
        decisionResult: decisionToolResult,
        error: decisionToolResult.error,
      };
    }
  } catch (err: unknown) {
    // Unexpected error — should not happen since executeDecisionRunner catches internally
    decisionStep.completedAt = Date.now();
    decisionStep.status = "failed";

    const errorMessage =
      err instanceof Error ? err.message : "Unexpected decision runner error";
    decisionStep.error = errorMessage;
    decisionStep.outputSummary = `Decision runner failed: ${errorMessage}.`;

    return {
      status: "failed",
      parsedIntent: input.intent,
      steps,
      catalogSearchResult: catalogResult,
      error: errorMessage,
    };
  }

  // --- Execute compare_products ---

  const comparisonStep = steps.find((s) => s.tool === "compare_products");

  if (!comparisonStep) {
    return {
      status: "failed",
      parsedIntent: input.intent,
      steps,
      catalogSearchResult: catalogResult,
      decisionResult: decisionToolResult,
      error: "Internal error: compare_products step not found in plan.",
    };
  }

  // Transition: pending → running
  comparisonStep.status = "running";
  comparisonStep.startedAt = Date.now();
  comparisonStep.inputSummary = buildComparisonInputSummary(decisionToolResult);

  try {
    const comparisonResult = await executeProductComparison({
      decisionToolResult,
    });

    // Transition: running → completed or failed
    comparisonStep.completedAt = Date.now();

    if (comparisonResult.success) {
      comparisonStep.status = "completed";
      comparisonStep.outputSummary = comparisonResult.outputSummary;

      return {
        status: "completed",
        parsedIntent: input.intent,
        steps,
        catalogSearchResult: catalogResult,
        decisionResult: decisionToolResult,
        comparisonResult,
      };
    } else {
      comparisonStep.status = "failed";
      comparisonStep.error = comparisonResult.error;
      comparisonStep.outputSummary = comparisonResult.outputSummary;

      return {
        status: "failed",
        parsedIntent: input.intent,
        steps,
        catalogSearchResult: catalogResult,
        decisionResult: decisionToolResult,
        comparisonResult,
        error: comparisonResult.error,
      };
    }
  } catch (err: unknown) {
    // Unexpected error — should not happen since executeProductComparison catches internally
    comparisonStep.completedAt = Date.now();
    comparisonStep.status = "failed";

    const errorMessage =
      err instanceof Error ? err.message : "Unexpected comparison error";
    comparisonStep.error = errorMessage;
    comparisonStep.outputSummary = `Comparison failed: ${errorMessage}.`;

    return {
      status: "failed",
      parsedIntent: input.intent,
      steps,
      catalogSearchResult: catalogResult,
      decisionResult: decisionToolResult,
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

/**
 * Build a brief input summary for the decision step.
 * No secrets — only observable metadata.
 */
function buildDecisionInputSummary(
  products: Product[],
  input: AgentInput
): string {
  const parts: string[] = [];

  const productCount = Array.isArray(products) ? products.length : 0;
  parts.push(`${productCount} product${productCount === 1 ? "" : "s"}`);

  const category = input.category ?? input.intent.category;
  if (category) {
    parts.push(`category="${category}"`);
  }

  return parts.join(", ");
}

/**
 * Build a brief input summary for the comparison step.
 * No secrets — only observable metadata.
 */
function buildComparisonInputSummary(
  decisionResult: import("./agent-types").DecisionToolResult
): string {
  const parts: string[] = [];

  const scoredCount = decisionResult.decisionResult?.scoredProducts?.length ?? 0;
  parts.push(`${scoredCount} scored product${scoredCount === 1 ? "" : "s"}`);

  const category = decisionResult.effectiveCategory;
  if (category) {
    parts.push(`category="${category}"`);
  }

  return parts.join(", ");
}
