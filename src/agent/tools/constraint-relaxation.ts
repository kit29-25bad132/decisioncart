// ============================================================
// DecisionCart — Constraint Relaxation Tool
// Bounded tool: finds intelligent alternatives when no exact
// matches exist. Category-agnostic. Deterministic. No AI calls.
// ============================================================

import type { CategoryConfig, Product, UserPreference } from "@/types";
import type { ConstraintRelaxationToolResult } from "../agent-types";
import { relaxConstraints } from "@/engine/constraint-relaxation";

// --- Public Types ---

/** Input for the constraint relaxation tool. */
export interface ConstraintRelaxationInput {
  /** All products from the catalog (unfiltered by constraints). */
  products: Product[];
  /** User's original preferences including constraints and budget. */
  preference: UserPreference;
  /** The category configuration. */
  categoryConfig: CategoryConfig;
}

// --- Tool Implementation ---

/**
 * Execute the bounded constraint relaxation tool.
 *
 * Analyzes why no products pass all user constraints and finds
 * the closest viable alternatives through intelligent relaxation.
 *
 * @returns ConstraintRelaxationToolResult — never throws.
 */
export async function executeConstraintRelaxation(
  input: ConstraintRelaxationInput
): Promise<ConstraintRelaxationToolResult> {
  // --- 1. Validate input ---
  if (!input.products || input.products.length === 0) {
    return {
      success: true,
      result: {
        exactMatchFound: false,
        alternatives: [],
        relaxedConstraints: [],
        explanation: "No products available to analyze.",
        alternativeCount: 0,
      },
      outputSummary: "Constraint relaxation skipped: no products to analyze.",
    };
  }

  // --- 2. Execute deterministic relaxation ---
  try {
    const result = relaxConstraints(
      input.products,
      input.preference,
      input.categoryConfig
    );

    // --- 3. Build output summary ---
    let outputSummary: string;
    if (result.exactMatchFound) {
      outputSummary = `✓ ${result.alternativeCount} exact match${result.alternativeCount !== 1 ? "es" : ""} found — no relaxation needed.`;
    } else if (result.alternativeCount === 0) {
      outputSummary = "⚠ No exact matches found. No viable alternatives within bounded relaxation limits.";
    } else {
      const constraintCount = result.relaxedConstraints.length;
      outputSummary = `✓ Found ${result.alternativeCount} alternative${result.alternativeCount !== 1 ? "s" : ""} by relaxing ${constraintCount} constraint${constraintCount !== 1 ? "s" : ""}.`;
    }

    return {
      success: true,
      result,
      outputSummary,
    };
  } catch (err: unknown) {
    // --- Controlled Failure ---
    const errorMessage =
      err instanceof Error ? err.message : "Unknown relaxation error";

    return {
      success: false,
      result: {
        exactMatchFound: false,
        alternatives: [],
        relaxedConstraints: [],
        explanation: `Relaxation analysis failed: ${errorMessage}`,
        alternativeCount: 0,
      },
      outputSummary: `Constraint relaxation failed: ${errorMessage}.`,
      error: errorMessage,
    };
  }
}
