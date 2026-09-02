// ============================================================
// DecisionCart — Product Comparison Tool
// Bounded tool: generates deterministic product comparison insights.
// No AI calls. No mutations. No payment. No hidden reasoning.
// Reuses existing engine helpers exclusively.
// ============================================================

import type { DecisionToolResult, ProductComparisonResult } from "../agent-types";
import { compareTopProducts } from "@/engine/compare-helpers";
import { resolveCategoryConfig } from "@/catalog/category-resolver";

// --- Public Types ---

/** Input for the product comparison tool. */
export interface ProductComparisonInput {
  /** Typed result from the run_decision tool. */
  decisionToolResult: DecisionToolResult;
  /** Optional maximum number of products to compare (default: 3). */
  maxProducts?: number;
}

// --- Tool Implementation ---

/**
 * Execute the bounded product comparison tool.
 *
 * Takes the output of the decision runner and produces deterministic
 * comparison insights using existing engine helpers:
 *   - compareTopProducts() from compare-helpers.ts
 *   - resolveCategoryConfig() from category-resolver
 *
 * All weights, priorities, and budget are sourced from the DecisionResult,
 * which stores them from the original scoring pass.
 *
 * @returns ProductComparisonResult — never throws.
 */
export async function executeProductComparison(
  input: ProductComparisonInput
): Promise<ProductComparisonResult> {
  // --- 1. Validate that a DecisionResult exists ---
  const { decisionToolResult } = input;

  if (!decisionToolResult.success || !decisionToolResult.decisionResult) {
    return {
      success: false,
      productCount: 0,
      outputSummary:
        "Comparison skipped: no successful decision result available.",
      error: "No successful decision result available for comparison.",
    };
  }

  const { decisionResult } = decisionToolResult;

  // --- 2. Handle empty scoredProducts ---
  if (
    !decisionResult.scoredProducts ||
    decisionResult.scoredProducts.length === 0
  ) {
    return {
      success: true,
      productCount: 0,
      outputSummary:
        "Comparison completed with no products to compare. No matching products were found.",
    };
  }

  // --- 3. Resolve category config ---
  const effectiveCategory = decisionToolResult.effectiveCategory;
  const categoryResolution = resolveCategoryConfig(effectiveCategory);

  if (!categoryResolution) {
    return {
      success: false,
      productCount: decisionResult.scoredProducts.length,
      outputSummary: `Comparison failed: category configuration not found for "${effectiveCategory}".`,
      error: `No category config found for "${effectiveCategory}".`,
    };
  }

  const { config: categoryConfig } = categoryResolution;

  // --- 4. Select top products and limit ---
  const maxProducts = input.maxProducts ?? 3;
  const topProducts = decisionResult.scoredProducts.slice(0, maxProducts);

  // Use weights and priorities stored in the DecisionResult by the decision engine.
  // These are deterministic reconstructions of the exact values used during scoring.
  const weights = decisionResult.weights ?? {};
  const priorities = decisionResult.priorities ?? [];
  const budget = decisionResult.budget;

  // --- 5. Generate deterministic comparison data ---
  try {
    const comparison = compareTopProducts(
      topProducts,
      categoryConfig.attributes,
      priorities,
      weights,
      budget
    );

    // --- 6. Build output summary ---
    const productCount = topProducts.length;
    let outputSummary: string;

    if (productCount === 1) {
      const p = topProducts[0];
      outputSummary = `Compared 1 product: ${p.product.name} (score: ${p.totalScore}/100). Only one matching product is available.`;
    } else if (productCount >= 2 && comparison) {
      const winner = comparison.winner;
      const runnerUp = comparison.runnerUp;
      outputSummary = `Compared ${productCount} products. Winner: ${winner.product.name} (score: ${winner.score}/100).`;
      if (runnerUp) {
        const margin = (winner.score - runnerUp.score).toFixed(1);
        outputSummary += ` Runner-up: ${runnerUp.product.name} (score: ${runnerUp.score}/100, margin: ${margin} points).`;
      }
    } else {
      outputSummary = `Compared ${productCount} product${productCount === 1 ? "" : "s"}.`;
    }

    return {
      success: true,
      comparison: comparison ?? undefined,
      productCount,
      outputSummary,
    };
  } catch (err: unknown) {
    // --- Controlled Failure ---
    const errorMessage =
      err instanceof Error ? err.message : "Unknown comparison error";

    return {
      success: false,
      productCount: topProducts.length,
      outputSummary: `Comparison failed: ${errorMessage}.`,
      error: errorMessage,
    };
  }
}
