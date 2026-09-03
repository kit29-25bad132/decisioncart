// ============================================================
// DecisionCart — Degraded Step Indicator Tests
// Tests for the degraded metadata on non-fatal tool failures.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AgentInput } from "./agent-types";
import type { ParsedShoppingIntent } from "@/lib/ai/types";
import type { Product } from "@/types";
import type { ProductDataResult } from "@/catalog/provider";
import { clearDynamicCategories } from "@/catalog/category-resolver";

// --- Mock Setup ---

const fetchProductsMock = vi.fn<(...args: unknown[]) => Promise<ProductDataResult>>();

vi.mock("@/catalog/registry", () => ({
  fetchProducts: (...args: unknown[]) => fetchProductsMock(...args),
}));

const mockReviewAnalyzer = vi.fn();
vi.mock("./tools/review-analyzer", () => ({
  executeReviewAnalyzer: (...args: unknown[]) => mockReviewAnalyzer(...args),
}));

const mockPriceInventoryCheck = vi.fn();
vi.mock("./tools/price-inventory-check", () => ({
  executePriceInventoryCheck: (...args: unknown[]) => mockPriceInventoryCheck(...args),
}));

// --- Mock Products ---

const mockProducts: Product[] = [
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
];

// --- Helpers ---

function makeIntent(overrides: Partial<ParsedShoppingIntent> = {}): ParsedShoppingIntent {
  return {
    category: "smartphone",
    priorities: [{ attributeKey: "ram_gb", importance: 2 }],
    constraints: [],
    confidence: 0.8,
    originalQuery: "best smartphone under 30000",
    ...overrides,
  };
}

function makeInput(overrides: Partial<AgentInput> = {}): AgentInput {
  return {
    intent: makeIntent(),
    ...overrides,
  };
}

// --- Cleanup ---

afterEach(() => {
  clearDynamicCategories();
});

// ============================================================
// Tests
// ============================================================

describe("Degraded step indicator", () => {
  beforeEach(() => {
    fetchProductsMock.mockReset();
    mockReviewAnalyzer.mockReset();
    mockPriceInventoryCheck.mockReset();
    vi.restoreAllMocks();
  });

  // --- A. Normal successful review analysis ---

  it("A. successful review analysis: status=completed, degraded is not true", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    mockReviewAnalyzer.mockResolvedValue({
      success: true,
      reviews: { "phone-1": { summary: "Great", sentiment: "positive" } },
      analyzedCount: 1,
      outputSummary: "Analyzed 1 product reviews.",
    });

    mockPriceInventoryCheck.mockResolvedValue({
      success: true,
      productId: "phone-1",
      verifiedPrice: 15000,
      currency: "INR",
      available: true,
      checkedAt: new Date().toISOString(),
      source: "DecisionCart demo catalog",
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput());

    const reviewStep = result.steps.find((s) => s.tool === "analyze_reviews");
    expect(reviewStep).toBeDefined();
    expect(reviewStep!.status).toBe("completed");
    expect(reviewStep!.degraded).not.toBe(true);
  });

  // --- B. Review analysis non-fatal failure ---

  it("B. review analysis failure: workflow continues, step is degraded=true", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    // Review analyzer fails
    mockReviewAnalyzer.mockResolvedValue({
      success: false,
      reviews: {},
      analyzedCount: 0,
      outputSummary: "Review analysis failed: provider unavailable.",
      error: "provider unavailable",
    });

    mockPriceInventoryCheck.mockResolvedValue({
      success: true,
      productId: "phone-1",
      verifiedPrice: 15000,
      currency: "INR",
      available: true,
      checkedAt: new Date().toISOString(),
      source: "DecisionCart demo catalog",
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput());

    // Workflow should complete (not fail)
    expect(result.status).toBe("completed");

    // Review step should be degraded
    const reviewStep = result.steps.find((s) => s.tool === "analyze_reviews");
    expect(reviewStep).toBeDefined();
    expect(reviewStep!.status).toBe("completed");
    expect(reviewStep!.degraded).toBe(true);
    expect(reviewStep!.outputSummary).toContain("failed");

    // Subsequent steps should still complete
    const decisionStep = result.steps.find((s) => s.tool === "run_decision");
    expect(decisionStep!.status).toBe("completed");

    const compareStep = result.steps.find((s) => s.tool === "compare_products");
    expect(compareStep!.status).toBe("completed");
  });

  // --- C. Normal successful price verification ---

  it("C. successful price verification: status=completed, degraded is not true", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    mockReviewAnalyzer.mockResolvedValue({
      success: true,
      reviews: {},
      analyzedCount: 0,
      outputSummary: "No reviews to analyze.",
    });

    mockPriceInventoryCheck.mockResolvedValue({
      success: true,
      productId: "phone-1",
      verifiedPrice: 15000,
      currency: "INR",
      available: true,
      checkedAt: new Date().toISOString(),
      source: "DecisionCart demo catalog",
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput());

    const verifyStep = result.steps.find((s) => s.tool === "verify_purchase");
    expect(verifyStep).toBeDefined();
    expect(verifyStep!.status).toBe("completed");
    expect(verifyStep!.degraded).not.toBe(true);
  });

  // --- D. Price verification non-fatal failure ---

  it("D. price verification failure: workflow continues, step is degraded=true", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    mockReviewAnalyzer.mockResolvedValue({
      success: true,
      reviews: {},
      analyzedCount: 0,
      outputSummary: "No reviews to analyze.",
    });

    // Price verification fails
    mockPriceInventoryCheck.mockResolvedValue({
      success: false,
      productId: "phone-1",
      checkedAt: new Date().toISOString(),
      source: "DecisionCart demo catalog",
      error: "Product not found in catalog",
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput());

    // Workflow should complete (not fail)
    expect(result.status).toBe("completed");

    // Verify step should be degraded
    const verifyStep = result.steps.find((s) => s.tool === "verify_purchase");
    expect(verifyStep).toBeDefined();
    expect(verifyStep!.status).toBe("completed");
    expect(verifyStep!.degraded).toBe(true);
    expect(verifyStep!.outputSummary).toContain("Verification failed");
  });

  // --- E. Fatal tool failures must remain failed, NOT degraded ---

  it("E. fatal search_catalog failure: status=failed, NOT degraded", async () => {
    fetchProductsMock.mockRejectedValue(new Error("Provider unavailable"));

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput());

    expect(result.status).toBe("failed");

    const searchStep = result.steps.find((s) => s.tool === "search_catalog");
    expect(searchStep!.status).toBe("failed");
    expect(searchStep!.degraded).not.toBe(true);
  });

  it("E. fatal run_decision failure: status=failed, NOT degraded", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    mockReviewAnalyzer.mockResolvedValue({
      success: true,
      reviews: {},
      analyzedCount: 0,
      outputSummary: "No reviews.",
    });

    // Use nonexistent category to cause decision failure
    const intent = makeIntent({ category: "nonexistent_category" });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput({ intent }));

    expect(result.status).toBe("failed");

    const decisionStep = result.steps.find((s) => s.tool === "run_decision");
    expect(decisionStep!.status).toBe("failed");
    expect(decisionStep!.degraded).not.toBe(true);
  });

  it("E. fatal compare_products failure: status=failed, NOT degraded", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    mockReviewAnalyzer.mockResolvedValue({
      success: true,
      reviews: {},
      analyzedCount: 0,
      outputSummary: "No reviews.",
    });

    // Make comparison tool throw to trigger failure
    const originalModule = await import("./tools/product-comparison");
    vi.spyOn(originalModule, "executeProductComparison").mockRejectedValue(
      new Error("Comparison engine crashed")
    );

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput());

    expect(result.status).toBe("failed");

    const compareStep = result.steps.find((s) => s.tool === "compare_products");
    expect(compareStep!.status).toBe("failed");
    expect(compareStep!.degraded).not.toBe(true);
  });

  // --- F. Both tools can degrade independently ---

  it("F. both review and verification can degrade in same run", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    // Both fail
    mockReviewAnalyzer.mockResolvedValue({
      success: false,
      reviews: {},
      analyzedCount: 0,
      outputSummary: "Review analysis failed.",
      error: "unavailable",
    });

    mockPriceInventoryCheck.mockResolvedValue({
      success: false,
      productId: "phone-1",
      checkedAt: new Date().toISOString(),
      source: "DecisionCart demo catalog",
      error: "Verification failed",
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput());

    expect(result.status).toBe("completed");

    const reviewStep = result.steps.find((s) => s.tool === "analyze_reviews");
    expect(reviewStep!.degraded).toBe(true);

    const verifyStep = result.steps.find((s) => s.tool === "verify_purchase");
    expect(verifyStep!.degraded).toBe(true);

    // Core steps are not degraded
    const searchStep = result.steps.find((s) => s.tool === "search_catalog");
    expect(searchStep!.degraded).not.toBe(true);

    const decisionStep = result.steps.find((s) => s.tool === "run_decision");
    expect(decisionStep!.degraded).not.toBe(true);
  });

  // --- G. Skipped steps are NOT degraded ---

  it("G. skipped relax_constraints is NOT degraded", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    mockReviewAnalyzer.mockResolvedValue({
      success: true,
      reviews: {},
      analyzedCount: 0,
      outputSummary: "No reviews.",
    });

    mockPriceInventoryCheck.mockResolvedValue({
      success: true,
      productId: "phone-1",
      verifiedPrice: 15000,
      currency: "INR",
      available: true,
      checkedAt: new Date().toISOString(),
      source: "DecisionCart demo catalog",
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput());

    const relaxationStep = result.steps.find((s) => s.tool === "relax_constraints");
    expect(relaxationStep!.status).toBe("skipped");
    expect(relaxationStep!.degraded).not.toBe(true);
  });
});
