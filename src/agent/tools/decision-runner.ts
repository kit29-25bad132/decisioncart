// ============================================================
// DecisionCart — Decision Runner Tool
// Bounded tool: executes the deterministic decision engine.
// No AI calls. No mutations. No payment. No hidden reasoning.
// ============================================================

import type { ParsedShoppingIntent } from "@/lib/ai/types";
import type { Product, UserPreference, DecisionResult } from "@/types";
import { resolveCategoryConfig } from "@/catalog/category-resolver";
import { runDecision } from "@/engine/decision-engine";
import type { DecisionToolResult } from "../agent-types";

// --- Public Types ---

/** Input for the decision runner tool. */
export interface DecisionRunnerInput {
  /** The parsed shopping intent from the existing parser. */
  intent: ParsedShoppingIntent;
  /** Products returned from catalog search. */
  products: Product[];
  /** Optional category override (takes precedence over intent.category). */
  categoryOverride?: string;
}

// --- Tool Implementation ---

/**
 * Execute the bounded decision runner tool.
 *
 * Resolves category from (in priority order):
 *   1. categoryOverride argument
 *   2. intent.category
 *   3. Returns controlled failure if neither is available
 *
 * Converts ParsedShoppingIntent into UserPreference and delegates
 * to the existing deterministic runDecision() function.
 *
 * @returns DecisionToolResult — never throws.
 */
export async function executeDecisionRunner(
  input: DecisionRunnerInput
): Promise<DecisionToolResult> {
  // --- 1. Resolve effective category ---
  const effectiveCategory = input.categoryOverride ?? input.intent.category;

  if (!effectiveCategory) {
    return {
      success: false,
      effectiveCategory: "",
      outputSummary:
        "Decision failed: no category provided. Provide a category override or ensure the intent contains a category.",
      error:
        "No category provided. Provide a category override or ensure the intent contains a category.",
    };
  }

  // --- 2. Resolve category config ---
  const categoryResolution = resolveCategoryConfig(effectiveCategory);

  if (!categoryResolution) {
    return {
      success: false,
      effectiveCategory,
      outputSummary: `Decision failed: category configuration not found for "${effectiveCategory}".`,
      error: `No category config found for "${effectiveCategory}".`,
    };
  }

  const { config: categoryConfig } = categoryResolution;

  // --- 3. Convert intent to UserPreference ---
  const preference: UserPreference = {
    category: effectiveCategory,
    budget: input.intent.budget,
    priorities: input.intent.priorities,
    constraints: input.intent.constraints,
  };

  // --- 4. Execute the deterministic decision engine ---
  try {
    const decisionResult: DecisionResult = runDecision(
      input.products,
      preference,
      categoryConfig
    );

    // --- 5. Build output summary ---
    const productCount = decisionResult.scoredProducts.length;
    let outputSummary: string;

    if (productCount === 0) {
      outputSummary = `Decision completed with 0 products matching all requirements for category "${effectiveCategory}".`;
    } else {
      outputSummary = `Ranked ${productCount} product${productCount === 1 ? "" : "s"} for category "${effectiveCategory}".`;
    }

    return {
      success: true,
      decisionResult,
      effectiveCategory,
      outputSummary,
    };
  } catch (err: unknown) {
    // --- Controlled Failure ---
    const errorMessage =
      err instanceof Error ? err.message : "Unknown decision engine error";

    return {
      success: false,
      effectiveCategory,
      outputSummary: `Decision failed: ${errorMessage}.`,
      error: errorMessage,
    };
  }
}
