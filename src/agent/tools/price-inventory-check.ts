// ============================================================
// DecisionCart — Price & Inventory Check Tool
// Bounded tool: verifies product price and availability against
// the trusted server-side catalog. Never trusts client data.
// No mutations. No payment. No external API calls.
// ============================================================

import type { Product } from "@/types";
import { getCatalog } from "@/catalog/demo-data";
import type { PriceInventoryCheckToolResult } from "../agent-types";

// --- Public Types ---

/** Input for the price inventory check tool. */
export interface PriceInventoryCheckInput {
  /** Product ID to verify. */
  productId: string;
  /** Category to verify against (prevents category mismatch). */
  category: string;
  /** Optional client-reported price to compare against trusted price. */
  clientPrice?: number;
}

// --- Tool Implementation ---

/**
 * Execute the bounded price & inventory check tool.
 *
 * Resolves the product from the trusted server-side catalog and verifies:
 * 1. Product exists in the catalog
 * 2. Category matches (prevents spoofing)
 * 3. Trusted server-side price is returned
 * 4. Availability is reported honestly (demo catalog = always available)
 *
 * Client-provided prices are NEVER trusted — the server always
 * resolves the canonical price from the catalog.
 *
 * @returns PriceInventoryCheckToolResult — never throws.
 */
export async function executePriceInventoryCheck(
  input: PriceInventoryCheckInput
): Promise<PriceInventoryCheckToolResult> {
  const { productId, category, clientPrice } = input;

  // --- 1. Validate required fields ---
  if (!productId || typeof productId !== "string" || productId.trim().length === 0) {
    return {
      success: false,
      productId: productId || "",
      checkedAt: new Date().toISOString(),
      source: "DecisionCart demo catalog",
      error: "productId is required and must be a non-empty string.",
    };
  }

  if (!category || typeof category !== "string" || category.trim().length === 0) {
    return {
      success: false,
      productId: productId.trim(),
      checkedAt: new Date().toISOString(),
      source: "DecisionCart demo catalog",
      error: "category is required and must be a non-empty string.",
    };
  }

  // --- 2. Resolve product from trusted server-side catalog ---
  const catalog = getCatalog(category.trim());
  const product: Product | undefined = catalog.find(
    (p) => p.id === productId.trim()
  );

  // --- 3. Handle: product not found ---
  if (!product) {
    return {
      success: false,
      productId: productId.trim(),
      checkedAt: new Date().toISOString(),
      source: "DecisionCart demo catalog",
      error: `Product "${productId.trim()}" not found in "${category.trim()}" catalog.`,
    };
  }

  // --- 4. Verify category matches (prevent cross-category spoofing) ---
  if (product.category !== category.trim()) {
    return {
      success: false,
      productId: productId.trim(),
      checkedAt: new Date().toISOString(),
      source: "DecisionCart demo catalog",
      error: `Category mismatch: product belongs to "${product.category}" but "${category.trim()}" was requested.`,
    };
  }

  // --- 5. Check if client price differs from trusted price ---
  const priceMismatch = clientPrice !== undefined && clientPrice !== product.price;

  // --- 6. Build verification result ---
  // Demo catalog products are always "available" — we represent this honestly.
  const result: PriceInventoryCheckToolResult = {
    success: true,
    productId: product.id,
    verifiedPrice: product.price,
    currency: "INR",
    available: true,
    availabilitySource: "demo-catalog",
    checkedAt: new Date().toISOString(),
    source: "DecisionCart demo catalog",
    priceMismatch: priceMismatch
      ? {
          clientPrice,
          trustedPrice: product.price,
          difference: product.price - clientPrice,
        }
      : undefined,
  };

  return result;
}
