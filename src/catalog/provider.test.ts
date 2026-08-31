// ============================================================
// DecisionCart — Product Data Provider Tests
// Comprehensive tests for the provider abstraction layer.
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import { StaticCatalogProvider } from "./static-provider";
import {
  initializeProviders,
  registerProvider,
  getProviderForCategory,
  fetchProducts,
  setCategoryProvider,
  resetRegistry,
  getRegisteredProviderIds,
  isProviderRegistered,
} from "./registry";
import { ProductProviderError, type ProductDataProvider } from "./provider";
import { runDecision } from "@/engine/decision-engine";
import { getCatalog } from "./demo-data";
import { getCategoryConfig } from "./categories";
import type { UserPreference } from "@/types";

// --- Static Catalog Provider Tests ---

describe("StaticCatalogProvider", () => {
  const provider = new StaticCatalogProvider();

  it("has correct id and label", () => {
    expect(provider.id).toBe("demo-catalog");
    expect(provider.label).toBe("Demo Catalog");
  });

  it("returns smartphone products", async () => {
    const result = await provider.getProducts({ category: "smartphone" });

    expect(result.products.length).toBeGreaterThan(0);
    expect(result.products.every((p) => p.category === "smartphone")).toBe(true);
    expect(result.provider.id).toBe("demo-catalog");
    expect(result.provider.label).toBe("Demo Catalog");
  });

  it("returns laptop products", async () => {
    const result = await provider.getProducts({ category: "laptop" });

    expect(result.products.length).toBeGreaterThan(0);
    expect(result.products.every((p) => p.category === "laptop")).toBe(true);
  });

  it("returns correct metadata", async () => {
    const result = await provider.getProducts({ category: "smartphone" });

    expect(result.fetchedAt).toBeDefined();
    expect(new Date(result.fetchedAt).toISOString()).toBe(result.fetchedAt);
    expect(result.metadata).toBeDefined();
    expect(result.metadata!.totalCount).toBe(result.products.length);
    expect(result.metadata!.note).toContain("demo");
  });

  it("applies maxBudget pre-filtering", async () => {
    const result = await provider.getProducts({
      category: "smartphone",
      maxBudget: 30000,
    });

    expect(result.products.every((p) => p.price <= 30000)).toBe(true);
    expect(result.metadata!.budgetFiltered).toBe(true);
  });

  it("applies minBudget pre-filtering", async () => {
    const result = await provider.getProducts({
      category: "smartphone",
      minBudget: 40000,
    });

    expect(result.products.every((p) => p.price >= 40000)).toBe(true);
    expect(result.metadata!.budgetFiltered).toBe(true);
  });

  it("applies limit", async () => {
    const result = await provider.getProducts({
      category: "smartphone",
      limit: 2,
    });

    expect(result.products.length).toBe(2);
  });

  it("reports totalCount before limit is applied", async () => {
    const result = await provider.getProducts({
      category: "smartphone",
      limit: 1,
    });

    expect(result.metadata!.totalCount).toBeGreaterThan(1);
    expect(result.products.length).toBe(1);
  });

  it("returns normalized Product[] matching existing contract", async () => {
    const result = await provider.getProducts({ category: "smartphone" });

    for (const product of result.products) {
      expect(product.id).toBeDefined();
      expect(product.name).toBeDefined();
      expect(product.brand).toBeDefined();
      expect(product.category).toBe("smartphone");
      expect(typeof product.price).toBe("number");
      expect(product.attributes).toBeDefined();
      expect(product.confidence).toBeDefined();
    }
  });

  it("throws ProductProviderError for unsupported category", async () => {
    await expect(
      provider.getProducts({ category: "headphones" })
    ).rejects.toThrow(ProductProviderError);

    try {
      await provider.getProducts({ category: "headphones" });
    } catch (err) {
      expect(err).toBeInstanceOf(ProductProviderError);
      const providerErr = err as ProductProviderError;
      expect(providerErr.providerId).toBe("demo-catalog");
      expect(providerErr.code).toBe("unsupported_category");
    }
  });

  it("returns all products when no budget or limit specified", async () => {
    const result = await provider.getProducts({ category: "smartphone" });
    const directCatalog = getCatalog("smartphone");

    expect(result.products.length).toBe(directCatalog.length);
    expect(result.metadata!.budgetFiltered).toBeFalsy();
  });
});

// --- Registry Tests ---

describe("ProductProviderRegistry", () => {
  beforeEach(() => {
    resetRegistry();
    initializeProviders();
  });

  it("initializes with default static provider", () => {
    const ids = getRegisteredProviderIds();
    expect(ids).toContain("demo-catalog");
  });

  it("resolves default provider for any category", () => {
    const provider = getProviderForCategory("smartphone");
    expect(provider.id).toBe("demo-catalog");
  });

  it("resolves same provider for unknown categories (falls through to default)", () => {
    const provider = getProviderForCategory("headphones");
    expect(provider.id).toBe("demo-catalog");
  });

  it("supports category-specific provider override", () => {
    const mockProvider: ProductDataProvider = {
      id: "mock-provider",
      label: "Mock Provider",
      getProducts: async () => ({
        products: [],
        provider: { id: "mock-provider", label: "Mock Provider" },
        fetchedAt: new Date().toISOString(),
      }),
    };

    registerProvider(mockProvider);
    setCategoryProvider("headphones", mockProvider.id);

    const provider = getProviderForCategory("headphones");
    expect(provider.id).toBe("mock-provider");

    // Other categories still use default
    const defaultProvider = getProviderForCategory("smartphone");
    expect(defaultProvider.id).toBe("demo-catalog");
  });

  it("fetchProducts delegates to correct provider", async () => {
    const result = await fetchProducts({ category: "smartphone" });

    expect(result.products.length).toBeGreaterThan(0);
    expect(result.provider.id).toBe("demo-catalog");
  });

  it("registers multiple providers", () => {
    const mockA: ProductDataProvider = {
      id: "provider-a",
      label: "Provider A",
      getProducts: async () => ({
        products: [],
        provider: { id: "provider-a", label: "Provider A" },
        fetchedAt: new Date().toISOString(),
      }),
    };
    const mockB: ProductDataProvider = {
      id: "provider-b",
      label: "Provider B",
      getProducts: async () => ({
        products: [],
        provider: { id: "provider-b", label: "Provider B" },
        fetchedAt: new Date().toISOString(),
      }),
    };

    registerProvider(mockA);
    registerProvider(mockB);

    expect(isProviderRegistered("provider-a")).toBe(true);
    expect(isProviderRegistered("provider-b")).toBe(true);
    expect(getRegisteredProviderIds()).toHaveLength(3); // demo-catalog + a + b
  });

  it("isProviderRegistered returns false for unknown", () => {
    expect(isProviderRegistered("nonexistent")).toBe(false);
  });
});

// --- Error Handling Tests ---

describe("ProductProviderError", () => {
  it("has correct properties", () => {
    const err = new ProductProviderError(
      "test message",
      "test-provider",
      "unavailable"
    );

    expect(err.message).toBe("test message");
    expect(err.providerId).toBe("test-provider");
    expect(err.code).toBe("unavailable");
    expect(err.name).toBe("ProductProviderError");
    expect(err instanceof Error).toBe(true);
  });

  it("supports all error codes", () => {
    const codes = [
      "unavailable",
      "empty",
      "unsupported_category",
      "invalid_request",
      "timeout",
      "unknown",
    ] as const;

    for (const code of codes) {
      const err = new ProductProviderError("msg", "p", code);
      expect(err.code).toBe(code);
    }
  });
});

// --- Decision Engine Integration Tests ---

describe("Provider output with Decision Engine", () => {
  it("Decision Engine works with provider output for smartphones", async () => {
    const provider = new StaticCatalogProvider();
    const result = await provider.getProducts({ category: "smartphone" });
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 35000 },
      priorities: [
        { attributeKey: "camera_score", importance: 3 },
        { attributeKey: "battery_mah", importance: 2 },
      ],
      constraints: [],
    };

    const decision = runDecision(result.products, preference, categoryConfig);

    expect(decision.scoredProducts.length).toBeGreaterThan(0);
    expect(decision.categoryLabel).toBe("Smartphone");
    expect(decision.tradeOffs.length).toBeGreaterThan(0);

    // All products should be within budget
    for (const sp of decision.scoredProducts) {
      expect(sp.product.price).toBeLessThanOrEqual(35000);
    }
  });

  it("Decision Engine works with provider output for laptops", async () => {
    const provider = new StaticCatalogProvider();
    const result = await provider.getProducts({ category: "laptop" });
    const categoryConfig = getCategoryConfig("laptop")!;

    const preference: UserPreference = {
      category: "laptop",
      budget: { max: 60000 },
      priorities: [
        { attributeKey: "processor_score", importance: 3 },
        { attributeKey: "ram_gb", importance: 2 },
      ],
      constraints: [],
    };

    const decision = runDecision(result.products, preference, categoryConfig);

    expect(decision.scoredProducts.length).toBeGreaterThan(0);
    expect(decision.categoryLabel).toBe("Laptop");
  });

  it("existing decision results remain unchanged with provider", async () => {
    // Compare direct catalog vs provider output
    const directCatalog = getCatalog("smartphone");
    const provider = new StaticCatalogProvider();
    const providerResult = await provider.getProducts({ category: "smartphone" });

    const categoryConfig = getCategoryConfig("smartphone")!;
    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [
        { attributeKey: "camera_score", importance: 3 },
        { attributeKey: "battery_mah", importance: 2 },
        { attributeKey: "ram_gb", importance: 1 },
      ],
      constraints: [],
    };

    const directDecision = runDecision(directCatalog, preference, categoryConfig);
    const providerDecision = runDecision(
      providerResult.products,
      preference,
      categoryConfig
    );

    // Results should be identical
    expect(providerDecision.scoredProducts.length).toBe(
      directDecision.scoredProducts.length
    );
    expect(providerDecision.categoryLabel).toBe(directDecision.categoryLabel);

    for (let i = 0; i < directDecision.scoredProducts.length; i++) {
      expect(providerDecision.scoredProducts[i].product.id).toBe(
        directDecision.scoredProducts[i].product.id
      );
      expect(providerDecision.scoredProducts[i].totalScore).toBe(
        directDecision.scoredProducts[i].totalScore
      );
      expect(providerDecision.scoredProducts[i].rank).toBe(
        directDecision.scoredProducts[i].rank
      );
    }
  });

  it("Decision Engine handles empty provider results gracefully", async () => {
    const categoryConfig = getCategoryConfig("smartphone")!;
    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 100 }, // Very low budget — no products match
      priorities: [],
      constraints: [],
    };

    const decision = runDecision([], preference, categoryConfig);

    expect(decision.scoredProducts.length).toBe(0);
    expect(decision.emptyResultAnalysis).toBeDefined();
  });

  it("provider output is category-agnostic", async () => {
    const provider = new StaticCatalogProvider();

    const smartphoneResult = await provider.getProducts({
      category: "smartphone",
    });
    const laptopResult = await provider.getProducts({ category: "laptop" });

    // Both return valid Product[] — no category-specific logic in provider
    expect(smartphoneResult.products.every((p) => p.id.startsWith("phone-"))).toBe(true);
    expect(laptopResult.products.every((p) => p.id.startsWith("laptop-"))).toBe(true);

    // Both have the same provider info structure
    expect(smartphoneResult.provider.id).toBe(laptopResult.provider.id);
    expect(smartphoneResult.provider.label).toBe(laptopResult.provider.label);
  });
});
