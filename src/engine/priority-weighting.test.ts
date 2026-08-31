// ============================================================
// DecisionCart — Priority Weighting Regression Tests
//
// Validates the baseline-priority + explicit-priority blending:
//   EXPLICIT USER PRIORITY
//        +
//   CATEGORY BASELINE IMPORTANCE
//        ↓
//   DYNAMIC WEIGHT RESOLUTION
//        ↓
//   NORMALIZED WEIGHTS
//        ↓
//   MULTI-ATTRIBUTE SCORING
//
// Covers scenarios A–F from the audit spec.
// ============================================================

import { describe, it, expect } from "vitest";
import { runDecision, calculateWeights, buildDecisionMatrix } from "./decision-engine";
import { getCatalog } from "@/catalog/demo-data";
import { getCategoryConfig } from "@/catalog/categories";
import type { UserPreference, Product } from "@/types";

// ============================================================
// 1. Single explicit priority does not force other attributes to zero
// ============================================================

describe("Priority weighting: single explicit priority", () => {
  it("storage-only priority still gives non-zero weight to all other attributes", () => {
    const attributes = getCategoryConfig("smartphone")!.attributes;
    const weights = calculateWeights(
      [{ attributeKey: "storage_gb", importance: 3 }],
      attributes
    );

    // storage_gb must have the highest weight
    expect(weights["storage_gb"]).toBeGreaterThan(0);

    // All other attributes must have non-zero weight
    for (const attr of attributes) {
      if (attr.key === "storage_gb") continue;
      expect(weights[attr.key]).toBeGreaterThan(0);
    }
  });

  it("explicit priority receives strictly greater weight than any baseline attribute", () => {
    const attributes = getCategoryConfig("smartphone")!.attributes;
    const weights = calculateWeights(
      [{ attributeKey: "storage_gb", importance: 3 }],
      attributes
    );

    for (const attr of attributes) {
      if (attr.key === "storage_gb") continue;
      expect(weights["storage_gb"]).toBeGreaterThan(weights[attr.key]);
    }
  });

  it("storage-only priority does NOT produce identical scores for products with equal storage", () => {
    const categoryConfig = getCategoryConfig("smartphone")!;

    // Two products with identical storage but different other attributes
    const testCatalog: Product[] = [
      {
        id: "storage-a",
        name: "High Storage Phone",
        brand: "Test",
        category: "smartphone",
        price: 20000,
        attributes: {
          camera_score: 90,
          storage_gb: 256,
          battery_mah: 5500,
          ram_gb: 12,
          display_inches: 6.7,
          five_g: true,
        },
        confidence: {},
      },
      {
        id: "storage-b",
        name: "Low Storage Phone",
        brand: "Test",
        category: "smartphone",
        price: 20000,
        attributes: {
          camera_score: 60,
          storage_gb: 256,
          battery_mah: 4000,
          ram_gb: 8,
          display_inches: 6.1,
          five_g: false,
        },
        confidence: {},
      },
    ];

    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [{ attributeKey: "storage_gb", importance: 3 }],
      constraints: [],
    };

    const result = runDecision(testCatalog, preference, categoryConfig);
    expect(result.scoredProducts.length).toBe(2);

    // Scores should NOT be identical — baseline attributes differentiate
    expect(result.scoredProducts[0].totalScore).not.toBe(
      result.scoredProducts[1].totalScore
    );
    // Better-featured phone should win
    expect(result.scoredProducts[0].product.id).toBe("storage-a");
  });
});

// ============================================================
// 2. Explicit priorities receive greater effective weight than baseline
// ============================================================

describe("Priority weighting: explicit priority dominance", () => {
  it("great camera priority gives camera the highest weight", () => {
    const attributes = getCategoryConfig("smartphone")!.attributes;
    const weights = calculateWeights(
      [{ attributeKey: "camera_score", importance: 3 }],
      attributes
    );

    expect(weights["camera_score"]).toBeGreaterThan(0);

    // Camera must have the highest weight among all attributes
    for (const attr of attributes) {
      expect(weights["camera_score"]).toBeGreaterThanOrEqual(weights[attr.key]);
    }
  });

  it("camera priority produces higher score for product with better camera", () => {
    const categoryConfig = getCategoryConfig("smartphone")!;

    const testCatalog: Product[] = [
      {
        id: "camera-good",
        name: "Great Camera Phone",
        brand: "Test",
        category: "smartphone",
        price: 25000,
        attributes: {
          camera_score: 95,
          storage_gb: 128,
          battery_mah: 4000,
          ram_gb: 8,
          display_inches: 6.1,
          five_g: true,
        },
        confidence: {},
      },
      {
        id: "camera-bad",
        name: "Basic Camera Phone",
        brand: "Test",
        category: "smartphone",
        price: 25000,
        attributes: {
          camera_score: 50,
          storage_gb: 256,
          battery_mah: 5500,
          ram_gb: 12,
          display_inches: 6.7,
          five_g: false,
        },
        confidence: {},
      },
    ];

    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [{ attributeKey: "camera_score", importance: 3 }],
      constraints: [],
    };

    const result = runDecision(testCatalog, preference, categoryConfig);
    // Better camera phone should win
    expect(result.scoredProducts[0].product.id).toBe("camera-good");
  });
});

// ============================================================
// 3. Multiple explicit priorities
// ============================================================

describe("Priority weighting: multiple explicit priorities", () => {
  it("two high-priority attributes both get boosted weights", () => {
    const attributes = getCategoryConfig("smartphone")!.attributes;
    const weights = calculateWeights(
      [
        { attributeKey: "camera_score", importance: 3 },
        { attributeKey: "battery_mah", importance: 3 },
      ],
      attributes
    );

    // Both explicit priorities should have the highest weights
    const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);
    const topKeys = sorted.slice(0, 2).map(([k]) => k);
    expect(topKeys).toContain("camera_score");
    expect(topKeys).toContain("battery_mah");
  });

  it("multiple explicit priorities work with real catalog", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [
        { attributeKey: "camera_score", importance: 3 },
        { attributeKey: "battery_mah", importance: 3 },
      ],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig);
    expect(result.scoredProducts.length).toBeGreaterThan(0);

    // Camera and battery contributions should both be non-zero
    for (const sp of result.scoredProducts) {
      const cameraContrib = sp.contributions.find(
        (c) => c.attributeKey === "camera_score"
      );
      const batteryContrib = sp.contributions.find(
        (c) => c.attributeKey === "battery_mah"
      );
      expect(cameraContrib?.weight).toBeGreaterThan(0);
      expect(batteryContrib?.weight).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// 4. No explicit priorities uses category baseline weights
// ============================================================

describe("Priority weighting: no explicit priorities", () => {
  it("empty priorities still produce non-zero weights for all attributes", () => {
    const attributes = getCategoryConfig("smartphone")!.attributes;
    const weights = calculateWeights([], attributes);

    // All attributes must have non-zero weight from baseline
    for (const attr of attributes) {
      expect(weights[attr.key]).toBeGreaterThan(0);
    }
  });

  it("weights sum to approximately 1.0", () => {
    const attributes = getCategoryConfig("smartphone")!.attributes;
    const weights = calculateWeights([], attributes);
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("empty priorities produce meaningful scores for real catalog", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig);
    expect(result.scoredProducts.length).toBeGreaterThan(0);

    // Scores should be differentiated (not all zero)
    const scores = result.scoredProducts.map((sp) => sp.totalScore);
    expect(scores.some((s) => s > 0)).toBe(true);
  });
});

// ============================================================
// 5. Hard constraints remain filters
// ============================================================

describe("Priority weighting: hard constraints remain filters", () => {
  it("5G required attribute constraint filters products before scoring", () => {
    const categoryConfig = getCategoryConfig("smartphone")!;

    const testCatalog: Product[] = [
      {
        id: "has-5g",
        name: "5G Phone",
        brand: "Test",
        category: "smartphone",
        price: 25000,
        attributes: {
          camera_score: 80,
          storage_gb: 256,
          battery_mah: 5000,
          ram_gb: 8,
          display_inches: 6.5,
          five_g: true,
        },
        confidence: {},
      },
      {
        id: "no-5g",
        name: "4G Phone",
        brand: "Test",
        category: "smartphone",
        price: 25000,
        attributes: {
          camera_score: 90,
          storage_gb: 512,
          battery_mah: 6000,
          ram_gb: 16,
          display_inches: 6.7,
          five_g: false,
        },
        confidence: {},
      },
    ];

    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [{ attributeKey: "camera_score", importance: 3 }],
      constraints: [
        { type: "required_attribute", attributeKey: "five_g", value: true },
      ],
    };

    const result = runDecision(testCatalog, preference, categoryConfig);
    // Only the 5G phone should be in results
    expect(result.scoredProducts.length).toBe(1);
    expect(result.scoredProducts[0].product.id).toBe("has-5g");
  });

  it("budget constraint remains a filter", () => {
    const categoryConfig = getCategoryConfig("smartphone")!;

    const testCatalog: Product[] = [
      {
        id: "cheap",
        name: "Budget Phone",
        brand: "Test",
        category: "smartphone",
        price: 15000,
        attributes: {
          camera_score: 70,
          storage_gb: 128,
          battery_mah: 4000,
          ram_gb: 6,
          display_inches: 6.1,
          five_g: true,
        },
        confidence: {},
      },
      {
        id: "expensive",
        name: "Premium Phone",
        brand: "Test",
        category: "smartphone",
        price: 35000,
        attributes: {
          camera_score: 95,
          storage_gb: 512,
          battery_mah: 5500,
          ram_gb: 16,
          display_inches: 6.7,
          five_g: true,
        },
        confidence: {},
      },
    ];

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 20000 },
      priorities: [{ attributeKey: "camera_score", importance: 3 }],
      constraints: [],
    };

    const result = runDecision(testCatalog, preference, categoryConfig);
    // Only the cheap phone should be in results
    expect(result.scoredProducts.length).toBe(1);
    expect(result.scoredProducts[0].product.id).toBe("cheap");
  });
});

// ============================================================
// 6. Weights are deterministic
// ============================================================

describe("Priority weighting: determinism", () => {
  it("same priorities always produce same weights", () => {
    const attributes = getCategoryConfig("smartphone")!.attributes;
    const priorities = [
      { attributeKey: "camera_score", importance: 3 },
      { attributeKey: "storage_gb", importance: 2 },
    ];

    const weights1 = calculateWeights(priorities, attributes);
    const weights2 = calculateWeights(priorities, attributes);
    const weights3 = calculateWeights(priorities, attributes);

    expect(weights1).toEqual(weights2);
    expect(weights2).toEqual(weights3);
  });

  it("weights always sum to approximately 1.0", () => {
    const attributes = getCategoryConfig("smartphone")!.attributes;

    const scenarios = [
      [],
      [{ attributeKey: "camera_score", importance: 3 }],
      [
        { attributeKey: "camera_score", importance: 3 },
        { attributeKey: "storage_gb", importance: 2 },
      ],
      [
        { attributeKey: "camera_score", importance: 1 },
        { attributeKey: "battery_mah", importance: 1 },
        { attributeKey: "display_inches", importance: 1 },
        { attributeKey: "ram_gb", importance: 1 },
        { attributeKey: "storage_gb", importance: 1 },
        { attributeKey: "five_g", importance: 1 },
      ],
    ];

    for (const priorities of scenarios) {
      const weights = calculateWeights(priorities, attributes);
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 10);
    }
  });
});

// ============================================================
// 7. BestMatch always equals scoredProducts[0]
// ============================================================

describe("Priority weighting: BestMatch invariant", () => {
  it("scoredProducts[0] is always the product with the highest score", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const scenarios: UserPreference[] = [
      // No priorities
      { category: "smartphone", budget: {}, priorities: [], constraints: [] },
      // Single priority
      {
        category: "smartphone",
        budget: { max: 30000 },
        priorities: [{ attributeKey: "storage_gb", importance: 3 }],
        constraints: [],
      },
      // Multiple priorities
      {
        category: "smartphone",
        budget: { max: 30000 },
        priorities: [
          { attributeKey: "camera_score", importance: 3 },
          { attributeKey: "battery_mah", importance: 2 },
        ],
        constraints: [],
      },
    ];

    for (const preference of scenarios) {
      const result = runDecision(catalog, preference, categoryConfig);
      if (result.scoredProducts.length === 0) continue;

      const topScore = result.scoredProducts[0].totalScore;
      for (const sp of result.scoredProducts) {
        expect(sp.totalScore).toBeLessThanOrEqual(topScore);
      }

      // Rank must equal 1 for the first product
      expect(result.scoredProducts[0].rank).toBe(1);
    }
  });

  it("laptop category also maintains BestMatch invariant", () => {
    const catalog = getCatalog("laptop");
    const categoryConfig = getCategoryConfig("laptop")!;

    const preference: UserPreference = {
      category: "laptop",
      budget: {},
      priorities: [{ attributeKey: "processor_score", importance: 3 }],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig);
    expect(result.scoredProducts.length).toBeGreaterThan(0);

    const topScore = result.scoredProducts[0].totalScore;
    for (const sp of result.scoredProducts) {
      expect(sp.totalScore).toBeLessThanOrEqual(topScore);
    }
    expect(result.scoredProducts[0].rank).toBe(1);
  });
});

// ============================================================
// 8. DecisionMatrix row.score always equals ScoredProduct.totalScore
// ============================================================

describe("Priority weighting: matrix-score invariant", () => {
  it("matrix scores always match engine scores regardless of priority configuration", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const scenarios: UserPreference[] = [
      { category: "smartphone", budget: {}, priorities: [], constraints: [] },
      {
        category: "smartphone",
        budget: { max: 30000 },
        priorities: [{ attributeKey: "storage_gb", importance: 3 }],
        constraints: [],
      },
      {
        category: "smartphone",
        budget: { max: 30000 },
        priorities: [
          { attributeKey: "camera_score", importance: 3 },
          { attributeKey: "battery_mah", importance: 2 },
        ],
        constraints: [],
      },
    ];

    for (const preference of scenarios) {
      const result = runDecision(catalog, preference, categoryConfig);
      const matrix = buildDecisionMatrix(
        result.scoredProducts.map((sp) => sp.product),
        categoryConfig.attributes,
        new Map(
          result.scoredProducts.map((sp) => [
            sp.product.id,
            Object.fromEntries(
              sp.contributions.map((c) => [c.attributeKey, c.normalizedValue])
            ),
          ])
        ),
        new Map(
          result.scoredProducts.map((sp) => [sp.product.id, sp.totalScore])
        )
      );

      for (const sp of result.scoredProducts) {
        const matrixRow = matrix.rows.find(
          (r: { product: { id: string }; score: number }) => r.product.id === sp.product.id
        );
        expect(matrixRow).toBeDefined();
        expect(matrixRow!.score).toBe(sp.totalScore);
      }
    }
  });
});

// ============================================================
// 9. Budget min/max behavior unchanged
// ============================================================

describe("Priority weighting: budget behavior unchanged", () => {
  it("budget min filters out products below minimum", () => {
    const categoryConfig = getCategoryConfig("smartphone")!;

    const testCatalog: Product[] = [
      {
        id: "low-price",
        name: "Budget Phone",
        brand: "Test",
        category: "smartphone",
        price: 10000,
        attributes: {
          camera_score: 70,
          storage_gb: 128,
          battery_mah: 4000,
          ram_gb: 6,
          display_inches: 6.1,
          five_g: true,
        },
        confidence: {},
      },
      {
        id: "mid-price",
        name: "Mid Phone",
        brand: "Test",
        category: "smartphone",
        price: 25000,
        attributes: {
          camera_score: 80,
          storage_gb: 256,
          battery_mah: 5000,
          ram_gb: 8,
          display_inches: 6.5,
          five_g: true,
        },
        confidence: {},
      },
    ];

    const preference: UserPreference = {
      category: "smartphone",
      budget: { min: 15000 },
      priorities: [],
      constraints: [],
    };

    const result = runDecision(testCatalog, preference, categoryConfig);
    expect(result.scoredProducts.length).toBe(1);
    expect(result.scoredProducts[0].product.id).toBe("mid-price");
  });

  it("budget max filters out products above maximum", () => {
    const categoryConfig = getCategoryConfig("smartphone")!;

    const testCatalog: Product[] = [
      {
        id: "cheap",
        name: "Budget Phone",
        brand: "Test",
        category: "smartphone",
        price: 15000,
        attributes: {
          camera_score: 70,
          storage_gb: 128,
          battery_mah: 4000,
          ram_gb: 6,
          display_inches: 6.1,
          five_g: true,
        },
        confidence: {},
      },
      {
        id: "expensive",
        name: "Premium Phone",
        brand: "Test",
        category: "smartphone",
        price: 35000,
        attributes: {
          camera_score: 95,
          storage_gb: 512,
          battery_mah: 5500,
          ram_gb: 16,
          display_inches: 6.7,
          five_g: true,
        },
        confidence: {},
      },
    ];

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 20000 },
      priorities: [],
      constraints: [],
    };

    const result = runDecision(testCatalog, preference, categoryConfig);
    expect(result.scoredProducts.length).toBe(1);
    expect(result.scoredProducts[0].product.id).toBe("cheap");
  });
});
