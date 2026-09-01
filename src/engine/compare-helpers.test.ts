// ============================================================
// DecisionCart — Comparison Helpers Tests
// Verifies category-agnostic comparison logic.
// ============================================================

import { describe, it, expect } from "vitest";
import { compareTopProducts } from "./compare-helpers";
import { runDecision, calculateWeights } from "./decision-engine";
import { getCatalog } from "@/catalog/demo-data";
import { getCategoryConfig } from "@/catalog/categories";
import type { UserPreference, ScoredProduct } from "@/types";

// ============================================================
// 1. Dynamic smartphone comparison
// ============================================================
describe("compareTopProducts: smartphone category", () => {
  it("works with real smartphone catalog data", () => {
    const catalog = getCatalog("smartphone");
    const config = getCategoryConfig("smartphone")!;
    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [{ attributeKey: "camera_score", importance: 3 }],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);
    const weights = calculateWeights(preference.priorities, config.attributes);
    const comparison = compareTopProducts(
      result.scoredProducts,
      config.attributes,
      preference.priorities,
      weights,
      preference.budget
    );

    expect(comparison).not.toBeNull();
    expect(comparison!.products.length).toBeGreaterThan(0);
    expect(comparison!.products.length).toBeLessThanOrEqual(3);
    expect(comparison!.attributes.length).toBe(config.attributes.length);
    expect(comparison!.whyWinnerWins.reasons.length).toBeGreaterThan(0);
    expect(comparison!.decisionInsight.length).toBeGreaterThan(0);
    expect(comparison!.bestForInsights.length).toBe(comparison!.products.length);
  });

  it("compares all 6 smartphone attributes dynamically", () => {
    const catalog = getCatalog("smartphone");
    const config = getCategoryConfig("smartphone")!;
    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);
    const weights = calculateWeights([], config.attributes);
    const comparison = compareTopProducts(
      result.scoredProducts,
      config.attributes,
      [],
      weights
    );

    expect(comparison).not.toBeNull();
    const attrKeys = comparison!.attributes.map((a) => a.attributeKey);
    expect(attrKeys).toContain("camera_score");
    expect(attrKeys).toContain("battery_mah");
    expect(attrKeys).toContain("display_inches");
    expect(attrKeys).toContain("ram_gb");
    expect(attrKeys).toContain("storage_gb");
    expect(attrKeys).toContain("five_g");
  });
});

// ============================================================
// 2. Dynamic laptop comparison
// ============================================================
describe("compareTopProducts: laptop category", () => {
  it("works with real laptop catalog data", () => {
    const catalog = getCatalog("laptop");
    const config = getCategoryConfig("laptop")!;
    const preference: UserPreference = {
      category: "laptop",
      budget: { max: 60000 },
      priorities: [{ attributeKey: "processor_score", importance: 3 }],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);
    const weights = calculateWeights(preference.priorities, config.attributes);
    const comparison = compareTopProducts(
      result.scoredProducts,
      config.attributes,
      preference.priorities,
      weights,
      preference.budget
    );

    expect(comparison).not.toBeNull();
    expect(comparison!.products.length).toBeGreaterThan(0);
    expect(comparison!.attributes.length).toBe(config.attributes.length);
    expect(comparison!.decisionInsight.length).toBeGreaterThan(0);
  });

  it("compares all 6 laptop attributes dynamically", () => {
    const catalog = getCatalog("laptop");
    const config = getCategoryConfig("laptop")!;
    const preference: UserPreference = {
      category: "laptop",
      budget: {},
      priorities: [],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);
    const weights = calculateWeights([], config.attributes);
    const comparison = compareTopProducts(result.scoredProducts, config.attributes, [], weights);

    expect(comparison).not.toBeNull();
    const attrKeys = comparison!.attributes.map((a) => a.attributeKey);
    expect(attrKeys).toContain("processor_score");
    expect(attrKeys).toContain("ram_gb");
    expect(attrKeys).toContain("battery_hours");
    expect(attrKeys).toContain("display_inches");
    expect(attrKeys).toContain("weight_kg");
    expect(attrKeys).toContain("ssd_gb");
  });
});

// ============================================================
// 3. Higher-is-better attributes correctly identify winners
// ============================================================
describe("compareTopProducts: higher_is_better", () => {
  it("identifies the product with the best camera as winner for camera_score", () => {
    const catalog = getCatalog("smartphone");
    const config = getCategoryConfig("smartphone")!;
    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 40000 },
      priorities: [],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);
    const weights = calculateWeights([], config.attributes);
    const comparison = compareTopProducts(result.scoredProducts, config.attributes, [], weights);

    expect(comparison).not.toBeNull();
    const cameraComp = comparison!.attributes.find((a) => a.attributeKey === "camera_score");
    expect(cameraComp).toBeDefined();

    // Winner should be the product with the highest camera score among compared
    if (cameraComp!.winnerProductId) {
      const winnerVal = cameraComp!.values.find(
        (v) => v.productId === cameraComp!.winnerProductId
      );
      for (const v of cameraComp!.values) {
        if (v.available && v.normalizedValue !== null && winnerVal) {
          expect(v.normalizedValue).toBeLessThanOrEqual(winnerVal.normalizedValue!);
        }
      }
    }
  });
});

// ============================================================
// 4. Lower-is-better attributes correctly identify winners
// ============================================================
describe("compareTopProducts: lower_is_better", () => {
  it("identifies the lightest laptop as winner for weight_kg", () => {
    const catalog = getCatalog("laptop");
    const config = getCategoryConfig("laptop")!;
    const preference: UserPreference = {
      category: "laptop",
      budget: {},
      priorities: [],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);
    const weights = calculateWeights([], config.attributes);
    const comparison = compareTopProducts(result.scoredProducts, config.attributes, [], weights);

    expect(comparison).not.toBeNull();
    const weightComp = comparison!.attributes.find((a) => a.attributeKey === "weight_kg");
    expect(weightComp).toBeDefined();

    // Winner should be the lightest
    if (weightComp!.winnerProductId) {
      const winnerVal = weightComp!.values.find(
        (v) => v.productId === weightComp!.winnerProductId
      );
      for (const v of weightComp!.values) {
        if (v.available && v.normalizedValue !== null && winnerVal) {
          // For lower_is_better, winner has lowest normalized value (closest to 0 = lightest)
          expect(v.normalizedValue).toBeGreaterThanOrEqual(winnerVal.normalizedValue!);
        }
      }
    }
  });
});

// ============================================================
// 5. Boolean attributes correctly identify winners
// ============================================================
describe("compareTopProducts: boolean attributes", () => {
  it("identifies 5G-enabled product as winner for five_g", () => {
    const catalog = getCatalog("smartphone");
    const config = getCategoryConfig("smartphone")!;
    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);
    const weights = calculateWeights([], config.attributes);
    const comparison = compareTopProducts(result.scoredProducts, config.attributes, [], weights);

    expect(comparison).not.toBeNull();
    const fiveGComp = comparison!.attributes.find((a) => a.attributeKey === "five_g");
    expect(fiveGComp).toBeDefined();

    // All smartphones in the demo catalog have 5G, so winner should be one of them
    if (fiveGComp!.winnerProductId) {
      const winnerVal = fiveGComp!.values.find(
        (v) => v.productId === fiveGComp!.winnerProductId
      );
      expect(winnerVal?.rawValue).toBe(true);
    }
  });
});

// ============================================================
// 6. Only available products are compared
// ============================================================
describe("compareTopProducts: availability", () => {
  it("only includes products in the comparison", () => {
    const catalog = getCatalog("smartphone");
    const config = getCategoryConfig("smartphone")!;
    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);
    const weights = calculateWeights([], config.attributes);
    const comparison = compareTopProducts(result.scoredProducts, config.attributes, [], weights);

    expect(comparison).not.toBeNull();
    const comparedIds = new Set(comparison!.products.map((p) => p.product.id));
    const allIds = new Set(result.scoredProducts.map((sp) => sp.product.id));

    // Every compared product must be in the original results
    for (const id of comparedIds) {
      expect(allIds.has(id)).toBe(true);
    }

    // Compared products should be <= 3
    expect(comparedIds.size).toBeLessThanOrEqual(3);
  });
});

// ============================================================
// 7. One-product results do not crash
// ============================================================
describe("compareTopProducts: single product", () => {
  it("handles single product result", () => {
    const catalog = getCatalog("smartphone");
    const config = getCategoryConfig("smartphone")!;
    // Budget so tight only one product fits
    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 22000 },
      priorities: [],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);
    if (result.scoredProducts.length !== 1) return; // skip if not exactly 1

    const weights = calculateWeights([], config.attributes);
    const comparison = compareTopProducts(result.scoredProducts, config.attributes, [], weights);

    expect(comparison).not.toBeNull();
    expect(comparison!.products.length).toBe(1);
    expect(comparison!.runnerUp).toBeNull();
    expect(comparison!.whyWinnerWins.reasons.length).toBeGreaterThan(0);
    expect(comparison!.decisionInsight.length).toBeGreaterThan(0);
  });
});

// ============================================================
// 8. Two-product results do not crash
// ============================================================
describe("compareTopProducts: two products", () => {
  it("handles two product result", () => {
    const catalog = getCatalog("smartphone");
    const config = getCategoryConfig("smartphone")!;
    // Budget allows exactly 2 phones
    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 27000 },
      priorities: [],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);
    if (result.scoredProducts.length !== 2) return; // skip if not exactly 2

    const weights = calculateWeights([], config.attributes);
    const comparison = compareTopProducts(result.scoredProducts, config.attributes, [], weights);

    expect(comparison).not.toBeNull();
    expect(comparison!.products.length).toBe(2);
    expect(comparison!.runnerUp).not.toBeNull();
    expect(Object.keys(comparison!.whyChooseAlternatives)).toHaveLength(1);
  });
});

// ============================================================
// 9. Comparison explanations use real product data
// ============================================================
describe("compareTopProducts: real data in explanations", () => {
  it("whyWinnerWins references actual product names and attributes", () => {
    const catalog = getCatalog("smartphone");
    const config = getCategoryConfig("smartphone")!;
    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [{ attributeKey: "camera_score", importance: 3 }],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);
    const weights = calculateWeights(preference.priorities, config.attributes);
    const comparison = compareTopProducts(
      result.scoredProducts,
      config.attributes,
      preference.priorities,
      weights,
      preference.budget
    );

    expect(comparison).not.toBeNull();

    // Decision insight should reference the actual winner product name
    expect(comparison!.decisionInsight).toContain(comparison!.winner.product.name);
  });

  it("bestForInsights reference actual attribute labels", () => {
    const catalog = getCatalog("smartphone");
    const config = getCategoryConfig("smartphone")!;
    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);
    const weights = calculateWeights([], config.attributes);
    const comparison = compareTopProducts(result.scoredProducts, config.attributes, [], weights);

    expect(comparison).not.toBeNull();
    const validLabels = new Set(config.attributes.map((a) => a.label));

    for (const insight of comparison!.bestForInsights) {
      for (const label of insight.topAttributeLabels) {
        expect(validLabels.has(label)).toBe(true);
      }
    }
  });
});

// ============================================================
// 10. Comparison does not modify existing decision scores
// ============================================================
describe("compareTopProducts: immutability", () => {
  it("does not modify the scoredProducts array or individual scores", () => {
    const catalog = getCatalog("smartphone");
    const config = getCategoryConfig("smartphone")!;
    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [{ attributeKey: "camera_score", importance: 3 }],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);
    const weights = calculateWeights(preference.priorities, config.attributes);

    // Snapshot original scores
    const originalScores = result.scoredProducts.map((sp) => ({
      id: sp.product.id,
      score: sp.totalScore,
    }));

    compareTopProducts(result.scoredProducts, config.attributes, preference.priorities, weights, preference.budget);

    // Scores must be unchanged
    for (const sp of result.scoredProducts) {
      const orig = originalScores.find((o) => o.id === sp.product.id);
      expect(orig).toBeDefined();
      expect(sp.totalScore).toBe(orig!.score);
    }
  });
});

// ============================================================
// Empty/null cases
// ============================================================
describe("compareTopProducts: edge cases", () => {
  it("returns null for empty scoredProducts", () => {
    const config = getCategoryConfig("smartphone")!;
    const comparison = compareTopProducts([], config.attributes, [], {});
    expect(comparison).toBeNull();
  });

  it("returns null for undefined scoredProducts", () => {
    const config = getCategoryConfig("smartphone")!;
    const comparison = compareTopProducts(
      undefined as unknown as ScoredProduct[],
      config.attributes,
      [],
      {}
    );
    expect(comparison).toBeNull();
  });
});
