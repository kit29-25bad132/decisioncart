// ============================================================
// DecisionCart — Review Analyzer
// Deterministic review intelligence analysis.
// No AI calls. No mutations. No external data.
// ============================================================

import type { Product } from "@/types";
import type { ReviewAnalysisResult } from "./types";
import { getReviewsForProducts } from "./review-data";

// --- Public API ---

/**
 * Analyze review intelligence for a list of products.
 *
 * This is a deterministic, synchronous function that looks up
 * structured review intelligence from the demo data store.
 * No AI inference. No web scraping. No external calls.
 *
 * @param products - Products to analyze (from catalog search results)
 * @returns ReviewAnalysisResult with per-product review intelligence
 */
export function analyzeReviews(
  products: Product[]
): ReviewAnalysisResult {
  if (!products || products.length === 0) {
    return {
      success: true,
      reviews: {},
      analyzedCount: 0,
      outputSummary: "No products to analyze for review intelligence.",
    };
  }

  const productIds = products.map((p) => p.id);
  const reviews = getReviewsForProducts(productIds);
  const analyzedCount = Object.keys(reviews).length;

  // Build per-product summaries
  const productSummaries = products
    .filter((p) => reviews[p.id])
    .map((p) => {
      const review = reviews[p.id];
      return `${p.name}: ${review.overallSentiment} (${review.sentimentScore}/100)`;
    });

  let outputSummary: string;
  if (analyzedCount === 0) {
    outputSummary = "Review analysis completed. No review intelligence available for these products.";
  } else if (analyzedCount === 1) {
    outputSummary = `✓ ${analyzedCount} product analyzed — ${productSummaries[0]}`;
  } else {
    outputSummary = `✓ ${analyzedCount} products analyzed — ${productSummaries.slice(0, 2).join("; ")}${analyzedCount > 2 ? ` and ${analyzedCount - 2} more` : ""}`;
  }

  return {
    success: true,
    reviews,
    analyzedCount,
    outputSummary,
  };
}
