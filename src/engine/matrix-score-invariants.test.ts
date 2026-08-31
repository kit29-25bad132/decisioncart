// ============================================================
// DecisionCart — Matrix Score & Strength/Weakness Invariant Tests
//
// REGRESSION TESTS: These protect against two specific bugs:
//   1. Decision Matrix scores not matching engine totalScore
//   2. Strengths and weaknesses overlapping for the same product
// ============================================================

import { describe, it, expect } from "vitest";
import { runDecision, buildDecisionMatrix } from "./decision-engine";
import { getCatalog } from "@/catalog/demo-data";
import { getCategoryConfig } from "@/catalog/categories";
import type { UserPreference, Product } from "@/types";

// ============================================================
// INVARIANT 1: Matrix scores must equal engine totalScore
// ============================================================

describe("Invariant: Matrix scores match engine totalScore", () => {
  it("every matrix row.score equals the corresponding ScoredProduct.totalScore (default priorities)", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [
        { attributeKey: "camera_score", importance: 3 },
        { attributeKey: "storage_gb", importance: 2 },
        { attributeKey: "battery_mah", importance: 1 },
      ],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig);

    // Build matrix the same way DecisionWorkspace does
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

    expect(result.scoredProducts.length).toBeGreaterThan(0);
    expect(matrix.rows.length).toBe(result.scoredProducts.length);

    // CRITICAL: Every matrix row score must exactly match the engine score
    for (const sp of result.scoredProducts) {
      const matrixRow = matrix.rows.find(
        (r) => r.product.id === sp.product.id
      );
      expect(matrixRow).toBeDefined();
      expect(matrixRow!.score).toBe(sp.totalScore);
    }
  });

  it("matrix scores match when no priorities have non-default weights", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    // All priorities at minimum importance — tests that 0-weight
    // attributes don't cause matrix scores to differ
    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [
        { attributeKey: "camera_score", importance: 3 },
        { attributeKey: "battery_mah", importance: 3 },
        { attributeKey: "display_inches", importance: 3 },
        { attributeKey: "ram_gb", importance: 3 },
        { attributeKey: "storage_gb", importance: 3 },
      ],
      constraints: [],
    };

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
        (r) => r.product.id === sp.product.id
      );
      expect(matrixRow!.score).toBe(sp.totalScore);
    }
  });

  it("matrix scores match with storage-only priority", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [{ attributeKey: "storage_gb", importance: 3 }],
      constraints: [],
    };

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

    // Matrix scores must not be all zeros (old bug)
    const nonZeroScores = matrix.rows.filter((r) => r.score > 0);
    expect(nonZeroScores.length).toBeGreaterThan(0);

    // Every matrix score must match engine score
    for (const sp of result.scoredProducts) {
      const matrixRow = matrix.rows.find(
        (r) => r.product.id === sp.product.id
      );
      expect(matrixRow!.score).toBe(sp.totalScore);
    }
  });

  it("matrix scores match with camera + storage dual priority", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [
        { attributeKey: "camera_score", importance: 3 },
        { attributeKey: "storage_gb", importance: 3 },
      ],
      constraints: [],
    };

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
        (r) => r.product.id === sp.product.id
      );
      expect(matrixRow!.score).toBe(sp.totalScore);
    }
  });

  it("scores are not all zero when product has meaningful attribute differences", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [
        { attributeKey: "camera_score", importance: 3 },
        { attributeKey: "storage_gb", importance: 2 },
      ],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig);

    // Products in the catalog have different camera scores and storage values
    // so there should be non-zero scores
    const scores = result.scoredProducts.map((sp) => sp.totalScore);
    expect(scores.some((s) => s > 0)).toBe(true);
    expect(scores.some((s) => s < 100)).toBe(true);
  });

  it("ranking order matches between engine and matrix", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [
        { attributeKey: "camera_score", importance: 3 },
        { attributeKey: "battery_mah", importance: 2 },
      ],
      constraints: [],
    };

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

    // Engine ranking (sorted by score desc) must match matrix ranking
    const engineRanking = result.scoredProducts.map((sp) => sp.product.id);
    const matrixRanking = [...matrix.rows]
      .sort((a, b) => b.score - a.score)
      .map((r) => r.product.id);

    expect(matrixRanking).toEqual(engineRanking);
  });

  it("buildDecisionMatrix uses provided scores map, not hardcoded zeros", () => {
    // Direct unit test: pass specific scores and verify they appear in rows
    const categoryConfig = getCategoryConfig("smartphone")!;
    const catalog = getCatalog("smartphone").slice(0, 2); // just 2 products

    const scoresMap = new Map<string, number>([
      [catalog[0].id, 85.5],
      [catalog[1].id, 42.3],
    ]);

    const normalized = new Map<string, Record<string, number | null>>([
      [catalog[0].id, {}],
      [catalog[1].id, {}],
    ]);

    const matrix = buildDecisionMatrix(
      catalog,
      categoryConfig.attributes,
      normalized,
      scoresMap
    );

    const row0 = matrix.rows.find((r) => r.product.id === catalog[0].id);
    const row1 = matrix.rows.find((r) => r.product.id === catalog[1].id);

    expect(row0!.score).toBe(85.5);
    expect(row1!.score).toBe(42.3);
  });

  it("buildDecisionMatrix defaults to 0 when scores map is not provided", () => {
    const categoryConfig = getCategoryConfig("smartphone")!;
    const catalog = getCatalog("smartphone").slice(0, 1);

    const normalized = new Map<string, Record<string, number | null>>([
      [catalog[0].id, {}],
    ]);

    const matrix = buildDecisionMatrix(
      catalog,
      categoryConfig.attributes,
      normalized
      // no scores param
    );

    expect(matrix.rows[0].score).toBe(0);
  });
});

// ============================================================
// INVARIANT 2: Strengths and weaknesses must never overlap
// ============================================================

describe("Invariant: No strength/weakness overlap", () => {
  it("no product has overlapping strengths and weaknesses (real catalog, camera priority)", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [
        { attributeKey: "camera_score", importance: 3 },
        { attributeKey: "storage_gb", importance: 2 },
      ],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig);

    for (const sp of result.scoredProducts) {
      for (const strength of sp.strengths) {
        expect(sp.weaknesses).not.toContain(strength);
      }
      for (const weakness of sp.weaknesses) {
        expect(sp.strengths).not.toContain(weakness);
      }
    }
  });

  it("no overlap with 1 active priority (storage only)", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [{ attributeKey: "storage_gb", importance: 3 }],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig);

    for (const sp of result.scoredProducts) {
      for (const strength of sp.strengths) {
        expect(sp.weaknesses).not.toContain(strength);
      }
      for (const weakness of sp.weaknesses) {
        expect(sp.strengths).not.toContain(weakness);
      }
      // With 1 priority, weaknesses should be empty (nothing to split)
      // OR if populated, must not overlap
    }
  });

  it("no overlap with 2 active priorities (camera + storage)", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [
        { attributeKey: "camera_score", importance: 3 },
        { attributeKey: "storage_gb", importance: 3 },
      ],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig);

    for (const sp of result.scoredProducts) {
      for (const strength of sp.strengths) {
        expect(sp.weaknesses).not.toContain(strength);
      }
      for (const weakness of sp.weaknesses) {
        expect(sp.strengths).not.toContain(weakness);
      }
    }
  });

  it("no overlap with 3+ active priorities", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [
        { attributeKey: "camera_score", importance: 3 },
        { attributeKey: "battery_mah", importance: 2 },
        { attributeKey: "storage_gb", importance: 1 },
      ],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig);

    for (const sp of result.scoredProducts) {
      for (const strength of sp.strengths) {
        expect(sp.weaknesses).not.toContain(strength);
      }
      for (const weakness of sp.weaknesses) {
        expect(sp.strengths).not.toContain(weakness);
      }
    }
  });

  it("no overlap with all priorities at equal importance", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [
        { attributeKey: "camera_score", importance: 2 },
        { attributeKey: "battery_mah", importance: 2 },
        { attributeKey: "display_inches", importance: 2 },
        { attributeKey: "ram_gb", importance: 2 },
        { attributeKey: "storage_gb", importance: 2 },
      ],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig);

    for (const sp of result.scoredProducts) {
      for (const strength of sp.strengths) {
        expect(sp.weaknesses).not.toContain(strength);
      }
      for (const weakness of sp.weaknesses) {
        expect(sp.strengths).not.toContain(weakness);
      }
    }
  });

  it("no overlap with custom test catalog (edge: only 2 weighted attributes available)", () => {
    const categoryConfig = getCategoryConfig("smartphone")!;

    const testCatalog: Product[] = [
      {
        id: "test-a",
        name: "Product A",
        brand: "Test",
        category: "smartphone",
        price: 20000,
        attributes: {
          camera_score: 90,
          storage_gb: 256,
          battery_mah: null,
          ram_gb: null,
          display_inches: null,
          five_g: null,
        },
        confidence: {
          camera_score: "high",
          storage_gb: "high",
        },
      },
      {
        id: "test-b",
        name: "Product B",
        brand: "Test",
        category: "smartphone",
        price: 22000,
        attributes: {
          camera_score: 70,
          storage_gb: 128,
          battery_mah: null,
          ram_gb: null,
          display_inches: null,
          five_g: null,
        },
        confidence: {
          camera_score: "high",
          storage_gb: "high",
        },
      },
    ];

    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [
        { attributeKey: "camera_score", importance: 3 },
        { attributeKey: "storage_gb", importance: 3 },
      ],
      constraints: [],
    };

    const result = runDecision(testCatalog, preference, categoryConfig);

    for (const sp of result.scoredProducts) {
      for (const strength of sp.strengths) {
        expect(sp.weaknesses).not.toContain(strength);
      }
      for (const weakness of sp.weaknesses) {
        expect(sp.strengths).not.toContain(weakness);
      }
    }
  });

  it("no overlap with custom catalog (edge: only 1 weighted attribute available)", () => {
    const categoryConfig = getCategoryConfig("smartphone")!;

    const testCatalog: Product[] = [
      {
        id: "single-a",
        name: "High Storage Phone",
        brand: "Test",
        category: "smartphone",
        price: 20000,
        attributes: {
          camera_score: 90,
          storage_gb: 512,
          battery_mah: null,
          ram_gb: null,
          display_inches: null,
          five_g: null,
        },
        confidence: {
          camera_score: "high",
          storage_gb: "high",
        },
      },
      {
        id: "single-b",
        name: "Low Storage Phone",
        brand: "Test",
        category: "smartphone",
        price: 18000,
        attributes: {
          camera_score: 90,
          storage_gb: 128,
          battery_mah: null,
          ram_gb: null,
          display_inches: null,
          five_g: null,
        },
        confidence: {
          camera_score: "high",
          storage_gb: "high",
        },
      },
    ];

    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [{ attributeKey: "storage_gb", importance: 3 }],
      constraints: [],
    };

    const result = runDecision(testCatalog, preference, categoryConfig);

    for (const sp of result.scoredProducts) {
      for (const strength of sp.strengths) {
        expect(sp.weaknesses).not.toContain(strength);
      }
      for (const weakness of sp.weaknesses) {
        expect(sp.strengths).not.toContain(weakness);
      }
    }
  });

  it("strengths and weaknesses are subsets of attribute labels", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [
        { attributeKey: "camera_score", importance: 3 },
        { attributeKey: "battery_mah", importance: 2 },
        { attributeKey: "storage_gb", importance: 1 },
      ],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig);
    const validLabels = new Set(
      categoryConfig.attributes.map((a) => a.label)
    );

    for (const sp of result.scoredProducts) {
      for (const s of sp.strengths) {
        expect(validLabels.has(s)).toBe(true);
      }
      for (const w of sp.weaknesses) {
        expect(validLabels.has(w)).toBe(true);
      }
    }
  });

  it("laptop category also has no overlap", () => {
    const catalog = getCatalog("laptop");
    const categoryConfig = getCategoryConfig("laptop")!;

    const preference: UserPreference = {
      category: "laptop",
      budget: {},
      priorities: [
        { attributeKey: "processor_score", importance: 3 },
        { attributeKey: "ram_gb", importance: 2 },
        { attributeKey: "weight_kg", importance: 1 },
      ],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig);

    for (const sp of result.scoredProducts) {
      for (const strength of sp.strengths) {
        expect(sp.weaknesses).not.toContain(strength);
      }
      for (const weakness of sp.weaknesses) {
        expect(sp.strengths).not.toContain(weakness);
      }
    }
  });
});

// ============================================================
// EDGE CASE: One-priority behavior
// ============================================================

describe("Edge case: Single priority with baseline weights", () => {
  it("single priority does not force all other attributes to zero weight", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [{ attributeKey: "storage_gb", importance: 3 }],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig);

    for (const sp of result.scoredProducts) {
      // No overlap invariant still holds
      for (const strength of sp.strengths) {
        expect(sp.weaknesses).not.toContain(strength);
      }
      for (const weakness of sp.weaknesses) {
        expect(sp.strengths).not.toContain(weakness);
      }

      // Multiple attributes now contribute (baseline + explicit)
      const weightedContributions = sp.contributions.filter(
        (c) => c.available && c.weight > 0
      );
      expect(weightedContributions.length).toBeGreaterThan(1);
    }
  });

  it("explicit priority receives greater effective weight than baseline attributes", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [{ attributeKey: "storage_gb", importance: 3 }],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig);
    // Storage weight must be the highest
    const storageWeight = result.scoredProducts[0].contributions.find(
      (c) => c.attributeKey === "storage_gb"
    )?.weight ?? 0;
    for (const sp of result.scoredProducts) {
      for (const c of sp.contributions) {
        if (c.attributeKey !== "storage_gb") {
          expect(storageWeight).toBeGreaterThan(c.weight);
        }
      }
    }
  });

  it("equal primary attribute values can be broken using secondary baseline attributes", () => {
    const categoryConfig = getCategoryConfig("smartphone")!;

    // Two products with identical storage but different other attributes
    const testCatalog: Product[] = [
      {
        id: "equal-a",
        name: "Good Camera Phone",
        brand: "Test",
        category: "smartphone",
        price: 20000,
        attributes: {
          camera_score: 90,
          storage_gb: 256,
          battery_mah: 5000,
          ram_gb: 12,
          display_inches: 6.7,
          five_g: true,
        },
        confidence: { camera_score: "high", storage_gb: "high" },
      },
      {
        id: "equal-b",
        name: "Bad Camera Phone",
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
        confidence: { camera_score: "high", storage_gb: "high" },
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
    // Products with equal storage should NOT tie — secondary attributes break the tie
    expect(result.scoredProducts[0].totalScore).not.toBe(
      result.scoredProducts[1].totalScore
    );
    // Better camera/battery phone should win
    expect(result.scoredProducts[0].product.id).toBe("equal-a");
  });
});

describe("Edge case: Multiple priorities with baseline weights", () => {
  it("two priorities produce strengths and no overlap with weaknesses", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [
        { attributeKey: "camera_score", importance: 3 },
        { attributeKey: "storage_gb", importance: 3 },
      ],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig);

    for (const sp of result.scoredProducts) {
      // Strengths and weaknesses must never overlap
      for (const strength of sp.strengths) {
        expect(sp.weaknesses).not.toContain(strength);
      }
      for (const weakness of sp.weaknesses) {
        expect(sp.strengths).not.toContain(weakness);
      }
      // Explicit priorities should be among the top weighted contributions
      const weightedContributions = sp.contributions
        .filter((c) => c.available && c.weight > 0)
        .sort((a, b) => b.weight - a.weight);
      const topKeys = new Set(
        weightedContributions.slice(0, 2).map((c) => c.attributeKey)
      );
      expect(topKeys.has("camera_score") || topKeys.has("storage_gb")).toBe(true);
    }
  });
});
