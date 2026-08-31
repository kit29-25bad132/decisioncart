// ============================================================
// DecisionCart — Fallback Product Provider Tests
// Comprehensive tests for the hybrid fallback provider architecture.
// ============================================================

import { describe, it, expect } from "vitest";
import { FallbackProductProvider } from "./fallback-provider";
import { MockExternalProvider } from "./mock-external-provider";
import { StaticCatalogProvider } from "./static-provider";
import { ProductProviderError, type ProductDataProvider } from "./provider";
import type { ProductDataRequest, ProductDataResult } from "./provider";

// --- Helpers ---

function makeRequest(category = "smartphone"): ProductDataRequest {
  return { category };
}

function makeSuccessResult(
  providerId = "test",
  label = "Test",
): ProductDataResult {
  return {
    products: [
      {
        id: "test-001",
        name: "Test Product",
        brand: "Test",
        category: "smartphone",
        price: 10000,
        attributes: { camera_score: 70 },
        confidence: { camera_score: "high" },
      },
    ],
    provider: { id: providerId, label },
    fetchedAt: new Date().toISOString(),
    metadata: { note: "Test result" },
  };
}

function makeProviderThatSucceeds(
  id: string,
  label: string,
): ProductDataProvider {
  return {
    id,
    label,
    getProducts: async () => makeSuccessResult(id, label),
  };
}

function makeProviderThatFails(
  id: string,
  label: string,
  code: ProductProviderError["code"] = "unavailable",
): ProductDataProvider {
  return {
    id,
    label,
    getProducts: async () => {
      throw new ProductProviderError(
        `Provider "${id}" is unavailable`,
        id,
        code,
      );
    },
  };
}

function makeProviderThatThrowsUnexpected(id: string): ProductDataProvider {
  return {
    id,
    label: `Unexpected-${id}`,
    getProducts: async () => {
      throw new Error("Something totally unexpected happened");
    },
  };
}

function makeProviderThatReturnsEmpty(
  id: string,
  label: string,
): ProductDataProvider {
  return {
    id,
    label,
    getProducts: async () => ({
      products: [],
      provider: { id, label },
      fetchedAt: new Date().toISOString(),
      metadata: { note: "No products found" },
    }),
  };
}

// --- Tests ---

describe("FallbackProductProvider", () => {
  describe("Primary success returns primary result", () => {
    it("returns primary result when primary succeeds", async () => {
      const primary = makeProviderThatSucceeds("primary", "Primary");
      const fallback = makeProviderThatSucceeds("fallback", "Fallback");
      const provider = new FallbackProductProvider(primary, fallback);

      const result = await provider.getProducts(makeRequest());

      expect(result.provider.id).toBe("primary");
      expect(result.provider.label).toBe("Primary");
      expect(result.products.length).toBe(1);
      expect(result.products[0].id).toBe("test-001");
    });

    it("does not call fallback when primary succeeds", async () => {
      let fallbackCalled = false;
      const primary = makeProviderThatSucceeds("primary", "Primary");
      const fallback: ProductDataProvider = {
        id: "fallback",
        label: "Fallback",
        getProducts: async () => {
          fallbackCalled = true;
          return makeSuccessResult("fallback", "Fallback");
        },
      };
      const provider = new FallbackProductProvider(primary, fallback);

      await provider.getProducts(makeRequest());

      expect(fallbackCalled).toBe(false);
    });
  });

  describe("Primary failure triggers fallback", () => {
    it("falls back when primary throws ProductProviderError", async () => {
      const primary = makeProviderThatFails("primary", "Primary");
      const fallback = makeProviderThatSucceeds("fallback", "Fallback");
      const provider = new FallbackProductProvider(primary, fallback);

      const result = await provider.getProducts(makeRequest());

      expect(result.provider.id).toBe("fallback");
      expect(result.provider.label).toBe("Fallback");
      expect(result.products.length).toBe(1);
    });

    it("falls back on any ProductProviderError code", async () => {
      const codes = [
        "unavailable",
        "empty",
        "unsupported_category",
        "invalid_request",
        "timeout",
        "unknown",
      ] as const;

      for (const code of codes) {
        const primary = makeProviderThatFails("primary", "Primary", code);
        const fallback = makeProviderThatSucceeds("fallback", "Fallback");
        const provider = new FallbackProductProvider(primary, fallback);

        const result = await provider.getProducts(makeRequest());
        expect(result.provider.id).toBe("fallback");
      }
    });
  });

  describe("Fallback metadata correctly indicates fallbackUsed", () => {
    it("sets fallbackUsed: true when fallback is used", async () => {
      const primary = makeProviderThatFails("primary", "Primary");
      const fallback = makeProviderThatSucceeds("fallback", "Fallback");
      const provider = new FallbackProductProvider(primary, fallback);

      const result = await provider.getProducts(makeRequest());

      expect(result.metadata?.fallbackUsed).toBe(true);
      expect(result.metadata?.fallbackProviderId).toBe("fallback");
    });

    it("sets fallbackUsed: false when primary succeeds", async () => {
      const primary = makeProviderThatSucceeds("primary", "Primary");
      const fallback = makeProviderThatSucceeds("fallback", "Fallback");
      const provider = new FallbackProductProvider(primary, fallback);

      const result = await provider.getProducts(makeRequest());

      expect(result.metadata?.fallbackUsed).toBe(false);
    });
  });

  describe("Primary provider ID is preserved", () => {
    it("includes primaryProviderId in metadata on primary success", async () => {
      const primary = makeProviderThatSucceeds("primary", "Primary");
      const fallback = makeProviderThatSucceeds("fallback", "Fallback");
      const provider = new FallbackProductProvider(primary, fallback);

      const result = await provider.getProducts(makeRequest());

      expect(result.metadata?.primaryProviderId).toBe("primary");
    });

    it("includes primaryProviderId in metadata on fallback", async () => {
      const primary = makeProviderThatFails("primary", "Primary");
      const fallback = makeProviderThatSucceeds("fallback", "Fallback");
      const provider = new FallbackProductProvider(primary, fallback);

      const result = await provider.getProducts(makeRequest());

      expect(result.metadata?.primaryProviderId).toBe("primary");
    });
  });

  describe("Fallback provider ID is preserved", () => {
    it("includes fallbackProviderId in metadata when fallback is used", async () => {
      const primary = makeProviderThatFails("primary", "Primary");
      const fallback = makeProviderThatSucceeds("fallback", "Fallback");
      const provider = new FallbackProductProvider(primary, fallback);

      const result = await provider.getProducts(makeRequest());

      expect(result.metadata?.fallbackProviderId).toBe("fallback");
    });
  });

  describe("Empty successful primary result does NOT trigger fallback", () => {
    it("returns empty result from primary without calling fallback", async () => {
      let fallbackCalled = false;
      const primary = makeProviderThatReturnsEmpty("primary", "Primary");
      const fallback: ProductDataProvider = {
        id: "fallback",
        label: "Fallback",
        getProducts: async () => {
          fallbackCalled = true;
          return makeSuccessResult("fallback", "Fallback");
        },
      };
      const provider = new FallbackProductProvider(primary, fallback);

      const result = await provider.getProducts(makeRequest());

      expect(result.products).toEqual([]);
      expect(result.provider.id).toBe("primary");
      expect(fallbackCalled).toBe(false);
    });
  });

  describe("Both providers failing produces ProductProviderError", () => {
    it("throws ProductProviderError when both providers fail", async () => {
      const primary = makeProviderThatFails("primary", "Primary");
      const fallback = makeProviderThatFails("fallback", "Fallback");
      const provider = new FallbackProductProvider(primary, fallback);

      await expect(provider.getProducts(makeRequest())).rejects.toThrow(
        ProductProviderError,
      );
    });

    it("error message contains context from both providers", async () => {
      const primary = makeProviderThatFails("primary", "Primary");
      const fallback = makeProviderThatFails("fallback", "Fallback");
      const provider = new FallbackProductProvider(primary, fallback);

      try {
        await provider.getProducts(makeRequest());
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ProductProviderError);
        const err = error as ProductProviderError;
        expect(err.message).toContain("primary");
        expect(err.message).toContain("fallback");
        expect(err.message).toContain("Both providers failed");
      }
    });

    it("error preserves the primary provider's error code", async () => {
      const primary = makeProviderThatFails("primary", "Primary", "timeout");
      const fallback = makeProviderThatFails("fallback", "Fallback");
      const provider = new FallbackProductProvider(primary, fallback);

      try {
        await provider.getProducts(makeRequest());
        expect.fail("Should have thrown");
      } catch (error) {
        const err = error as ProductProviderError;
        expect(err.code).toBe("timeout");
      }
    });
  });

  describe("Unexpected primary error handled safely", () => {
    it("wraps unexpected errors into ProductProviderError", async () => {
      const primary = makeProviderThatThrowsUnexpected("primary");
      const fallback = makeProviderThatSucceeds("fallback", "Fallback");
      const provider = new FallbackProductProvider(primary, fallback);

      await expect(provider.getProducts(makeRequest())).rejects.toThrow(
        ProductProviderError,
      );
    });

    it("error message includes original error details", async () => {
      const primary = makeProviderThatThrowsUnexpected("primary");
      const fallback = makeProviderThatSucceeds("fallback", "Fallback");
      const provider = new FallbackProductProvider(primary, fallback);

      try {
        await provider.getProducts(makeRequest());
        expect.fail("Should have thrown");
      } catch (error) {
        const err = error as ProductProviderError;
        expect(err.message).toContain("Unexpected");
        expect(err.message).toContain("Something totally unexpected happened");
        expect(err.code).toBe("unknown");
      }
    });
  });

  describe("Request is forwarded unchanged", () => {
    it("forwards the exact request to primary", async () => {
      let receivedRequest: ProductDataRequest | null = null;
      const primary: ProductDataProvider = {
        id: "primary",
        label: "Primary",
        getProducts: async (request) => {
          receivedRequest = request;
          return makeSuccessResult("primary", "Primary");
        },
      };
      const fallback = makeProviderThatSucceeds("fallback", "Fallback");
      const provider = new FallbackProductProvider(primary, fallback);

      const request: ProductDataRequest = {
        category: "laptop",
        maxBudget: 50000,
        minBudget: 20000,
        limit: 5,
        query: "lightweight",
      };

      await provider.getProducts(request);

      expect(receivedRequest).toEqual(request);
    });

    it("forwards the exact request to fallback on failure", async () => {
      let receivedRequest: ProductDataRequest | null = null;
      const primary = makeProviderThatFails("primary", "Primary");
      const fallback: ProductDataProvider = {
        id: "fallback",
        label: "Fallback",
        getProducts: async (request) => {
          receivedRequest = request;
          return makeSuccessResult("fallback", "Fallback");
        },
      };
      const provider = new FallbackProductProvider(primary, fallback);

      const request: ProductDataRequest = {
        category: "laptop",
        maxBudget: 60000,
      };

      await provider.getProducts(request);

      expect(receivedRequest).toEqual(request);
    });
  });

  describe("Category-agnostic behavior", () => {
    it("works with smartphone category", async () => {
      const primary = new MockExternalProvider();
      const fallback = new StaticCatalogProvider();
      const provider = new FallbackProductProvider(primary, fallback);

      const result = await provider.getProducts({ category: "smartphone" });

      expect(result.products.length).toBeGreaterThan(0);
      expect(result.products.every((p) => p.category === "smartphone")).toBe(
        true,
      );
    });

    it("works with laptop category", async () => {
      const primary = new MockExternalProvider();
      const fallback = new StaticCatalogProvider();
      const provider = new FallbackProductProvider(primary, fallback);

      const result = await provider.getProducts({ category: "laptop" });

      expect(result.products.length).toBeGreaterThan(0);
      expect(result.products.every((p) => p.category === "laptop")).toBe(true);
    });

    it("generates category-agnostic provider ID and label", () => {
      const primary = makeProviderThatSucceeds("a", "A");
      const fallback = makeProviderThatSucceeds("b", "B");
      const provider = new FallbackProductProvider(primary, fallback);

      expect(provider.id).toBe("fallback-a-b");
      expect(provider.label).toBe("A → B");
    });
  });

  describe("Data source type", () => {
    it("sets dataSourceType to 'hybrid' when fallback is used", async () => {
      const primary = makeProviderThatFails("primary", "Primary");
      const fallback = makeProviderThatSucceeds("fallback", "Fallback");
      const provider = new FallbackProductProvider(primary, fallback);

      const result = await provider.getProducts(makeRequest());

      expect(result.metadata?.dataSourceType).toBe("hybrid");
    });

    it("preserves primary's dataSourceType when primary succeeds", async () => {
      const primary: ProductDataProvider = {
        id: "primary",
        label: "Primary",
        getProducts: async () => ({
          ...makeSuccessResult("primary", "Primary"),
          metadata: { dataSourceType: "external" as const },
        }),
      };
      const fallback = makeProviderThatSucceeds("fallback", "Fallback");
      const provider = new FallbackProductProvider(primary, fallback);

      const result = await provider.getProducts(makeRequest());

      expect(result.metadata?.dataSourceType).toBe("external");
    });
  });

  describe("Preserves original metadata", () => {
    it("preserves metadata from fallback when fallback is used", async () => {
      const primary = makeProviderThatFails("primary", "Primary");
      const fallback: ProductDataProvider = {
        id: "fallback",
        label: "Fallback",
        getProducts: async () => ({
          ...makeSuccessResult("fallback", "Fallback"),
          metadata: {
            note: "Fallback data",
            totalCount: 42,
            budgetFiltered: true,
          },
        }),
      };
      const provider = new FallbackProductProvider(primary, fallback);

      const result = await provider.getProducts(makeRequest());

      expect(result.metadata?.note).toBe("Fallback data");
      expect(result.metadata?.totalCount).toBe(42);
      expect(result.metadata?.budgetFiltered).toBe(true);
      expect(result.metadata?.fallbackUsed).toBe(true);
    });
  });
});

describe("Real provider integration", () => {
  it("MockExternalProvider and StaticCatalogProvider work as fallback pair", async () => {
    const external = new MockExternalProvider();
    const static_ = new StaticCatalogProvider();
    const hybrid = new FallbackProductProvider(external, static_);

    const result = await hybrid.getProducts({ category: "smartphone" });

    expect(result.products.length).toBeGreaterThan(0);
    expect(result.metadata?.primaryProviderId).toBe("mock-external");
    expect(result.metadata?.fallbackUsed).toBe(false);
    expect(result.fetchedAt).toBeDefined();
  });

  it("StaticCatalogProvider works as fallback when MockExternalProvider fails", async () => {
    const failing: ProductDataProvider = {
      id: "failing",
      label: "Failing Provider",
      getProducts: async () => {
        throw new ProductProviderError(
          "Simulated failure",
          "failing",
          "unavailable",
        );
      },
    };
    const static_ = new StaticCatalogProvider();
    const hybrid = new FallbackProductProvider(failing, static_);

    const result = await hybrid.getProducts({ category: "smartphone" });

    expect(result.products.length).toBe(6);
    expect(result.metadata?.fallbackUsed).toBe(true);
    expect(result.metadata?.fallbackProviderId).toBe("demo-catalog");
    expect(result.metadata?.primaryProviderId).toBe("failing");
    expect(result.metadata?.dataSourceType).toBe("hybrid");
  });
});
