// ============================================================
// DecisionCart — Catalog Search Tool Tests
// Tests for the bounded search_catalog tool.
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ParsedShoppingIntent } from "@/lib/ai/types";
import type { Product } from "@/types";
import type { ProductDataResult } from "@/catalog/provider";

// --- Mock Setup ---

const fetchProductsMock = vi.fn<(...args: unknown[]) => Promise<ProductDataResult>>();

vi.mock("@/catalog/registry", () => ({
  fetchProducts: (...args: unknown[]) => fetchProductsMock(...args),
}));

// --- Helpers ---

function makeIntent(overrides: Partial<ParsedShoppingIntent> = {}): ParsedShoppingIntent {
  return {
    category: "smartphone",
    priorities: [],
    constraints: [],
    confidence: 0.8,
    originalQuery: "best smartphone under 30000",
    ...overrides,
  };
}

const mockProducts: Product[] = [
  {
    id: "phone-1",
    name: "Test Phone 1",
    brand: "Brand A",
    category: "smartphone",
    price: 15000,
    attributes: {},
    confidence: {},
  },
  {
    id: "phone-2",
    name: "Test Phone 2",
    brand: "Brand B",
    category: "smartphone",
    price: 25000,
    attributes: {},
    confidence: {},
  },
];

// --- Tests ---

describe("executeCatalogSearch", () => {
  beforeEach(() => {
    fetchProductsMock.mockReset();
  });

  it("passes category from intent to fetchProducts", async () => {
    const { executeCatalogSearch } = await import("./catalog-search");

    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    const intent = makeIntent({ category: "laptop" });
    const result = await executeCatalogSearch({ intent });

    expect(result.success).toBe(true);
    expect(fetchProductsMock).toHaveBeenCalledWith(
      expect.objectContaining({ category: "laptop" })
    );
  });

  it("maps budget.max to maxBudget", async () => {
    const { executeCatalogSearch } = await import("./catalog-search");

    fetchProductsMock.mockResolvedValue({
      products: [],
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 0 },
    });

    const intent = makeIntent({ budget: { max: 30000 } });
    await executeCatalogSearch({ intent });

    expect(fetchProductsMock).toHaveBeenCalledWith(
      expect.objectContaining({ maxBudget: 30000 })
    );
  });

  it("maps budget.min to minBudget", async () => {
    const { executeCatalogSearch } = await import("./catalog-search");

    fetchProductsMock.mockResolvedValue({
      products: [],
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 0 },
    });

    const intent = makeIntent({ budget: { min: 10000 } });
    await executeCatalogSearch({ intent });

    expect(fetchProductsMock).toHaveBeenCalledWith(
      expect.objectContaining({ minBudget: 10000 })
    );
  });

  it("category override takes precedence over intent.category", async () => {
    const { executeCatalogSearch } = await import("./catalog-search");

    fetchProductsMock.mockResolvedValue({
      products: [],
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 0 },
    });

    const intent = makeIntent({ category: "smartphone" });
    const result = await executeCatalogSearch({ intent, categoryOverride: "laptop" });

    expect(result.success).toBe(true);
    expect(fetchProductsMock).toHaveBeenCalledWith(
      expect.objectContaining({ category: "laptop" })
    );
  });

  it("missing category returns controlled failure", async () => {
    const { executeCatalogSearch } = await import("./catalog-search");

    const intent = makeIntent({ category: "" });
    const result = await executeCatalogSearch({ intent });

    expect(result.success).toBe(false);
    expect(result.error).toContain("No category");
    expect(result.products).toEqual([]);
    expect(result.outputSummary).toContain("failed");
    // fetchProducts should NOT be called
    expect(fetchProductsMock).not.toHaveBeenCalled();
  });

  it("successful search returns products with summary", async () => {
    const { executeCatalogSearch } = await import("./catalog-search");

    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    const intent = makeIntent();
    const result = await executeCatalogSearch({ intent });

    expect(result.success).toBe(true);
    expect(result.products).toHaveLength(2);
    expect(result.provider.id).toBe("demo-catalog");
    expect(result.outputSummary).toContain("Found 2 products");
    expect(result.outputSummary).toContain("smartphone");
  });

  it("empty results are successful, not failures", async () => {
    const { executeCatalogSearch } = await import("./catalog-search");

    fetchProductsMock.mockResolvedValue({
      products: [],
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 0 },
    });

    const intent = makeIntent();
    const result = await executeCatalogSearch({ intent });

    expect(result.success).toBe(true);
    expect(result.products).toEqual([]);
    expect(result.outputSummary).toContain("Found 0 products");
    expect(result.error).toBeUndefined();
  });

  it("provider failure becomes controlled failure", async () => {
    const { executeCatalogSearch } = await import("./catalog-search");

    fetchProductsMock.mockRejectedValue(
      new Error("Provider unavailable")
    );

    const intent = makeIntent();
    const result = await executeCatalogSearch({ intent });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Provider unavailable");
    expect(result.products).toEqual([]);
    expect(result.outputSummary).toContain("failed");
    expect(result.outputSummary).toContain("Provider unavailable");
  });

  it("non-Error provider failure is handled safely", async () => {
    const { executeCatalogSearch } = await import("./catalog-search");

    fetchProductsMock.mockRejectedValue("string error");

    const intent = makeIntent();
    const result = await executeCatalogSearch({ intent });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Unknown provider error");
  });

  it("includes metadata when provider returns it", async () => {
    const { executeCatalogSearch } = await import("./catalog-search");

    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: {
        totalCount: 10,
        budgetFiltered: true,
        note: "Filtered by budget",
      },
    });

    const intent = makeIntent({ budget: { max: 20000 } });
    const result = await executeCatalogSearch({ intent });

    expect(result.success).toBe(true);
    expect(result.metadata?.budgetFiltered).toBe(true);
    expect(result.metadata?.totalCount).toBe(10);
    expect(result.outputSummary).toContain("matching the requested budget");
  });

  it("does not invent budget values when intent has no budget", async () => {
    const { executeCatalogSearch } = await import("./catalog-search");

    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    const intent = makeIntent({ budget: undefined });
    await executeCatalogSearch({ intent });

    expect(fetchProductsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "smartphone",
        maxBudget: undefined,
        minBudget: undefined,
      })
    );
  });

  it("always returns fetchedAt as ISO string", async () => {
    const { executeCatalogSearch } = await import("./catalog-search");

    fetchProductsMock.mockResolvedValue({
      products: [],
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-06-15T12:00:00.000Z",
      metadata: { totalCount: 0 },
    });

    const intent = makeIntent();
    const result = await executeCatalogSearch({ intent });

    expect(result.fetchedAt).toBeDefined();
    expect(new Date(result.fetchedAt).toISOString()).toBe(result.fetchedAt);
  });
});
