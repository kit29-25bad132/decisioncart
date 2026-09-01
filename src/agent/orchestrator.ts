// ============================================================
// DecisionCart — Agent Orchestrator (Step 1: Foundation Only)
// Deterministic execution skeleton for bounded commerce tools.
// No LLM-driven reasoning. No payment. No catalog mutation.
// ============================================================

import type {
  AgentInput,
  AgentResult,
  AgentStep,
  AgentToolName,
  ToolStepStatus,
} from "./agent-types";

// --- Deterministic Step Plan ---

/**
 * Ordered list of tool steps for a standard commerce query.
 * This is the fixed execution plan — not decided by an LLM.
 * Tools not yet implemented will be marked "skipped" once execution begins in Step 2.
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
 * Step 1 implementation: creates a deterministic execution plan with
 * observable step entries. All steps remain "pending" — no tools are
 * executed yet. Actual bounded tool execution begins in Step 2.
 *
 * The orchestrator is designed so that real bounded tools can be
 * registered and executed without changing the execution model.
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

  // Build the execution plan — steps are pending until Step 2 executes them.
  const steps = buildSteps(DEFAULT_STEP_PLAN);

  return {
    status: "idle",
    parsedIntent: input.intent,
    steps,
  };
}

// --- Internal Helpers ---

/**
 * Build deterministic AgentStep entries from a step plan.
 * Each step gets a unique ID and a pending initial status.
 * No startedAt is set — it will be assigned when the tool actually begins running.
 */
function buildSteps(plan: StepPlanEntry[]): AgentStep[] {
  return plan.map((entry) => ({
    id: generateStepId(entry.tool),
    tool: entry.tool,
    status: "pending" as ToolStepStatus,
    label: entry.label,
  }));
}

// --- Future Extension Points (documented, not implemented) ---

/**
 * In Step 2+, the orchestrator will:
 *
 * 1. Accept a ToolRegistry mapping AgentToolName → ToolHandler.
 * 2. Execute tools sequentially (each step depends on prior results).
 * 3. Update step status in real-time: pending → running → completed/failed.
 * 4. Short-circuit on critical failures (e.g., catalog search fails → skip downstream).
 * 5. Attach tool-specific results to AgentResult.toolResults.
 *
 * ToolHandler interface (planned):
 *
 *   interface ToolHandler {
 *     name: AgentToolName;
 *     execute(
 *       context: ToolContext
 *     ): Promise<ToolResult>;
 *   }
 *
 *   interface ToolContext {
 *     intent: ParsedShoppingIntent;
 *     previousSteps: AgentStep[];
 *     // tool-specific inputs derived from prior results
 *   }
 *
 *   interface ToolResult {
 *     status: "completed" | "failed";
 *     outputSummary: string;
 *     data: Record<string, unknown>;
 *   }
 */
