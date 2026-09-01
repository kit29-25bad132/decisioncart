// ============================================================
// DecisionCart — resolveEffectiveSelectedId Tests
// Verifies stale selection prevention behavior.
// ============================================================

import { describe, it, expect } from "vitest";
import { resolveEffectiveSelectedId } from "./decision-engine";
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

describe("resolveEffectiveSelectedId", () => {
  const products = [makeScored("a"), makeScored("b"), makeScored("c")];

  it("returns null when scoredProducts is empty", () => {
    expect(resolveEffectiveSelectedId(null, [])).toBeNull();
  });

  it("returns null when scoredProducts is empty even with a selected ID", () => {
    expect(resolveEffectiveSelectedId("a", [])).toBeNull();
  });

  it("returns the selected ID when it exists in scoredProducts", () => {
    expect(resolveEffectiveSelectedId("b", products)).toBe("b");
  });

  it("returns the top ranked product when selectedProductId is null", () => {
    // products[0] is the first element (highest ranked after sorting)
    expect(resolveEffectiveSelectedId(null, products)).toBe("a");
  });

  it("falls back to the top ranked product when selectedProductId is stale", () => {
    expect(resolveEffectiveSelectedId("z", products)).toBe("a");
  });

  it("returns null for empty scoredProducts regardless of selectedProductId", () => {
    expect(resolveEffectiveSelectedId(null, [])).toBeNull();
    expect(resolveEffectiveSelectedId("anything", [])).toBeNull();
  });

  it("preserves the selected product after a query change that keeps it in results", () => {
    const sameProducts = [makeScored("a"), makeScored("b")];
    expect(resolveEffectiveSelectedId("a", sameProducts)).toBe("a");
  });

  it("falls back to top product after budget change removes the selected product", () => {
    const afterBudgetChange = [makeScored("b"), makeScored("c")];
    expect(resolveEffectiveSelectedId("a", afterBudgetChange)).toBe("b");
  });

  it("falls back to top product after category change replaces the product set", () => {
    const newCategoryProducts = [makeScored("x"), makeScored("y")];
    expect(resolveEffectiveSelectedId("a", newCategoryProducts)).toBe("x");
  });
});
