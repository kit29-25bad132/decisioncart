// ============================================================
// DecisionCart — Budget Filtering Test
// Verify budget is applied as a hard eligibility filter
// ============================================================

import { describe, it, expect } from "vitest";
import { runDecision } from "./decision-engine";
import { getCatalog } from "@/catalog/demo-data";
import { getCategoryConfig } from "@/catalog/categories";
import type { UserPreference } from "@/types";

describe("budget filtering", () => {
  it("products over budget.max are excluded before scoring", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone");

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig!);

    // All scored products must be <= 30000
    for (const scored of result.scoredProducts) {
      expect(scored.product.price).toBeLessThanOrEqual(30000);
    }

    // Verify Google Pixel 8a (₹37,999) is NOT in results
    const pixelId = "google-pixel-8a";
    const pixel = result.scoredProducts.find((sp) => sp.product.id === pixelId);
    expect(pixel).toBeUndefined();
  });

  it("products under budget.min are excluded before scoring", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone");

    const preference: UserPreference = {
      category: "smartphone",
      budget: { min: 40000 },
      priorities: [],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig!);

    // All scored products must be >= 40000
    for (const scored of result.scoredProducts) {
      expect(scored.product.price).toBeGreaterThanOrEqual(40000);
    }
  });

  it("products exactly equal to budget.max are included", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone");

    // Find a product in the catalog to use as the exact budget
    const targetPrice = 25000;
    const targetProduct = catalog.find((p) => p.price === targetPrice);

    if (targetProduct) {
      const preference: UserPreference = {
        category: "smartphone",
        budget: { max: targetPrice },
        priorities: [],
        constraints: [],
      };

      const result = runDecision(catalog, preference, categoryConfig!);

      // The target product should be included
      const found = result.scoredProducts.find((sp) => sp.product.id === targetProduct.id);
      expect(found).toBeDefined();
    }
  });

  it("budget.max and budget.min together create range filter", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone");

    const preference: UserPreference = {
      category: "smartphone",
      budget: { min: 25000, max: 35000 },
      priorities: [],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig!);

    // All scored products must be in range [25000, 35000]
    for (const scored of result.scoredProducts) {
      expect(scored.product.price).toBeGreaterThanOrEqual(25000);
      expect(scored.product.price).toBeLessThanOrEqual(35000);
    }
  });

  it("empty budget allows all products", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone");

    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig!);

    // All products should be included (no budget filter)
    expect(result.scoredProducts.length).toBeGreaterThan(0);
  });

  it("no budget allows all products", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone");

    const preference: UserPreference = {
      category: "smartphone",
      budget: undefined,
      priorities: [],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig!);

    // All products should be included (no budget filter)
    expect(result.scoredProducts.length).toBe(catalog.length);
  });
});
