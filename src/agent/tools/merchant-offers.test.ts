// ============================================================
// DecisionCart — Merchant Offers Tool Tests
// Tests for the bounded merchant offers agent tool.
// ============================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Merchant, MerchantOffer, Product } from "@/types";
import { executeMerchantOffers } from "./merchant-offers";

// --- Mock Setup ---

const mockGetOffersByProduct = vi.fn<(...args: unknown[]) => Promise<MerchantOffer[]>>();
const mockGetAllMerchants = vi.fn<(...args: unknown[]) => Promise<Merchant[]>>();

vi.mock("@/merchant/merchant-repository", () => ({
  getMerchantRepository: () => ({
    getOffersByProduct: (...args: unknown[]) => mockGetOffersByProduct(...args),
    getAllMerchants: (...args: unknown[]) => mockGetAllMerchants(...args),
  }),
}));

// --- Fixtures ---

const MOCK_MERCHANTS: Merchant[] = [
  {
    id: "merchant-valuekart",
    name: "ValueKart Express",
    trustScore: 76,
    verified: false,
    fulfillmentSpeed: "standard",
    ratingCount: 1240,
    returnPolicyDays: 7,
  },
  {
    id: "merchant-omniretail",
    name: "OmniRetail Direct",
    trustScore: 98,
    verified: true,
    fulfillmentSpeed: "fast",
    ratingCount: 8750,
    returnPolicyDays: 14,
  },
];

const MOCK_PRODUCT: Product = {
  id: "phone-1",
  name: "Test Phone",
  brand: "Brand A",
  category: "smartphone",
  price: 25000,
  attributes: { ram_gb: 8 },
  confidence: { ram_gb: "high" },
};

function makeOffer(
  overrides: Partial<MerchantOffer> & { id: string; merchantId: string; productId: string }
): MerchantOffer {
  return {
    price: 25000,
    currency: "INR",
    stock: 10,
    warrantyMonths: 12,
    deliveryDays: 3,
    updatedAt: "2026-09-03T00:00:00.000Z",
    isAvailable: true,
    ...overrides,
  };
}

// --- Tests ---

describe("executeMerchantOffers", () => {
  beforeEach(() => {
    mockGetOffersByProduct.mockReset();
    mockGetAllMerchants.mockReset();
    mockGetAllMerchants.mockResolvedValue(MOCK_MERCHANTS);
  });

  // --- 1. Successful merchant offer retrieval ---

  it("returns successful result with merchant selections", async () => {
    mockGetOffersByProduct.mockResolvedValue([
      makeOffer({ id: "o1", merchantId: "merchant-valuekart", productId: "phone-1", price: 23750 }),
      makeOffer({ id: "o2", merchantId: "merchant-omniretail", productId: "phone-1", price: 25000 }),
    ]);

    const result = await executeMerchantOffers({
      products: [MOCK_PRODUCT],
      priorities: [],
    });

    expect(result.success).toBe(true);
    expect(result.selectionCount).toBe(1);
    expect(result.selectionsByProductId["phone-1"]).toBeDefined();
    expect(result.selectionsByProductId["phone-1"].selectedOffer).toBeDefined();
    expect(result.selectionsByProductId["phone-1"].merchant).toBeDefined();
    expect(result.selectionsByProductId["phone-1"].explanation.length).toBeGreaterThan(0);
  });

  // --- 2. Correct deterministic merchant selection ---

  it("selects cheapest offer for price-sensitive priorities", async () => {
    mockGetOffersByProduct.mockResolvedValue([
      makeOffer({ id: "o1", merchantId: "merchant-valuekart", productId: "phone-1", price: 23750 }),
      makeOffer({ id: "o2", merchantId: "merchant-omniretail", productId: "phone-1", price: 25000 }),
    ]);

    const result = await executeMerchantOffers({
      products: [MOCK_PRODUCT],
      priorities: [{ attributeKey: "budget", importance: 3 }],
    });

    expect(result.success).toBe(true);
    expect(result.selectionsByProductId["phone-1"].selectedOffer.merchantId).toBe("merchant-valuekart");
  });

  it("selects highest-trust offer for reliability-sensitive priorities", async () => {
    mockGetOffersByProduct.mockResolvedValue([
      makeOffer({ id: "o1", merchantId: "merchant-valuekart", productId: "phone-1", price: 23750 }),
      makeOffer({ id: "o2", merchantId: "merchant-omniretail", productId: "phone-1", price: 25000 }),
    ]);

    const result = await executeMerchantOffers({
      products: [MOCK_PRODUCT],
      priorities: [{ attributeKey: "reliability", importance: 3 }],
    });

    expect(result.success).toBe(true);
    expect(result.selectionsByProductId["phone-1"].selectedOffer.merchantId).toBe("merchant-omniretail");
  });

  // --- 3. Product filtering ---

  it("evaluates offers for each product independently", async () => {
    const product2: Product = { ...MOCK_PRODUCT, id: "phone-2", name: "Phone 2" };

    mockGetOffersByProduct.mockImplementation(async (arg: unknown) => {
      const productId = arg as string;
      if (productId === "phone-1") {
        return [
          makeOffer({ id: "o1", merchantId: "merchant-valuekart", productId: "phone-1", price: 23750 }),
        ];
      }
      return [
          makeOffer({ id: "o2", merchantId: "merchant-omniretail", productId: "phone-2", price: 30000 }),
      ];
    });

    const result = await executeMerchantOffers({
      products: [MOCK_PRODUCT, product2],
      priorities: [],
    });

    expect(result.success).toBe(true);
    expect(result.selectionCount).toBe(2);
    expect(result.selectionsByProductId["phone-1"]).toBeDefined();
    expect(result.selectionsByProductId["phone-2"]).toBeDefined();
  });

  // --- 4. Invalid input handling ---

  it("returns safe result for empty products", async () => {
    const result = await executeMerchantOffers({
      products: [],
      priorities: [],
    });

    expect(result.success).toBe(true);
    expect(result.selectionCount).toBe(0);
    expect(Object.keys(result.selectionsByProductId)).toHaveLength(0);
    expect(result.outputSummary).toContain("skipped");
  });

  // --- 5. Missing offers ---

  it("handles products with no merchant offers", async () => {
    mockGetOffersByProduct.mockResolvedValue([]);

    const result = await executeMerchantOffers({
      products: [MOCK_PRODUCT],
      priorities: [],
    });

    expect(result.success).toBe(true);
    expect(result.selectionCount).toBe(0);
    expect(result.outputSummary).toContain("No merchant selections");
  });

  it("handles mix of products with and without offers", async () => {
    mockGetOffersByProduct.mockImplementation(async (arg: unknown) => {
      const productId = arg as string;
      if (productId === "phone-1") {
        return [
          makeOffer({ id: "o1", merchantId: "merchant-valuekart", productId: "phone-1", price: 23750 }),
        ];
      }
      return [];
    });

    const product2: Product = { ...MOCK_PRODUCT, id: "phone-2", name: "Phone 2" };
    const result = await executeMerchantOffers({
      products: [MOCK_PRODUCT, product2],
      priorities: [],
    });

    expect(result.success).toBe(true);
    expect(result.selectionCount).toBe(1);
    expect(result.selectionsByProductId["phone-1"]).toBeDefined();
    expect(result.selectionsByProductId["phone-2"]).toBeUndefined();
  });

  // --- 6. Repository failure handling ---

  it("handles repository errors gracefully", async () => {
    mockGetAllMerchants.mockRejectedValue(new Error("Repository unavailable"));

    const result = await executeMerchantOffers({
      products: [MOCK_PRODUCT],
      priorities: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Repository unavailable");
    expect(result.selectionCount).toBe(0);
    expect(result.outputSummary).toContain("failed");
  });

  it("handles getOffersByProduct errors gracefully", async () => {
    mockGetOffersByProduct.mockRejectedValue(new Error("Database connection lost"));

    const result = await executeMerchantOffers({
      products: [MOCK_PRODUCT],
      priorities: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Database connection lost");
  });

  // --- 7. Tool never throws ---

  it("never throws on any input", async () => {
    mockGetAllMerchants.mockRejectedValue(new Error("Critical failure"));
    mockGetOffersByProduct.mockRejectedValue(new Error("Critical failure"));

    // Should not throw
    const result1 = await executeMerchantOffers({ products: [], priorities: [] });
    expect(result1).toBeDefined();

    const result2 = await executeMerchantOffers({ products: [MOCK_PRODUCT], priorities: [] });
    expect(result2).toBeDefined();

    const result3 = await executeMerchantOffers({
      products: [MOCK_PRODUCT],
      priorities: [{ attributeKey: "budget", importance: 3 }],
    });
    expect(result3).toBeDefined();
  });

  // --- Additional edge cases ---

  it("returns empty result when no merchants available", async () => {
    mockGetAllMerchants.mockResolvedValue([]);

    const result = await executeMerchantOffers({
      products: [MOCK_PRODUCT],
      priorities: [],
    });

    expect(result.success).toBe(true);
    expect(result.selectionCount).toBe(0);
    expect(result.outputSummary).toContain("no merchants available");
  });

  it("outputSummary mentions merchant names on success", async () => {
    mockGetOffersByProduct.mockResolvedValue([
      makeOffer({ id: "o1", merchantId: "merchant-valuekart", productId: "phone-1", price: 23750 }),
      makeOffer({ id: "o2", merchantId: "merchant-omniretail", productId: "phone-1", price: 25000 }),
    ]);

    const result = await executeMerchantOffers({
      products: [MOCK_PRODUCT],
      priorities: [],
    });

    expect(result.success).toBe(true);
    // Summary should mention at least one merchant name
    expect(
      result.outputSummary.includes("ValueKart") ||
      result.outputSummary.includes("OmniRetail")
    ).toBe(true);
  });
});
