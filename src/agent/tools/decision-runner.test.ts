// ============================================================
// DecisionCart — Decision Runner Tool Tests
// Tests for the bounded run_decision tool.
// ============================================================

import { describe, it, expect, afterEach } from "vitest";
import type { ParsedShoppingIntent } from "@/lib/ai/types";
import type { Product, CategoryConfig } from "@/types";
import {
  registerDynamicCategory,
  clearDynamicCategories,
} from "@/catalog/category-resolver";
import { executeDecisionRunner } from "./decision-runner";

// --- Mock Products ---

const mockSmartphones: Product[] = [
  {
    id: "phone-1",
    name: "Test Phone 1",
    brand: "Brand A",
    category: "smartphone",
    price: 15000,
    attributes: { ram_gb: 6, storage_gb: 128, battery_mah: 5000 },
    confidence: { ram_gb: "high", storage_gb: "high", battery_mah: "high" },
  },
  {
    id: "phone-2",
    name: "Test Phone 2",
    brand: "Brand B",
    category: "smartphone",
    price: 25000,
    attributes: { ram_gb: 8, storage_gb: 256, battery_mah: 4500 },
    confidence: { ram_gb: "high", storage_gb: "high", battery_mah: "high" },
  },
  {
    id: "phone-3",
    name: "Test Phone 3",
    brand: "Brand C",
    category: "smartphone",
    price: 10000,
    attributes: { ram_gb: 4, storage_gb: 64, battery_mah: 4000 },
    confidence: { ram_gb: "high", storage_gb: "high", battery_mah: "high" },
  },
];

// --- Helpers ---

function makeIntent(
  overrides: Partial<ParsedShoppingIntent> = {}
): ParsedShoppingIntent {
  return {
    category: "smartphone",
    priorities: [],
    constraints: [],
    confidence: 0.8,
    originalQuery: "best smartphone under 30000",
    ...overrides,
  };
}

// --- Cleanup after each test ---
afterEach(() => {
  clearDynamicCategories();
});

// --- Tests ---

describe("executeDecisionRunner", () => {
  it("successfully runs runDecision with valid products", async () => {
    const intent = makeIntent({
      priorities: [{ attributeKey: "ram_gb", importance: 3 }],
    });

    const result = await executeDecisionRunner({
      intent,
      products: mockSmartphones,
    });

    expect(result.success).toBe(true);
    expect(result.decisionResult).toBeDefined();
    expect(result.decisionResult!.scoredProducts.length).toBeGreaterThan(0);
  });

  it("returns ranked products with ranks", async () => {
    const intent = makeIntent({
      priorities: [{ attributeKey: "ram_gb", importance: 3 }],
    });

    const result = await executeDecisionRunner({
      intent,
      products: mockSmartphones,
    });

    expect(result.success).toBe(true);
    const scored = result.decisionResult!.scoredProducts;

    // All products should have ranks
    for (const sp of scored) {
      expect(sp.rank).toBeGreaterThanOrEqual(1);
      expect(sp.rank).toBeLessThanOrEqual(scored.length);
    }

    // Ranks should be sequential
    const ranks = scored.map((sp) => sp.rank).sort((a, b) => a - b);
    expect(ranks).toEqual([1, 2, 3]);
  });

  it("uses parsed intent category when no override", async () => {
    const intent = makeIntent({ category: "smartphone" });

    const result = await executeDecisionRunner({
      intent,
      products: mockSmartphones,
    });

    expect(result.success).toBe(true);
    expect(result.effectiveCategory).toBe("smartphone");
    expect(result.decisionResult!.categoryLabel).toBe("Smartphone");
  });

  it("category override takes precedence over intent category", async () => {
    // Register a dynamic camera category
    const cameraConfig: CategoryConfig = {
      category: "camera",
      label: "Camera",
      attributes: [
        {
          key: "megapixels",
          label: "Resolution",
          type: "numeric",
          comparisonDirection: "higher_is_better",
          description: "Camera sensor resolution",
          defaultImportance: 3,
        },
      ],
    };
    registerDynamicCategory(cameraConfig);

    const cameraProducts: Product[] = [
      {
        id: "cam1",
        name: "Canon EOS",
        brand: "Canon",
        category: "camera",
        price: 65000,
        attributes: { megapixels: 24.2 },
        confidence: { megapixels: "high" },
      },
    ];

    const intent = makeIntent({ category: "smartphone" });

    const result = await executeDecisionRunner({
      intent,
      products: cameraProducts,
      categoryOverride: "camera",
    });

    expect(result.success).toBe(true);
    expect(result.effectiveCategory).toBe("camera");
    expect(result.decisionResult!.categoryLabel).toBe("Camera");
  });

  it("missing category config returns structured failure", async () => {
    const intent = makeIntent({ category: "nonexistent_category" });

    const result = await executeDecisionRunner({
      intent,
      products: mockSmartphones,
    });

    expect(result.success).toBe(false);
    expect(result.effectiveCategory).toBe("nonexistent_category");
    expect(result.error).toContain("No category config found");
    expect(result.outputSummary).toContain("Decision failed");
    expect(result.decisionResult).toBeUndefined();
  });

  it("empty product list does NOT crash", async () => {
    const intent = makeIntent();

    const result = await executeDecisionRunner({
      intent,
      products: [],
    });

    expect(result.success).toBe(true);
    expect(result.decisionResult).toBeDefined();
    expect(result.decisionResult!.scoredProducts).toEqual([]);
  });

  it("budget constraints are passed correctly", async () => {
    const intent = makeIntent({
      budget: { max: 15000 },
      priorities: [{ attributeKey: "ram_gb", importance: 2 }],
    });

    const result = await executeDecisionRunner({
      intent,
      products: mockSmartphones,
    });

    expect(result.success).toBe(true);
    const scored = result.decisionResult!.scoredProducts;

    // Only phones within budget should remain (price <= 15000)
    for (const sp of scored) {
      expect(sp.product.price).toBeLessThanOrEqual(15000);
    }
  });

  it("priorities are passed correctly", async () => {
    // Prioritize ram_gb heavily
    const intent = makeIntent({
      priorities: [{ attributeKey: "ram_gb", importance: 3 }],
    });

    const result = await executeDecisionRunner({
      intent,
      products: mockSmartphones,
    });

    expect(result.success).toBe(true);
    const scored = result.decisionResult!.scoredProducts;

    // Phone 2 (8GB RAM) should rank higher than Phone 3 (4GB RAM)
    const phone2Rank = scored.find((sp) => sp.product.id === "phone-2")!.rank;
    const phone3Rank = scored.find((sp) => sp.product.id === "phone-3")!.rank;
    expect(phone2Rank).toBeLessThan(phone3Rank);
  });

  it("output summary is generated correctly for successful result", async () => {
    const intent = makeIntent();

    const result = await executeDecisionRunner({
      intent,
      products: mockSmartphones,
    });

    expect(result.success).toBe(true);
    expect(result.outputSummary).toContain("Ranked");
    expect(result.outputSummary).toContain("3 products");
    expect(result.outputSummary).toContain("smartphone");
  });

  it("output summary is generated correctly for zero matching products", async () => {
    const intent = makeIntent({
      budget: { max: 5000 }, // No phones this cheap
    });

    const result = await executeDecisionRunner({
      intent,
      products: mockSmartphones,
    });

    expect(result.success).toBe(true);
    expect(result.outputSummary).toContain("0 products");
  });

  it("output summary is generated correctly for failure", async () => {
    const intent = makeIntent({ category: "unknown_cat" });

    const result = await executeDecisionRunner({
      intent,
      products: mockSmartphones,
    });

    expect(result.success).toBe(false);
    expect(result.outputSummary).toContain("Decision failed");
  });

  it("missing category returns structured failure", async () => {
    const intent = makeIntent({ category: "" });

    const result = await executeDecisionRunner({
      intent,
      products: mockSmartphones,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("No category provided");
    expect(result.outputSummary).toContain("Decision failed");
  });

  it("constraints are passed correctly", async () => {
    const intent = makeIntent({
      constraints: [
        { type: "max_price", value: 12000 },
      ],
      priorities: [{ attributeKey: "ram_gb", importance: 2 }],
    });

    const result = await executeDecisionRunner({
      intent,
      products: mockSmartphones,
    });

    expect(result.success).toBe(true);
    const scored = result.decisionResult!.scoredProducts;

    // Only phone-3 (10000) passes the max_price constraint
    for (const sp of scored) {
      expect(sp.product.price).toBeLessThanOrEqual(12000);
    }
  });
});
