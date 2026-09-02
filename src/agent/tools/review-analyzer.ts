// ============================================================
// DecisionCart — Review Analyzer Tool
// Bounded tool: analyzes structured review intelligence for products.
// No AI calls. No mutations. No payment. No hidden reasoning.
// ============================================================

import type { Product } from "@/types";
import type { ReviewAnalysisToolResult } from "../agent-types";
import { analyzeReviews } from "@/reviews/review-analyzer";

// --- Public Types ---

/** Input for the review analyzer tool. */
export interface ReviewAnalyzerInput {
  /** Products returned from catalog search. */
  products: Product[];
}

// --- Tool Implementation ---

/**
 * Execute the bounded review analyzer tool.
 *
 * Takes products from the catalog search and produces deterministic
 * review intelligence using the demo review data store.
 *
 * @returns ReviewAnalysisToolResult — never throws.
 */
export async function executeReviewAnalyzer(
  input: ReviewAnalyzerInput
): Promise<ReviewAnalysisToolResult> {
  // --- 1. Validate input ---
  if (!input.products || input.products.length === 0) {
    return {
      success: true,
      reviews: {},
      analyzedCount: 0,
      outputSummary: "Review analysis skipped: no products to analyze.",
    };
  }

  // --- 2. Execute deterministic review analysis ---
  try {
    const result = analyzeReviews(input.products);

    return {
      success: result.success,
      reviews: result.reviews,
      analyzedCount: result.analyzedCount,
      outputSummary: result.outputSummary,
    };
  } catch (err: unknown) {
    // --- Controlled Failure ---
    const errorMessage =
      err instanceof Error ? err.message : "Unknown review analysis error";

    return {
      success: false,
      reviews: {},
      analyzedCount: 0,
      outputSummary: `Review analysis failed: ${errorMessage}.`,
      error: errorMessage,
    };
  }
}
