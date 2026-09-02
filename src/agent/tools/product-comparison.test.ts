// ============================================================
// DecisionCart — Product Comparison Tool Tests
// Tests for the bounded compare_products tool.
// ============================================================

import { describe, it, expect, afterEach } from "vitest";
import type { DecisionToolResult } from "../agent-types";
import type { Product, ScoredProduct, DecisionResult } from "@/types";
import {
  clearDynamicCategories,
} from "@/catalog/category-resolver";
import { executeProductComparison } from "./product-comparison";

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

function makeScoredProduct(
  product: Product,
  overrides: Partial<ScoredProduct> = {}
): ScoredProduct {
  return {
    product,
    totalScore: 75,
    rank: 1,
    contributions: [
      {
        attributeKey: "ram_gb",
        label: "RAM",
        rawValue: product.attributes.ram_gb,
        normalizedValue: 0.7,
        weight: 0.4,
        contribution: 0.28,
        available: true,
      },
      {
        attributeKey: "storage_gb",
        label: "Storage",
        rawValue: product.attributes.storage_gb,
        normalizedValue: 0.6,
        weight: 0.35,
        contribution: 0.21,
        available: true,
      },
      {
        attributeKey: "battery_mah",
        label: "Battery",
        rawValue: product.attributes.battery_mah,
        normalizedValue: 0.8,
        weight: 0.25,
        contribution: 0.2,
        available: true,
      },
    ],
    missingAttributes: [],
    strengths: ["RAM", "Battery"],
    weaknesses: ["Storage"],
    dataConfidence: "high",
    ...overrides,
  };
}

function makeDecisionResult(
  scoredProducts: ScoredProduct[],
  overrides: Partial<DecisionResult> = {}
): DecisionResult {
  return {
    scoredProducts,
    tradeOffs: [
      {
        criterionKey: "ram_gb",
        criterionLabel: "RAM",
        winnerProductId: scoredProducts[0]?.product.id ?? "",
        winnerProductName: scoredProducts[0]?.product.name ?? "",
        score: 80,
      },
    ],
    querySummary: "Category: Smartphone · Budget: Under ₹30,000",
    categoryLabel: "Smartphone",
    weights: { ram_gb: 0.4, storage_gb: 0.35, battery_mah: 0.25 },
    priorities: [{ attributeKey: "ram_gb", importance: 3 }],
    budget: { max: 30000 },
    ...overrides,
  };
}

function makeDecisionToolResult(
  decisionResult: DecisionResult,
  overrides: Partial<DecisionToolResult> = {}
): DecisionToolResult {
  return {
    success: true,
    decisionResult,
    effectiveCategory: "smartphone",
    outputSummary: "Ranked 3 products for category \"smartphone\".",
    ...overrides,
  };
}

// --- Cleanup after each test ---
afterEach(() => {
  clearDynamicCategories();
});

// --- Tests ---

describe("executeProductComparison", () => {
  describe("missing DecisionResult handling", () => {
    it("returns failure when decisionToolResult.success is false", async () => {
      const result = await executeProductComparison({
        decisionToolResult: {
          success: false,
          effectiveCategory: "smartphone",
          outputSummary: "Decision failed",
          error: "No category provided",
        },
      });

      expect(result.success).toBe(false);
      expect(result.productCount).toBe(0);
      expect(result.outputSummary).toContain("no successful decision result");
      expect(result.error).toContain("No successful decision result");
    });

    it("returns failure when decisionResult is undefined", async () => {
      const result = await executeProductComparison({
        decisionToolResult: {
          success: true,
          effectiveCategory: "smartphone",
          outputSummary: "Decision completed",
        },
      });

      expect(result.success).toBe(false);
      expect(result.productCount).toBe(0);
    });
  });

  describe("empty scoredProducts", () => {
    it("returns successful empty comparison for zero products", async () => {
      const decisionResult = makeDecisionResult([]);
      const toolResult = makeDecisionToolResult(decisionResult);

      const result = await executeProductComparison({
        decisionToolResult: toolResult,
      });

      expect(result.success).toBe(true);
      expect(result.productCount).toBe(0);
      expect(result.outputSummary).toContain("no products to compare");
      expect(result.comparison).toBeUndefined();
    });
  });

  describe("single product comparison", () => {
    it("explains that only one matching product is available", async () => {
      const scored = [makeScoredProduct(mockSmartphones[0])];
      const decisionResult = makeDecisionResult(scored);
      const toolResult = makeDecisionToolResult(decisionResult);

      const result = await executeProductComparison({
        decisionToolResult: toolResult,
      });

      expect(result.success).toBe(true);
      expect(result.productCount).toBe(1);
      expect(result.outputSummary).toContain("1 product");
      expect(result.outputSummary).toContain("Test Phone 1");
      expect(result.outputSummary).toContain("Only one matching product");
    });
  });

  describe("multiple products comparison", () => {
    it("compares top products and identifies winner", async () => {
      const scored = [
        makeScoredProduct(mockSmartphones[0], { totalScore: 85, rank: 1 }),
        makeScoredProduct(mockSmartphones[1], { totalScore: 72, rank: 2 }),
        makeScoredProduct(mockSmartphones[2], { totalScore: 60, rank: 3 }),
      ];
      const decisionResult = makeDecisionResult(scored);
      const toolResult = makeDecisionToolResult(decisionResult);

      const result = await executeProductComparison({
        decisionToolResult: toolResult,
      });

      expect(result.success).toBe(true);
      expect(result.productCount).toBe(3);
      expect(result.outputSummary).toContain("Compared 3 products");
      expect(result.outputSummary).toContain("Winner: Test Phone 1");
      expect(result.outputSummary).toContain("Runner-up: Test Phone 2");
      expect(result.comparison).toBeDefined();
      expect(result.comparison!.winner.product.name).toBe("Test Phone 1");
      expect(result.comparison!.runnerUp).not.toBeNull();
    });

    it("respects maxProducts limit", async () => {
      const scored = [
        makeScoredProduct(mockSmartphones[0], { totalScore: 85, rank: 1 }),
        makeScoredProduct(mockSmartphones[1], { totalScore: 72, rank: 2 }),
        makeScoredProduct(mockSmartphones[2], { totalScore: 60, rank: 3 }),
      ];
      const decisionResult = makeDecisionResult(scored);
      const toolResult = makeDecisionToolResult(decisionResult);

      const result = await executeProductComparison({
        decisionToolResult: toolResult,
        maxProducts: 2,
      });

      expect(result.success).toBe(true);
      expect(result.productCount).toBe(2);
    });
  });

  describe("top ranked product selection", () => {
    it("selects the highest ranked product as winner", async () => {
      const scored = [
        makeScoredProduct(mockSmartphones[1], { totalScore: 90, rank: 1 }),
        makeScoredProduct(mockSmartphones[0], { totalScore: 75, rank: 2 }),
      ];
      const decisionResult = makeDecisionResult(scored);
      const toolResult = makeDecisionToolResult(decisionResult);

      const result = await executeProductComparison({
        decisionToolResult: toolResult,
      });

      expect(result.success).toBe(true);
      expect(result.comparison!.winner.product.id).toBe("phone-2");
      expect(result.comparison!.runnerUp!.product.id).toBe("phone-1");
    });
  });

  describe("strengths and weaknesses", () => {
    it("strengths appear in comparison data", async () => {
      const scored = [
        makeScoredProduct(mockSmartphones[0], {
          totalScore: 85,
          rank: 1,
          strengths: ["RAM", "Battery"],
          weaknesses: ["Storage"],
        }),
        makeScoredProduct(mockSmartphones[1], {
          totalScore: 72,
          rank: 2,
          strengths: ["Storage"],
          weaknesses: ["Battery"],
        }),
      ];
      const decisionResult = makeDecisionResult(scored);
      const toolResult = makeDecisionToolResult(decisionResult);

      const result = await executeProductComparison({
        decisionToolResult: toolResult,
      });

      expect(result.success).toBe(true);
      const compared = result.comparison!.products;
      expect(compared[0].strengths).toContain("RAM");
      expect(compared[0].strengths).toContain("Battery");
      expect(compared[0].weaknesses).toContain("Storage");
    });

    it("weaknesses appear in comparison data", async () => {
      const scored = [
        makeScoredProduct(mockSmartphones[0], {
          totalScore: 85,
          rank: 1,
          strengths: ["RAM"],
          weaknesses: ["Storage", "Battery"],
        }),
      ];
      const decisionResult = makeDecisionResult(scored);
      const toolResult = makeDecisionToolResult(decisionResult);

      const result = await executeProductComparison({
        decisionToolResult: toolResult,
      });

      expect(result.success).toBe(true);
      expect(result.comparison!.products[0].weaknesses).toContain("Storage");
      expect(result.comparison!.products[0].weaknesses).toContain("Battery");
    });
  });

  describe("trade-offs", () => {
    it("trade-offs are propagated from DecisionResult", async () => {
      const tradeOffs = [
        {
          criterionKey: "ram_gb",
          criterionLabel: "RAM",
          winnerProductId: "phone-1",
          winnerProductName: "Test Phone 1",
          score: 85,
        },
        {
          criterionKey: "storage_gb",
          criterionLabel: "Storage",
          winnerProductId: "phone-2",
          winnerProductName: "Test Phone 2",
          score: 90,
        },
      ];

      const scored = [
        makeScoredProduct(mockSmartphones[0], { totalScore: 85, rank: 1 }),
        makeScoredProduct(mockSmartphones[1], { totalScore: 72, rank: 2 }),
      ];
      const decisionResult = makeDecisionResult(scored, { tradeOffs });
      const toolResult = makeDecisionToolResult(decisionResult);

      const result = await executeProductComparison({
        decisionToolResult: toolResult,
      });

      expect(result.success).toBe(true);
      expect(result.comparison).toBeDefined();
      // The comparison uses the trade-offs from the engine
      expect(result.comparison!.attributes.length).toBeGreaterThan(0);
    });
  });

  describe("successful result structure", () => {
    it("returns all required fields on success", async () => {
      const scored = [
        makeScoredProduct(mockSmartphones[0], { totalScore: 85, rank: 1 }),
        makeScoredProduct(mockSmartphones[1], { totalScore: 72, rank: 2 }),
      ];
      const decisionResult = makeDecisionResult(scored);
      const toolResult = makeDecisionToolResult(decisionResult);

      const result = await executeProductComparison({
        decisionToolResult: toolResult,
      });

      expect(result.success).toBe(true);
      expect(result.productCount).toBe(2);
      expect(result.outputSummary).toBeTruthy();
      expect(result.comparison).toBeDefined();
      expect(result.comparison!.winner).toBeDefined();
      expect(result.comparison!.products).toHaveLength(2);
      expect(result.comparison!.whyWinnerWins).toBeDefined();
      expect(result.comparison!.bestForInsights).toBeDefined();
      expect(result.comparison!.decisionInsight).toBeTruthy();
    });
  });

  describe("failure result structure", () => {
    it("returns structured failure when category config is missing", async () => {
      const scored = [makeScoredProduct(mockSmartphones[0])];
      const decisionResult = makeDecisionResult(scored);
      const toolResult = makeDecisionToolResult(decisionResult, {
        effectiveCategory: "nonexistent_category",
      });

      const result = await executeProductComparison({
        decisionToolResult: toolResult,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("No category config found");
      expect(result.outputSummary).toContain("Comparison failed");
    });
  });

  describe("tool never throws unexpected errors", () => {
    it("does not throw for any input combination", async () => {
      // Test with various edge cases - none should throw
      await expect(
        executeProductComparison({
          decisionToolResult: {
            success: false,
            effectiveCategory: "",
            outputSummary: "",
          },
        })
      ).resolves.toBeDefined();

      await expect(
        executeProductComparison({
          decisionToolResult: {
            success: true,
            effectiveCategory: "smartphone",
            outputSummary: "",
          },
        })
      ).resolves.toBeDefined();

      await expect(
        executeProductComparison({
          decisionToolResult: makeDecisionToolResult(makeDecisionResult([])),
        })
      ).resolves.toBeDefined();

      await expect(
        executeProductComparison({
          decisionToolResult: makeDecisionToolResult(
            makeDecisionResult([
              makeScoredProduct(mockSmartphones[0], { totalScore: 85, rank: 1 }),
            ])
          ),
        })
      ).resolves.toBeDefined();
    });
  });

  describe("two products comparison", () => {
    it("handles exactly two products with margin in output", async () => {
      const scored = [
        makeScoredProduct(mockSmartphones[0], { totalScore: 85, rank: 1 }),
        makeScoredProduct(mockSmartphones[1], { totalScore: 72, rank: 2 }),
      ];
      const decisionResult = makeDecisionResult(scored);
      const toolResult = makeDecisionToolResult(decisionResult);

      const result = await executeProductComparison({
        decisionToolResult: toolResult,
      });

      expect(result.success).toBe(true);
      expect(result.productCount).toBe(2);
      expect(result.outputSummary).toContain("margin:");
      expect(result.comparison!.runnerUp).not.toBeNull();
    });
  });
});
