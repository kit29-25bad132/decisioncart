// ============================================================
// DecisionCart — Merchant Offers Tool
// Bounded tool: evaluates merchant offers for ranked products
// using the deterministic merchant decision engine.
// No AI calls. No mutations. No payment. No hidden reasoning.
// ============================================================

import type { MerchantSelection, PriorityItem, Product } from "@/types";
import type { MerchantOffersToolResult } from "../agent-types";
import { getMerchantRepository } from "@/merchant/merchant-repository";
import { runMerchantDecision } from "@/engine/merchant-decision";

// --- Public Types ---

/** Input for the merchant offers tool. */
export interface MerchantOffersInput {
  /** Products from the decision engine (ranked by score). */
  products: Product[];
  /** User priorities from the parsed shopping intent. */
  priorities: PriorityItem[];
}

// --- Tool Implementation ---

/**
 * Execute the bounded merchant offers tool.
 *
 * For each product, retrieves live merchant offers from the repository,
 * then uses the deterministic merchant decision engine to select
 * the best offer for each product based on user priorities.
 *
 * @returns MerchantOffersToolResult — never throws.
 */
export async function executeMerchantOffers(
  input: MerchantOffersInput
): Promise<MerchantOffersToolResult> {
  // --- 1. Validate input ---
  if (!input.products || input.products.length === 0) {
    return {
      success: true,
      selectionsByProductId: {},
      selectionCount: 0,
      outputSummary: "Merchant offers skipped: no products to evaluate.",
    };
  }

  try {
    // --- 2. Retrieve live merchant data from repository ---
    const repo = await getMerchantRepository();
    const allMerchants = await repo.getAllMerchants();

    if (allMerchants.length === 0) {
      return {
        success: true,
        selectionsByProductId: {},
        selectionCount: 0,
        outputSummary: "Merchant offers skipped: no merchants available.",
      };
    }

    // --- 3. Score merchant offers for each product ---
    const selectionsByProductId: Record<string, MerchantSelection> = {};
    let selectionCount = 0;

    for (const product of input.products) {
      const offers = await repo.getOffersByProduct(product.id);

      if (offers.length === 0) {
        // No offers for this product — skip silently
        continue;
      }

      const selection = runMerchantDecision({
        productId: product.id,
        productPrice: product.price,
        offers,
        merchants: allMerchants,
        priorities: input.priorities,
      });

      if (selection) {
        selectionsByProductId[product.id] = selection;
        selectionCount++;
      }
    }

    // --- 4. Build output summary ---
    let outputSummary: string;
    if (selectionCount === 0) {
      outputSummary = "Merchant evaluation completed. No merchant selections available for the ranked products.";
    } else if (selectionCount === 1) {
      const entry = Object.values(selectionsByProductId)[0];
      outputSummary = `Merchant evaluated: ${selectionCount} product — best offer from ${entry.merchant.name}.`;
    } else {
      // Show the top 2 merchant winners
      const selections = Object.values(selectionsByProductId);
      const topMerchants = selections
        .slice(0, 2)
        .map((s) => s.merchant.name);
      outputSummary = `Merchant evaluated: ${selectionCount} product${selectionCount !== 1 ? "s" : ""} — best offers from ${topMerchants.join(" and ")}${selectionCount > 2 ? ` and ${selectionCount - 2} more` : ""}.`;
    }

    return {
      success: true,
      selectionsByProductId,
      selectionCount,
      outputSummary,
    };
  } catch (err: unknown) {
    // --- Controlled Failure ---
    const errorMessage =
      err instanceof Error ? err.message : "Unknown merchant evaluation error";

    return {
      success: false,
      selectionsByProductId: {},
      selectionCount: 0,
      outputSummary: `Merchant evaluation failed: ${errorMessage}.`,
      error: errorMessage,
    };
  }
}
