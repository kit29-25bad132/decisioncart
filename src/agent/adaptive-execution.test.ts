// ============================================================
// DecisionCart — Adaptive Agent Execution Tests
// Tests for query mode classification and adaptive tool skipping.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AgentInput } from "./agent-types";
import type { ParsedShoppingIntent } from "@/lib/ai/types";
import type { Product } from "@/types";
import type { ProductDataResult } from "@/catalog/provider";
import { clearDynamicCategories } from "@/catalog/category-resolver";
import { classifyQueryMode } from "./orchestrator";

// --- Mock Setup ---

const fetchProductsMock = vi.fn<(...args: unknown[]) => Promise<ProductDataResult>>();

vi.mock("@/catalog/registry", () => ({
  fetchProducts: (...args: unknown[]) => fetchProductsMock(...args),
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
  {
    id: "phone-3",
    name: "Test Phone 3",
    brand: "Brand C",
    category: "smartphone",
    price: 20000,
    attributes: { ram_gb: 6, storage_gb: 128, battery_mah: 6000 },
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
// classifyQueryMode Unit Tests
// ============================================================

describe("classifyQueryMode", () => {
  it("classifies purchase query with budget + constraints", () => {
    const mode = classifyQueryMode(makeIntent({
      originalQuery: "phone under 30000 with great camera",
      budget: { max: 30000 },
      constraints: [{ type: "max_price", value: 30000 }],
    }));
    expect(mode).toBe("purchase");
  });

  it("classifies purchase query with explicit buy language", () => {
    const mode = classifyQueryMode(makeIntent({
      originalQuery: "buy me a phone under 30000",
      budget: { max: 30000 },
    }));
    expect(mode).toBe("purchase");
  });

  it("classifies compare query with comparison language", () => {
    const mode = classifyQueryMode(makeIntent({
      originalQuery: "compare Samsung vs iPhone",
    }));
    expect(mode).toBe("compare");
  });

  it("classifies explore query for general recommendation", () => {
    const mode = classifyQueryMode(makeIntent({
      originalQuery: "what's the best phone",
    }));
    expect(mode).toBe("explore");
  });

  it("classifies explore query for informational query", () => {
    const mode = classifyQueryMode(makeIntent({
      originalQuery: "tell me about phones with good cameras",
    }));
    expect(mode).toBe("explore");
  });

  it("classifies purchase query with order language", () => {
    const mode = classifyQueryMode(makeIntent({
      originalQuery: "order a laptop for coding under 60000",
      budget: { max: 60000 },
      constraints: [{ type: "max_price", value: 60000 }],
    }));
    expect(mode).toBe("purchase");
  });

  it("classifies compare query with vs language", () => {
    const mode = classifyQueryMode(makeIntent({
      originalQuery: "which is better, phone A or phone B",
    }));
    expect(mode).toBe("compare");
  });

  it("classifies purchase query with only budget (meaningful budget = purchase intent)", () => {
    const mode = classifyQueryMode(makeIntent({
      originalQuery: "phones under 30000",
      budget: { max: 30000 },
    }));
    expect(mode).toBe("purchase");
  });
});

// ============================================================
// Adaptive Execution Integration Tests
// ============================================================

describe("Adaptive agent execution", () => {
  beforeEach(() => {
    fetchProductsMock.mockReset();
    mockPriceInventoryCheck.mockReset();
  });

  // --- A. Exploration query: verify_purchase skipped ---

  it("A. exploration query: verify_purchase is skipped", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 3 },
    });

    const intent = makeIntent({
      originalQuery: "what's the best phone",
      priorities: [{ attributeKey: "ram_gb", importance: 2 }],
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput({ intent }));

    expect(result.status).toBe("completed");

    const verifyStep = result.steps.find((s) => s.tool === "verify_purchase");
    expect(verifyStep).toBeDefined();
    expect(verifyStep!.status).toBe("skipped");
    expect(verifyStep!.outputSummary).toContain("not needed for");
  });

  // --- B. Purchase query: verify_purchase executes ---

  it("B. purchase query: verify_purchase executes", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 3 },
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

    const intent = makeIntent({
      originalQuery: "buy me a phone under 30000 with great camera",
      budget: { max: 30000 },
      constraints: [{ type: "max_price", value: 30000 }],
      priorities: [{ attributeKey: "ram_gb", importance: 2 }],
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput({ intent }));

    expect(result.status).toBe("completed");

    const verifyStep = result.steps.find((s) => s.tool === "verify_purchase");
    expect(verifyStep).toBeDefined();
    expect(verifyStep!.status).toBe("completed");
    expect(verifyStep!.outputSummary).toContain("Price verified");
  });

  // --- C. Comparison query: verify_purchase skipped ---

  it("C. comparison query: verify_purchase is skipped", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 3 },
    });

    const intent = makeIntent({
      originalQuery: "compare Samsung vs iPhone",
      priorities: [{ attributeKey: "ram_gb", importance: 2 }],
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput({ intent }));

    expect(result.status).toBe("completed");

    const verifyStep = result.steps.find((s) => s.tool === "verify_purchase");
    expect(verifyStep).toBeDefined();
    expect(verifyStep!.status).toBe("skipped");
    expect(verifyStep!.outputSummary).toContain("not needed for");
  });

  // --- D. Comparison tool: skips when fewer than 2 products ---

  it("D. compare_products skips when fewer than 2 scored products", async () => {
    fetchProductsMock.mockResolvedValue({
      products: [mockProducts[0]], // Only 1 product
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 1 },
    });

    const intent = makeIntent({
      originalQuery: "what's the best phone",
      priorities: [{ attributeKey: "ram_gb", importance: 2 }],
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput({ intent }));

    expect(result.status).toBe("completed");

    const compareStep = result.steps.find((s) => s.tool === "compare_products");
    expect(compareStep).toBeDefined();
    expect(compareStep!.status).toBe("skipped");
    expect(compareStep!.outputSummary).toContain("fewer than two");
  });

  // --- E. Comparison tool: runs when enough products exist ---

  it("E. compare_products runs when 3 scored products exist", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts, // 3 products
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 3 },
    });

    const intent = makeIntent({
      originalQuery: "what's the best phone",
      priorities: [{ attributeKey: "ram_gb", importance: 2 }],
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput({ intent }));

    expect(result.status).toBe("completed");

    const compareStep = result.steps.find((s) => s.tool === "compare_products");
    expect(compareStep).toBeDefined();
    expect(compareStep!.status).toBe("completed");
    expect(compareStep!.outputSummary).toContain("Compared");
  });

  // --- F. Mode appears in search step input summary ---

  it("F. search step includes query mode in input summary", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 3 },
    });

    const intent = makeIntent({
      originalQuery: "what's the best phone",
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput({ intent }));

    const searchStep = result.steps.find((s) => s.tool === "search_catalog");
    expect(searchStep!.inputSummary).toContain("Mode: explore");
  });

  // --- G. Legacy full pipeline still works for purchase queries ---

  it("G. purchase query runs full pipeline including verification", async () => {
    fetchProductsMock.mockResolvedValue({
      products: mockProducts,
      provider: { id: "demo-catalog", label: "Demo Catalog" },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      metadata: { totalCount: 3 },
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

    const intent = makeIntent({
      originalQuery: "order a phone under 30000 with great camera",
      budget: { max: 30000 },
      constraints: [{ type: "max_price", value: 30000 }],
      priorities: [{ attributeKey: "ram_gb", importance: 2 }],
    });

    const { runAgent } = await import("./orchestrator");
    const result = await runAgent(makeInput({ intent }));

    expect(result.status).toBe("completed");
    expect(result.steps).toHaveLength(7);

    // For a purchase query with 3 products: all critical steps run
    // relax_constraints is skipped because products matched (existing behavior)
    const skippedSteps = result.steps.filter((s) => s.status === "skipped");
    expect(skippedSteps.map((s) => s.tool)).toEqual(["relax_constraints"]);

    // Verify specific steps ran
    const verifyStep = result.steps.find((s) => s.tool === "verify_purchase");
    expect(verifyStep!.status).toBe("completed");

    const compareStep = result.steps.find((s) => s.tool === "compare_products");
    expect(compareStep!.status).toBe("completed");
  });
});
