// ============================================================
// DecisionCart — Agent Orchestrator Tests (Step 3)
// Tests for search_catalog + run_decision execution lifecycle.
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

describe("runAgent — search_catalog + run_decision lifecycle", () => {
  beforeEach(() => {
    fetchProductsMock.mockReset();
  });

  it("successful lifecycle: search_catalog completed → run_decision completed → compare_products pending", async () => {
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
    expect(compareStep!.status).toBe("pending");
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

  it("if catalog search fails: run_decision remains pending", async () => {
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
  });

  it("if decision tool fails: run_decision becomes failed", async () => {
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
  });

  it("overall status becomes failed when decision fails", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    const intent = makeIntent({ category: "nonexistent_category" });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput({ intent }));

    expect(result.status).toBe("failed");
    expect(result.error).toContain("No category config found");
  });

  it("empty catalog results: search_catalog completed → run_decision completed → overall completed", async () => {
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

    expect(result.decisionResult).toBeDefined();
    expect(result.decisionResult!.success).toBe(true);
    expect(result.decisionResult!.decisionResult!.scoredProducts).toEqual([]);
  });

  it("step order remains: search_catalog → run_decision → compare_products", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput());

    expect(result.steps).toHaveLength(3);
    expect(result.steps.map((s) => s.tool)).toEqual([
      "search_catalog",
      "run_decision",
      "compare_products",
    ]);
  });

  it("includes 3 steps in the plan", async () => {
    fetchProductsMock.mockResolvedValue({
      products: [],
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 0 },
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput());

    expect(result.steps).toHaveLength(3);
  });

  it("returns 'failed' for missing intent", async () => {
    const { runAgent } = await import("./orchestrator");
    const result = await runAgent({ intent: undefined as unknown as ParsedShoppingIntent });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("Missing parsed intent");
  });

  it("returns 'completed' status when both catalog and decision succeed", async () => {
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

  it("decision step has input summary and output summary", async () => {
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

    const decisionStep = result.steps.find((s) => s.tool === "run_decision");
    expect(decisionStep!.inputSummary).toContain("2 products");
    expect(decisionStep!.inputSummary).toContain("category=\"smartphone\"");
    expect(decisionStep!.outputSummary).toContain("Ranked");
  });

  it("decision step timestamps are valid", async () => {
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

    const decisionStep = result.steps.find((s) => s.tool === "run_decision");
    expect(decisionStep!.startedAt).toBeTypeOf("number");
    expect(decisionStep!.completedAt).toBeTypeOf("number");
    expect(decisionStep!.completedAt!).toBeGreaterThanOrEqual(decisionStep!.startedAt!);
  });
});
