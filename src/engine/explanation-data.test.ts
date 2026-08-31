// ============================================================
// DecisionCart — Explanation Data Integrity Tests
//
// Verifies that the scoring engine produces correct data for
// the "Why This Ranking?" explanation panel:
//   1. Sum of contributions equals totalScore
//   2. No attribute with weight > 0 and normalizedValue > 0 is lost
//   3. Correct data for smartphone and laptop categories
//   4. Explicit priority + baseline attributes
//   5. No explicit priorities
//   6. Low-priority attributes with non-zero normalized values
//   7. Low-priority attributes with normalized value = 0
// ============================================================

import { describe, it, expect } from "vitest";
import { runDecision, calculateWeights } from "./decision-engine";
import { getCatalog } from "@/catalog/demo-data";
import { getCategoryConfig } from "@/catalog/categories";
import type { UserPreference, Product } from "@/types";

// ============================================================
// 1. Sum of contributions equals totalScore
// ============================================================

describe("Explanation data: contributions sum to totalScore", () => {
  it("smartphone with explicit camera priority — sum matches totalScore", () => {
    const catalog = getCatalog("smartphone");
    const config = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [{ attributeKey: "camera_score", importance: 3 }],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);

    for (const sp of result.scoredProducts) {
      const sumContributions = sp.contributions.reduce(
        (sum, c) => sum + c.contribution,
        0
      );
      const sumPoints = sumContributions * 100;
      // Allow floating-point tolerance of 0.02
      expect(Math.abs(sumPoints - sp.totalScore)).toBeLessThanOrEqual(0.02);
    }
  });

  it("smartphone with no priorities — sum matches totalScore", () => {
    const catalog = getCatalog("smartphone");
    const config = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);

    for (const sp of result.scoredProducts) {
      const sumContributions = sp.contributions.reduce(
        (sum, c) => sum + c.contribution,
        0
      );
      const sumPoints = sumContributions * 100;
      expect(Math.abs(sumPoints - sp.totalScore)).toBeLessThanOrEqual(0.02);
    }
  });

  it("laptop with processor priority — sum matches totalScore", () => {
    const catalog = getCatalog("laptop");
    const config = getCategoryConfig("laptop")!;

    const preference: UserPreference = {
      category: "laptop",
      budget: {},
      priorities: [{ attributeKey: "processor_score", importance: 3 }],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);

    for (const sp of result.scoredProducts) {
      const sumContributions = sp.contributions.reduce(
        (sum, c) => sum + c.contribution,
        0
      );
      const sumPoints = sumContributions * 100;
      expect(Math.abs(sumPoints - sp.totalScore)).toBeLessThanOrEqual(0.02);
    }
  });

  it("laptop with no priorities — sum matches totalScore", () => {
    const catalog = getCatalog("laptop");
    const config = getCategoryConfig("laptop")!;

    const preference: UserPreference = {
      category: "laptop",
      budget: {},
      priorities: [],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);

    for (const sp of result.scoredProducts) {
      const sumContributions = sp.contributions.reduce(
        (sum, c) => sum + c.contribution,
        0
      );
      const sumPoints = sumContributions * 100;
      expect(Math.abs(sumPoints - sp.totalScore)).toBeLessThanOrEqual(0.02);
    }
  });
});

// ============================================================
// 2. No attribute with weight > 0 and normalizedValue > 0 is lost
// ============================================================

describe("Explanation data: no attributes incorrectly lost", () => {
  it("all attributes with weight > 0 appear in contributions", () => {
    const catalog = getCatalog("smartphone");
    const config = getCategoryConfig("smartphone")!;
    const weights = calculateWeights(
      [{ attributeKey: "camera_score", importance: 3 }],
      config.attributes
    );

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [{ attributeKey: "camera_score", importance: 3 }],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);

    // All attributes with weight > 0 must appear in contributions
    for (const sp of result.scoredProducts) {
      const contribKeys = new Set(sp.contributions.map((c) => c.attributeKey));
      for (const attr of config.attributes) {
        if (weights[attr.key] > 0) {
          expect(contribKeys.has(attr.key)).toBe(true);
        }
      }
    }
  });

  it("attribute with weight > 0 and normalizedValue > 0 has contribution > 0", () => {
    const catalog = getCatalog("smartphone");
    const config = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [{ attributeKey: "camera_score", importance: 3 }],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);

    for (const sp of result.scoredProducts) {
      for (const c of sp.contributions) {
        if (c.weight > 0 && c.normalizedValue > 0 && c.available) {
          expect(c.contribution).toBeGreaterThan(0);
        }
      }
    }
  });

  it("5G support with normalized value = 1.0 has non-zero contribution when weight > 0", () => {
    // Two products with different 5G status
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
          camera_score: 80,
          storage_gb: 256,
          battery_mah: 5000,
          ram_gb: 8,
          display_inches: 6.5,
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

    const result = runDecision(testCatalog, preference, getCategoryConfig("smartphone")!);

    for (const sp of result.scoredProducts) {
      const fiveGContrib = sp.contributions.find(
        (c) => c.attributeKey === "five_g"
      );
      expect(fiveGContrib).toBeDefined();
      expect(fiveGContrib!.weight).toBeGreaterThan(0);

      if (fiveGContrib!.normalizedValue > 0) {
        expect(fiveGContrib!.contribution).toBeGreaterThan(0);
      }
    }
  });
});

// ============================================================
// 3. Explicit priority + baseline attributes
// ============================================================

describe("Explanation data: explicit priority + baseline", () => {
  it("explicit priority has highest weight among all attributes", () => {
    const config = getCategoryConfig("smartphone")!;
    const weights = calculateWeights(
      [{ attributeKey: "camera_score", importance: 3 }],
      config.attributes
    );

    // Camera must have the highest weight
    for (const attr of config.attributes) {
      expect(weights["camera_score"]).toBeGreaterThanOrEqual(weights[attr.key]);
    }
  });

  it("explicit priority contribution dominates the score", () => {
    const catalog = getCatalog("smartphone");
    const config = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [{ attributeKey: "camera_score", importance: 3 }],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);

    // For the top product, camera contribution should be the largest
    const topProduct = result.scoredProducts[0];
    const cameraContrib = topProduct.contributions.find(
      (c) => c.attributeKey === "camera_score"
    );
    for (const c of topProduct.contributions) {
      if (c.attributeKey !== "camera_score" && c.available) {
        expect(cameraContrib!.contribution).toBeGreaterThanOrEqual(
          c.contribution
        );
      }
    }
  });

  it("baseline attributes still contribute when explicit priority is set", () => {
    const catalog = getCatalog("smartphone");
    const config = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [{ attributeKey: "camera_score", importance: 3 }],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);

    // At least some baseline attributes should have non-zero contribution
    for (const sp of result.scoredProducts) {
      const nonCameraContribs = sp.contributions.filter(
        (c) => c.attributeKey !== "camera_score" && c.available && c.contribution > 0
      );
      expect(nonCameraContribs.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// 4. No explicit priorities
// ============================================================

describe("Explanation data: no explicit priorities", () => {
  it("all attributes contribute with non-zero normalized values", () => {
    const catalog = getCatalog("smartphone");
    const config = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);

    // All products should have non-zero contributions from available attributes
    for (const sp of result.scoredProducts) {
      const availableContribs = sp.contributions.filter(
        (c) => c.available && c.weight > 0
      );
      expect(availableContribs.length).toBeGreaterThan(0);
    }
  });

  it("weights are evenly distributed across all attributes", () => {
    const config = getCategoryConfig("smartphone")!;
    const weights = calculateWeights([], config.attributes);

    // All weights should be positive
    for (const attr of config.attributes) {
      expect(weights[attr.key]).toBeGreaterThan(0);
    }

    // Weights should sum to 1.0
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });
});

// ============================================================
// 5. Low-priority attributes with non-zero normalized values
// ============================================================

describe("Explanation data: low-priority attributes", () => {
  it("low-priority attribute with normalized value > 0 has non-zero contribution", () => {
    // Two products with different battery but same camera
    const testCatalog: Product[] = [
      {
        id: "good-battery",
        name: "Long Battery Phone",
        brand: "Test",
        category: "smartphone",
        price: 25000,
        attributes: {
          camera_score: 80,
          storage_gb: 256,
          battery_mah: 6000,
          ram_gb: 8,
          display_inches: 6.5,
          five_g: true,
        },
        confidence: {},
      },
      {
        id: "bad-battery",
        name: "Short Battery Phone",
        brand: "Test",
        category: "smartphone",
        price: 25000,
        attributes: {
          camera_score: 80,
          storage_gb: 256,
          battery_mah: 3000,
          ram_gb: 8,
          display_inches: 6.5,
          five_g: true,
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

    const result = runDecision(testCatalog, preference, getCategoryConfig("smartphone")!);

    // Good battery phone should have non-zero battery contribution
    const goodBattery = result.scoredProducts.find(
      (sp) => sp.product.id === "good-battery"
    );
    const batteryContrib = goodBattery!.contributions.find(
      (c) => c.attributeKey === "battery_mah"
    );
    expect(batteryContrib!.weight).toBeGreaterThan(0);
    expect(batteryContrib!.normalizedValue).toBeGreaterThan(0);
    expect(batteryContrib!.contribution).toBeGreaterThan(0);
  });
});

// ============================================================
// 6. Low-priority attributes with normalized value = 0
// ============================================================

describe("Explanation data: normalized value = 0 is correct", () => {
  it("Samsung Galaxy S24 FE has normalized 0 for battery among budget-eligible products", () => {
    const catalog = getCatalog("smartphone");
    const config = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [{ attributeKey: "camera_score", importance: 3 }],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);

    const samsung = result.scoredProducts.find(
      (sp) => sp.product.id === "phone-001"
    );
    expect(samsung).toBeDefined();

    const batteryContrib = samsung!.contributions.find(
      (c) => c.attributeKey === "battery_mah"
    );
    // Samsung has 4700 mAh which is the minimum among eligible products
    // So normalized should be 0 and contribution should be 0
    expect(batteryContrib!.normalizedValue).toBe(0);
    expect(batteryContrib!.contribution).toBe(0);
    expect(batteryContrib!.weight).toBeGreaterThan(0); // weight is still non-zero
    expect(batteryContrib!.available).toBe(true); // data is available
  });
});

// ============================================================
// 7. Score explanation data matches decision engine exactly
// ============================================================

describe("Explanation data: engine data integrity", () => {
  it("each ScoreContribution has all required fields populated", () => {
    const catalog = getCatalog("smartphone");
    const config = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [{ attributeKey: "camera_score", importance: 3 }],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);

    for (const sp of result.scoredProducts) {
      for (const c of sp.contributions) {
        expect(typeof c.attributeKey).toBe("string");
        expect(typeof c.label).toBe("string");
        expect(typeof c.normalizedValue).toBe("number");
        expect(typeof c.weight).toBe("number");
        expect(typeof c.contribution).toBe("number");
        expect(typeof c.available).toBe("boolean");

        // normalizedValue must be between 0 and 1
        expect(c.normalizedValue).toBeGreaterThanOrEqual(0);
        expect(c.normalizedValue).toBeLessThanOrEqual(1);

        // weight must be non-negative
        expect(c.weight).toBeGreaterThanOrEqual(0);

        // contribution must be non-negative
        expect(c.contribution).toBeGreaterThanOrEqual(0);

        // if not available, contribution must be 0
        if (!c.available) {
          expect(c.contribution).toBe(0);
        }

        // if normalizedValue > 0 and weight > 0, contribution must be > 0
        if (c.normalizedValue > 0 && c.weight > 0 && c.available) {
          expect(c.contribution).toBeGreaterThan(0);
        }
      }
    }
  });

  it("totalScore equals sum of contributions scaled to 0-100", () => {
    const catalog = getCatalog("smartphone");
    const config = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [{ attributeKey: "camera_score", importance: 3 }],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);

    for (const sp of result.scoredProducts) {
      const rawSum = sp.contributions.reduce(
        (sum, c) => sum + c.contribution,
        0
      );
      const scaledSum = Math.round(rawSum * 10000) / 100;
      expect(scaledSum).toBe(sp.totalScore);
    }
  });
});

// ============================================================
// 8. Smartphone category
// ============================================================

describe("Explanation data: smartphone category", () => {
  it("all 6 smartphone attributes appear in contributions", () => {
    const catalog = getCatalog("smartphone");
    const config = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [{ attributeKey: "camera_score", importance: 3 }],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);

    for (const sp of result.scoredProducts) {
      expect(sp.contributions.length).toBe(6);
      const keys = sp.contributions.map((c) => c.attributeKey).sort();
      expect(keys).toEqual([
        "battery_mah",
        "camera_score",
        "display_inches",
        "five_g",
        "ram_gb",
        "storage_gb",
      ]);
    }
  });
});

// ============================================================
// 9. Laptop category
// ============================================================

describe("Explanation data: laptop category", () => {
  it("all 6 laptop attributes appear in contributions", () => {
    const catalog = getCatalog("laptop");
    const config = getCategoryConfig("laptop")!;

    const preference: UserPreference = {
      category: "laptop",
      budget: {},
      priorities: [{ attributeKey: "processor_score", importance: 3 }],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);

    for (const sp of result.scoredProducts) {
      expect(sp.contributions.length).toBe(6);
      const keys = sp.contributions.map((c) => c.attributeKey).sort();
      expect(keys).toEqual([
        "battery_hours",
        "display_inches",
        "processor_score",
        "ram_gb",
        "ssd_gb",
        "weight_kg",
      ]);
    }
  });

  it("laptop contributions sum to totalScore", () => {
    const catalog = getCatalog("laptop");
    const config = getCategoryConfig("laptop")!;

    const preference: UserPreference = {
      category: "laptop",
      budget: {},
      priorities: [],
      constraints: [],
    };

    const result = runDecision(catalog, preference, config);

    for (const sp of result.scoredProducts) {
      const sumContributions = sp.contributions.reduce(
        (sum, c) => sum + c.contribution,
        0
      );
      const sumPoints = sumContributions * 100;
      expect(Math.abs(sumPoints - sp.totalScore)).toBeLessThanOrEqual(0.02);
    }
  });
});
