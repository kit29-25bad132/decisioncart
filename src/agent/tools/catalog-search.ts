// ============================================================
// DecisionCart — Catalog Search Tool
// Bounded tool: searches the product catalog via the provider registry.
// No AI calls. No mutations. No payment. No hidden reasoning.
// ============================================================

import { fetchProducts } from "@/catalog/registry";
import type { ProductDataRequest } from "@/catalog/provider";
import type { ParsedShoppingIntent } from "@/lib/ai/types";
import type { CatalogSearchToolResult } from "../agent-types";

// --- Public Types ---

/** Input for the catalog search tool. */
export interface CatalogSearchInput {
  /** The parsed shopping intent from the existing parser. */
  intent: ParsedShoppingIntent;
  /** Optional category override (takes precedence over intent.category). */
  categoryOverride?: string;
}

// --- Tool Implementation ---

/**
 * Execute a bounded catalog search.
 *
 * Resolves category from (in priority order):
 *   1. categoryOverride argument
 *   2. intent.category
 *   3. Returns controlled failure if neither is available
 *
 * Maps budget fields from intent.budget to ProductDataRequest fields.
 * Catches provider errors and returns structured failure results.
 *
 * @returns CatalogSearchToolResult — never throws.
 */
export async function executeCatalogSearch(
  input: CatalogSearchInput
): Promise<CatalogSearchToolResult> {
  // --- Category Resolution ---
  const category = input.categoryOverride ?? input.intent.category;

  if (!category) {
    return {
      success: false,
      products: [],
      provider: { id: "none", label: "None" },
      fetchedAt: new Date().toISOString(),
      outputSummary: "Catalog search failed: no category provided.",
      error: "No category provided. Provide a category override or ensure the intent contains a category.",
    };
  }

  // --- Budget Mapping ---
  const budget = input.intent.budget;
  const request: ProductDataRequest = {
    category,
    maxBudget: budget?.max,
    minBudget: budget?.min,
  };

  // --- Execute Provider Search ---
  try {
    const result = await fetchProducts(request);

    // --- Build Summary ---
    const productCount = result.products.length;
    let outputSummary: string;

    if (productCount === 0) {
      outputSummary = `Found 0 products in the ${category} catalog.`;
    } else if (result.metadata?.budgetFiltered) {
      outputSummary = `Found ${productCount} product${productCount === 1 ? "" : "s"} matching the requested budget in the ${category} catalog.`;
    } else {
      outputSummary = `Found ${productCount} product${productCount === 1 ? "" : "s"} in the ${category} catalog.`;
    }

    return {
      success: true,
      products: result.products,
      provider: result.provider,
      fetchedAt: result.fetchedAt,
      metadata: result.metadata,
      outputSummary,
    };
  } catch (err: unknown) {
    // --- Controlled Failure ---
    const errorMessage =
      err instanceof Error ? err.message : "Unknown provider error";

    return {
      success: false,
      products: [],
      provider: { id: "none", label: "None" },
      fetchedAt: new Date().toISOString(),
      outputSummary: `Catalog search failed: ${errorMessage}.`,
      error: errorMessage,
    };
  }
}
