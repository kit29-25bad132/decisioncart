// ============================================================
// DecisionCart — Agent Orchestrator Tests (Step 4)
// Tests for search_catalog + run_decision + compare_products execution lifecycle.
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
    priorities: [],
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

// --- Cleanup after each test ---
afterEach(() => {
  clearDynamicCategories();
});

// --- Tests ---

describe("runAgent — search_catalog + run_decision + compare_products lifecycle", () => {
  beforeEach(() => {
    fetchProductsMock.mockReset();
  });

  it("full lifecycle: all three steps completed", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    const intent = makeIntent({
      priorities: [{ attributeKey: "ram_gb", importance: 2 }],
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput({ intent }));

    const searchStep = result.steps.find((s) => s.tool === "search_catalog");
    expect(searchStep).toBeDefined();
    expect(searchStep!.status).toBe("completed");
    expect(searchStep!.startedAt).toBeTypeOf("number");
    expect(searchStep!.completedAt).toBeTypeOf("number");

    const decisionStep = result.steps.find((s) => s.tool === "run_decision");
    expect(decisionStep).toBeDefined();
    expect(decisionStep!.status).toBe("completed");
    expect(decisionStep!.startedAt).toBeTypeOf("number");
    expect(decisionStep!.completedAt).toBeTypeOf("number");

    const compareStep = result.steps.find((s) => s.tool === "compare_products");
    expect(compareStep).toBeDefined();
    expect(compareStep!.status).toBe("completed");
    expect(compareStep!.startedAt).toBeTypeOf("number");
    expect(compareStep!.completedAt).toBeTypeOf("number");
  });

  it("overall status is completed when all three steps succeed", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    const intent = makeIntent({
      priorities: [{ attributeKey: "ram_gb", importance: 2 }],
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput({ intent }));

    expect(result.status).toBe("completed");
    expect(result.catalogSearchResult).toBeDefined();
    expect(result.catalogSearchResult!.success).toBe(true);
    expect(result.decisionResult).toBeDefined();
    expect(result.decisionResult!.success).toBe(true);
    expect(result.comparisonResult).toBeDefined();
    expect(result.comparisonResult!.success).toBe(true);
  });

  it("comparisonResult propagates to AgentResult", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    const intent = makeIntent({
      priorities: [{ attributeKey: "ram_gb", importance: 2 }],
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput({ intent }));

    expect(result.comparisonResult).toBeDefined();
    expect(result.comparisonResult!.success).toBe(true);
    expect(result.comparisonResult!.productCount).toBe(2);
    expect(result.comparisonResult!.outputSummary).toContain("Compared");
    expect(result.comparisonResult!.comparison).toBeDefined();
  });

  it("if catalog search fails: run_decision and compare_products remain pending", async () => {
    fetchProductsMock.mockRejectedValue(new Error("Provider unavailable"));

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput());

    expect(result.status).toBe("failed");

    const searchStep = result.steps.find((s) => s.tool === "search_catalog");
    expect(searchStep!.status).toBe("failed");

    const decisionStep = result.steps.find((s) => s.tool === "run_decision");
    expect(decisionStep!.status).toBe("pending");
    expect(decisionStep!.startedAt).toBeUndefined();

    const compareStep = result.steps.find((s) => s.tool === "compare_products");
    expect(compareStep!.status).toBe("pending");
    expect(compareStep!.startedAt).toBeUndefined();
  });

  it("if decision runner fails: compare_products remains pending", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    // Use a category that doesn't exist in the registry to cause decision failure
    const intent = makeIntent({ category: "nonexistent_category" });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput({ intent }));

    expect(result.status).toBe("failed");

    const searchStep = result.steps.find((s) => s.tool === "search_catalog");
    expect(searchStep!.status).toBe("completed");

    const decisionStep = result.steps.find((s) => s.tool === "run_decision");
    expect(decisionStep!.status).toBe("failed");
    expect(decisionStep!.error).toContain("No category config found");

    const compareStep = result.steps.find((s) => s.tool === "compare_products");
    expect(compareStep!.status).toBe("pending");
    expect(compareStep!.startedAt).toBeUndefined();
  });

  it("decision result propagates to AgentResult", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    const intent = makeIntent({
      priorities: [{ attributeKey: "ram_gb", importance: 2 }],
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput({ intent }));

    expect(result.decisionResult).toBeDefined();
    expect(result.decisionResult!.success).toBe(true);
    expect(result.decisionResult!.decisionResult).toBeDefined();
    expect(result.decisionResult!.decisionResult!.scoredProducts.length).toBeGreaterThan(0);
  });

  it("step order remains: search_catalog → analyze_reviews → run_decision → relax_constraints → compare_products", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput());

    expect(result.steps).toHaveLength(5);
    expect(result.steps.map((s) => s.tool)).toEqual([
      "search_catalog",
      "analyze_reviews",
      "run_decision",
      "relax_constraints",
      "compare_products",
    ]);
  });

  it("includes 5 steps in the plan", async () => {
    fetchProductsMock.mockResolvedValue({
      products: [],
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 0 },
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput());

    expect(result.steps).toHaveLength(5);
  });

  it("returns 'failed' for missing intent", async () => {
    const { runAgent } = await import("./orchestrator");
    const result = await runAgent({ intent: undefined as unknown as ParsedShoppingIntent });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("Missing parsed intent");
  });

  it("empty catalog results: all three steps completed", async () => {
    fetchProductsMock.mockResolvedValue({
      products: [],
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 0 },
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput());

    expect(result.status).toBe("completed");

    const searchStep = result.steps.find((s) => s.tool === "search_catalog");
    expect(searchStep!.status).toBe("completed");

    const decisionStep = result.steps.find((s) => s.tool === "run_decision");
    expect(decisionStep!.status).toBe("completed");

    const compareStep = result.steps.find((s) => s.tool === "compare_products");
    expect(compareStep!.status).toBe("completed");

    expect(result.decisionResult).toBeDefined();
    expect(result.decisionResult!.success).toBe(true);
    expect(result.decisionResult!.decisionResult!.scoredProducts).toEqual([]);

    expect(result.comparisonResult).toBeDefined();
    expect(result.comparisonResult!.success).toBe(true);
    expect(result.comparisonResult!.productCount).toBe(0);
  });

  it("propagates catalogSearchResult to AgentResult", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2, budgetFiltered: true },
    });

    const intent = makeIntent({
      priorities: [{ attributeKey: "ram_gb", importance: 2 }],
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput({ intent }));

    expect(result.catalogSearchResult).toBeDefined();
    expect(result.catalogSearchResult!.products).toHaveLength(2);
    expect(result.catalogSearchResult!.provider.id).toBe("demo-catalog");
    expect(result.catalogSearchResult!.metadata?.budgetFiltered).toBe(true);
  });

  it("preserves parsedIntent in result", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    const intent = makeIntent({ originalQuery: "find me a laptop" });
    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput({ intent }));

    expect(result.parsedIntent.originalQuery).toBe("find me a laptop");
  });

  it("comparison step has input summary and output summary", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    const intent = makeIntent({
      priorities: [{ attributeKey: "ram_gb", importance: 2 }],
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput({ intent }));

    const compareStep = result.steps.find((s) => s.tool === "compare_products");
    expect(compareStep!.inputSummary).toContain("scored product");
    expect(compareStep!.outputSummary).toContain("Compared");
  });

  it("comparison step timestamps are valid", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    const intent = makeIntent({
      priorities: [{ attributeKey: "ram_gb", importance: 2 }],
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput({ intent }));

    const compareStep = result.steps.find((s) => s.tool === "compare_products");
    expect(compareStep!.startedAt).toBeTypeOf("number");
    expect(compareStep!.completedAt).toBeTypeOf("number");
    expect(compareStep!.completedAt!).toBeGreaterThanOrEqual(compareStep!.startedAt!);
  });

  it("category: AgentInput.category overrides intent.category for catalog search", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    // Intent says smartphone, but AgentInput.category overrides to laptop
    const intent = makeIntent({ category: "smartphone" });

    const { runAgent } = await import("./orchestrator");
    await runAgent(makeInput({ intent, category: "laptop" }));

    // fetchProducts should have been called with category "laptop" (the override),
    // not "smartphone" (the intent category)
    const callArgs = fetchProductsMock.mock.calls[0] as [{ category?: string }];
    expect(callArgs[0].category).toBe("laptop");
  });

  it("category: falls back to intent.category when AgentInput.category is undefined", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    const intent = makeIntent({ category: "laptop" });

    const { runAgent } = await import("./orchestrator");
    // No category override — should fall back to intent.category
    await runAgent(makeInput({ intent }));

    const callArgs = fetchProductsMock.mock.calls[0] as [{ category?: string }];
    expect(callArgs[0].category).toBe("laptop");
  });
});
