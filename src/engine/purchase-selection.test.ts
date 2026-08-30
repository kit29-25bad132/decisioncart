// ============================================================
// DecisionCart — Purchase Selection Validity Tests
// Verifies selection invariant and invalidation behavior.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  validatePurchaseSelection,
  isProductEligibleForPurchase,
} from "./purchase-selection";
import type { ScoredProduct } from "@/types";

function makeScored(id: string): ScoredProduct {
  return {
    product: {
      id,
      name: `Product ${id}`,
      brand: "Test",
      category: "smartphone",
      price: 25000,
      attributes: {},
      confidence: {},
    },
    totalScore: 70,
    rank: 1,
    contributions: [],
    missingAttributes: [],
    strengths: [],
    weaknesses: [],
    dataConfidence: "high",
  };
}

describe("validatePurchaseSelection", () => {
  const products = [makeScored("p1"), makeScored("p2"), makeScored("p3")];

  it("returns null when purchaseProductId is null", () => {
    expect(validatePurchaseSelection(null, products)).toBeNull();
  });

  it("returns the ID when it exists in scoredProducts", () => {
    expect(validatePurchaseSelection("p2", products)).toBe("p2");
  });

  it("returns null when the ID is not in scoredProducts (stale)", () => {
    expect(validatePurchaseSelection("p99", products)).toBeNull();
  });

  it("returns null for empty scoredProducts array", () => {
    expect(validatePurchaseSelection("p1", [])).toBeNull();
  });

  it("handles category switch — old product no longer in results", () => {
    const smartphoneProducts = [makeScored("phone-1"), makeScored("phone-2")];
    const laptopProducts = [makeScored("laptop-1"), makeScored("laptop-2")];

    // Select a smartphone
    const selected = validatePurchaseSelection("phone-1", smartphoneProducts);
    expect(selected).toBe("phone-1");

    // Category switches to laptop — phone-1 is no longer eligible
    const validated = validatePurchaseSelection("phone-1", laptopProducts);
    expect(validated).toBeNull();
  });

  it("handles budget exclusion — product no longer eligible", () => {
    const allProducts = [
      makeScored("cheap"),
      makeScored("expensive"),
    ];

    // Both eligible
    expect(validatePurchaseSelection("expensive", allProducts)).toBe("expensive");

    // Budget lowered — expensive excluded, only cheap remains
    const budgetFiltered = [makeScored("cheap")];
    expect(validatePurchaseSelection("expensive", budgetFiltered)).toBeNull();
  });

  it("handles zero results — no crash, returns null", () => {
    expect(validatePurchaseSelection("p1", [])).toBeNull();
  });

  it("does NOT auto-select another product when selection is invalid", () => {
    const filtered = [makeScored("other")];
    const result = validatePurchaseSelection("p1", filtered);
    // Should be null, not "other"
    expect(result).toBeNull();
    expect(result).not.toBe("other");
  });
});

describe("isProductEligibleForPurchase", () => {
  const products = [makeScored("p1"), makeScored("p2")];

  it("returns true for eligible product", () => {
    expect(isProductEligibleForPurchase("p1", products)).toBe(true);
  });

  it("returns false for ineligible product", () => {
    expect(isProductEligibleForPurchase("p99", products)).toBe(false);
  });

  it("returns false for empty products", () => {
    expect(isProductEligibleForPurchase("p1", [])).toBe(false);
  });
});
