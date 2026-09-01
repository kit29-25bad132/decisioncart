// ============================================================
// DecisionCart — Agent Orchestrator Tests (Step 2)
// Tests for search_catalog execution lifecycle.
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentInput } from "./agent-types";
import type { ParsedShoppingIntent } from "@/lib/ai/types";
import type { Product } from "@/types";
import type { ProductDataResult } from "@/catalog/provider";

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

// --- Tests ---

describe("runAgent — search_catalog lifecycle", () => {
  beforeEach(() => {
    fetchProductsMock.mockReset();
  });

  it("lifecycle: pending → running → completed for search_catalog", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput());

    const searchStep = result.steps.find((s) => s.tool === "search_catalog");
    expect(searchStep).toBeDefined();
    expect(searchStep!.status).toBe("completed");
    expect(searchStep!.startedAt).toBeTypeOf("number");
    expect(searchStep!.completedAt).toBeTypeOf("number");
    expect(searchStep!.completedAt!).toBeGreaterThanOrEqual(searchStep!.startedAt!);
    expect(searchStep!.outputSummary).toContain("Found 2 products");
  });

  it("run_decision remains pending", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput());

    const decisionStep = result.steps.find((s) => s.tool === "run_decision");
    expect(decisionStep).toBeDefined();
    expect(decisionStep!.status).toBe("pending");
    expect(decisionStep!.startedAt).toBeUndefined();
    expect(decisionStep!.completedAt).toBeUndefined();
  });

  it("compare_products remains pending", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput());

    const compareStep = result.steps.find((s) => s.tool === "compare_products");
    expect(compareStep).toBeDefined();
    expect(compareStep!.status).toBe("pending");
  });

  it("returns 'completed' status when catalog search succeeds", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2 },
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput());

    expect(result.status).toBe("completed");
    expect(result.catalogSearchResult).toBeDefined();
    expect(result.catalogSearchResult!.success).toBe(true);
  });

  it("returns 'failed' status when catalog search fails", async () => {
    fetchProductsMock.mockRejectedValue(new Error("Provider unavailable"));

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput());

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Provider unavailable");
    expect(result.catalogSearchResult?.success).toBe(false);
  });

  it("returns 'failed' for missing intent", async () => {
    const { runAgent } = await import("./orchestrator");
    const result = await runAgent({ intent: undefined as unknown as ParsedShoppingIntent });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("Missing parsed intent");
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
    expect(result.steps.map((s) => s.tool)).toEqual([
      "search_catalog",
      "run_decision",
      "compare_products",
    ]);
  });

  it("empty results are completed, not failed", async () => {
    fetchProductsMock.mockResolvedValue({
      products: [],
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 0 },
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput());

    expect(result.status).toBe("completed");
    expect(result.catalogSearchResult!.success).toBe(true);
    expect(result.catalogSearchResult!.products).toEqual([]);
  });

  it("propagates catalogSearchResult to AgentResult", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 2, budgetFiltered: true },
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput());

    expect(result.catalogSearchResult).toBeDefined();
    expect(result.catalogSearchResult!.products).toHaveLength(2);
    expect(result.catalogSearchResult!.provider.id).toBe("demo-catalog");
    expect(result.catalogSearchResult!.metadata?.budgetFiltered).toBe(true);
  });

  it("preserves parsedIntent in result", async () => {
    fetchProductsMock.mockResolvedValue({
      products: [],
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 0 },
    });

    const intent = makeIntent({ originalQuery: "find me a laptop" });
    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput({ intent }));

    expect(result.parsedIntent.originalQuery).toBe("find me a laptop");
  });
});
