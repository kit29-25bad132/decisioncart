// ============================================================
// DecisionCart — Purchase Selection Validity
// Pure TypeScript. Deterministic validation of purchase selection.
//
// INVARIANT: purchaseProductId must always be either null or
// an ID contained in the current ranked eligible products.
// ============================================================

import type { ScoredProduct } from "@/types";

/**
 * Validate whether a purchase selection remains valid given
 * the current set of scored products.
 *
 * Returns the validated productId (null if invalid).
 *
 * Rules:
 * - If productId is null, returns null.
 * - If productId is not in scoredProducts, returns null.
 * - Otherwise returns the original productId.
 */
export function validatePurchaseSelection(
  purchaseProductId: string | null,
  scoredProducts: ScoredProduct[]
): string | null {
  if (purchaseProductId === null) return null;

  const exists = scoredProducts.some(
    (sp) => sp.product.id === purchaseProductId
  );

  return exists ? purchaseProductId : null;
}

/**
 * Check whether a product is eligible for purchase selection.
 * A product is eligible if it exists in the current scored products.
 */
export function isProductEligibleForPurchase(
  productId: string,
  scoredProducts: ScoredProduct[]
): boolean {
  return scoredProducts.some((sp) => sp.product.id === productId);
}
