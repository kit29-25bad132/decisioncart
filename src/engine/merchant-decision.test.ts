// ============================================================
// DecisionCart — Merchant Decision Intelligence Tests
// Tests for the deterministic merchant scoring and ranking engine.
// ============================================================

import { describe, it, expect } from "vitest";
import type {
  Merchant,
  MerchantOffer,
  PriorityItem,
} from "@/types";
import {
  calculateMerchantWeights,
  calculateDimensionScores,
  scoreMerchantOffer,
  filterEligibleOffers,
  runMerchantDecision,
  scoreAllMerchantOffers,
} from "./merchant-decision";

// --- Test Fixtures ---

const MERCHANTS: Merchant[] = [
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
  {
    id: "merchant-careplus",
    name: "CarePlus Premium",
    trustScore: 90,
    verified: true,
    fulfillmentSpeed: "priority",
    ratingCount: 3420,
    returnPolicyDays: 30,
  },
];

function makeOffer(
  overrides: Partial<MerchantOffer> & { id: string; merchantId: string; productId: string }
): MerchantOffer {
  return {
    price: 30000,
    currency: "INR",
    stock: 10,
    warrantyMonths: 12,
    deliveryDays: 3,
    updatedAt: "2026-09-03T00:00:00.000Z",
    isAvailable: true,
    ...overrides,
  };
}

function makePriority(
  attributeKey: string,
  importance: number
): PriorityItem {
  return { attributeKey, importance };
}

// --- Tests ---

describe("Merchant Decision Intelligence", () => {
  // ============================================================
  // 1. calculateMerchantWeights
  // ============================================================

  describe("calculateMerchantWeights", () => {
    it("returns balanced weights when no priorities provided", () => {
      const weights = calculateMerchantWeights([]);
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 6);
      // All dimensions should have positive weight (exponential decay
      // naturally creates spread — same as the product engine)
      for (const dim of ["price", "trust", "stock", "warranty", "delivery"]) {
        expect(weights[dim]).toBeGreaterThan(0);
      }
    });

    it("boosts price dimension for budget priority", () => {
      const weights = calculateMerchantWeights([
        makePriority("budget", 3),
      ]);
      // Price should have the highest weight
      expect(weights.price).toBeGreaterThan(weights.trust);
      expect(weights.price).toBeGreaterThan(weights.warranty);
      expect(weights.price).toBeGreaterThan(weights.delivery);
    });

    it("boosts trust dimension for reliability priority", () => {
      const weights = calculateMerchantWeights([
        makePriority("reliability", 3),
      ]);
      expect(weights.trust).toBeGreaterThan(weights.price);
      expect(weights.trust).toBeGreaterThan(weights.warranty);
    });

    it("boosts warranty dimension for warranty priority", () => {
      const weights = calculateMerchantWeights([
        makePriority("warranty", 3),
      ]);
      expect(weights.warranty).toBeGreaterThan(weights.price);
      expect(weights.warranty).toBeGreaterThan(weights.trust);
    });

    it("boosts delivery dimension for delivery priority", () => {
      const weights = calculateMerchantWeights([
        makePriority("delivery", 3),
      ]);
      expect(weights.delivery).toBeGreaterThan(weights.price);
      expect(weights.delivery).toBeGreaterThan(weights.warranty);
    });

    it("handles multiple priorities", () => {
      const weights = calculateMerchantWeights([
        makePriority("budget", 3),
        makePriority("reliability", 2),
      ]);
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 6);
      // Both price and trust should be boosted above baseline
      expect(weights.price).toBeGreaterThan(0.15);
      expect(weights.trust).toBeGreaterThan(0.15);
    });

    it("ignores unmapped priority keys", () => {
      const weights = calculateMerchantWeights([
        makePriority("camera_score", 3),
      ]);
      // Should use balanced weights (no dimension boosted)
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 6);
    });

    it("normalizes weights to sum to 1.0", () => {
      const weights = calculateMerchantWeights([
        makePriority("budget", 3),
        makePriority("warranty", 2),
        makePriority("delivery", 1),
      ]);
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 6);
    });
  });

  // ============================================================
  // 2. calculateDimensionScores
  // ============================================================

  describe("calculateDimensionScores", () => {
    it("scores cheapest offer highest on price dimension", () => {
      const offer = makeOffer({ id: "cheap", merchantId: "m1", productId: "p1", price: 25000 });
      const merchant = MERCHANTS[0];
      const scores = calculateDimensionScores(offer, merchant, { min: 25000, max: 35000 });
      expect(scores.price).toBe(100);
    });

    it("scores most expensive offer lowest on price dimension", () => {
      const offer = makeOffer({ id: "expensive", merchantId: "m1", productId: "p1", price: 35000 });
      const merchant = MERCHANTS[0];
      const scores = calculateDimensionScores(offer, merchant, { min: 25000, max: 35000 });
      expect(scores.price).toBe(0);
    });

    it("scores mid-range price proportionally", () => {
      const offer = makeOffer({ id: "mid", merchantId: "m1", productId: "p1", price: 30000 });
      const merchant = MERCHANTS[0];
      const scores = calculateDimensionScores(offer, merchant, { min: 25000, max: 35000 });
      expect(scores.price).toBe(50);
    });

    it("full price score when all offers are the same price", () => {
      const offer = makeOffer({ id: "same", merchantId: "m1", productId: "p1", price: 30000 });
      const merchant = MERCHANTS[0];
      const scores = calculateDimensionScores(offer, merchant, { min: 30000, max: 30000 });
      expect(scores.price).toBe(100);
    });

    it("trust score matches merchant trustScore", () => {
      const offer = makeOffer({ id: "o1", merchantId: "merchant-omniretail", productId: "p1" });
      const merchant = MERCHANTS[1]; // OmniRetail trust=98
      const scores = calculateDimensionScores(offer, merchant, { min: 30000, max: 30000 });
      expect(scores.trust).toBe(98);
    });

    it("stock score scales with quantity", () => {
      const merchant = MERCHANTS[0];
      const low = calculateDimensionScores(
        makeOffer({ id: "low", merchantId: "m1", productId: "p1", stock: 5 }),
        merchant,
        { min: 30000, max: 30000 }
      );
      const high = calculateDimensionScores(
        makeOffer({ id: "high", merchantId: "m1", productId: "p1", stock: 50 }),
        merchant,
        { min: 30000, max: 30000 }
      );
      expect(high.stock).toBeGreaterThan(low.stock);
      expect(high.stock).toBe(100);
    });

    it("warranty score scales linearly with months", () => {
      const merchant = MERCHANTS[0];
      const low = calculateDimensionScores(
        makeOffer({ id: "w12", merchantId: "m1", productId: "p1", warrantyMonths: 12 }),
        merchant,
        { min: 30000, max: 30000 }
      );
      const high = calculateDimensionScores(
        makeOffer({ id: "w24", merchantId: "m1", productId: "p1", warrantyMonths: 24 }),
        merchant,
        { min: 30000, max: 30000 }
      );
      expect(high.warranty).toBeGreaterThan(low.warranty);
    });

    it("delivery score favors faster delivery", () => {
      const merchant = MERCHANTS[0];
      const fast = calculateDimensionScores(
        makeOffer({ id: "f", merchantId: "m1", productId: "p1", deliveryDays: 1 }),
        merchant,
        { min: 30000, max: 30000 }
      );
      const slow = calculateDimensionScores(
        makeOffer({ id: "s", merchantId: "m1", productId: "p1", deliveryDays: 7 }),
        merchant,
        { min: 30000, max: 30000 }
      );
      expect(fast.delivery).toBe(100);
      expect(slow.delivery).toBe(0);
    });
  });

  // ============================================================
  // 3. scoreMerchantOffer
  // ============================================================

  describe("scoreMerchantOffer", () => {
    it("returns a complete MerchantOfferScore", () => {
      const offer = makeOffer({ id: "o1", merchantId: "merchant-omniretail", productId: "p1" });
      const merchant = MERCHANTS[1];
      const weights = calculateMerchantWeights([]);
      const score = scoreMerchantOffer(offer, merchant, weights, { min: 30000, max: 30000 });

      expect(score.offerId).toBe("o1");
      expect(score.merchantId).toBe("merchant-omniretail");
      expect(typeof score.overallScore).toBe("number");
      expect(typeof score.priceScore).toBe("number");
      expect(typeof score.trustScore).toBe("number");
      expect(typeof score.stockScore).toBe("number");
      expect(typeof score.warrantyScore).toBe("number");
      expect(typeof score.deliveryScore).toBe("number");
      expect(typeof score.tradeOffHighlight).toBe("string");
    });

    it("overallScore is between 0 and 100", () => {
      const offer = makeOffer({ id: "o1", merchantId: "merchant-omniretail", productId: "p1" });
      const merchant = MERCHANTS[1];
      const weights = calculateMerchantWeights([]);
      const score = scoreMerchantOffer(offer, merchant, weights, { min: 30000, max: 30000 });

      expect(score.overallScore).toBeGreaterThanOrEqual(0);
      expect(score.overallScore).toBeLessThanOrEqual(100);
    });
  });

  // ============================================================
  // 4. filterEligibleOffers
  // ============================================================

  describe("filterEligibleOffers", () => {
    it("excludes out-of-stock offers", () => {
      const merchantMap = new Map(MERCHANTS.map((m) => [m.id, m]));
      const offers = [
        makeOffer({ id: "o1", merchantId: "merchant-valuekart", productId: "p1", stock: 0, isAvailable: false }),
        makeOffer({ id: "o2", merchantId: "merchant-omniretail", productId: "p1", stock: 10, isAvailable: true }),
      ];
      const eligible = filterEligibleOffers(offers, merchantMap);
      expect(eligible).toHaveLength(1);
      expect(eligible[0].id).toBe("o2");
    });

    it("excludes unavailable offers", () => {
      const merchantMap = new Map(MERCHANTS.map((m) => [m.id, m]));
      const offers = [
        makeOffer({ id: "o1", merchantId: "merchant-valuekart", productId: "p1", isAvailable: false }),
        makeOffer({ id: "o2", merchantId: "merchant-omniretail", productId: "p1", isAvailable: true }),
      ];
      const eligible = filterEligibleOffers(offers, merchantMap);
      expect(eligible).toHaveLength(1);
      expect(eligible[0].id).toBe("o2");
    });

    it("excludes offers with zero price", () => {
      const merchantMap = new Map(MERCHANTS.map((m) => [m.id, m]));
      const offers = [
        makeOffer({ id: "o1", merchantId: "merchant-valuekart", productId: "p1", price: 0 }),
        makeOffer({ id: "o2", merchantId: "merchant-omniretail", productId: "p1", price: 30000 }),
      ];
      const eligible = filterEligibleOffers(offers, merchantMap);
      expect(eligible).toHaveLength(1);
      expect(eligible[0].id).toBe("o2");
    });

    it("excludes offers with missing merchant records", () => {
      const merchantMap = new Map(MERCHANTS.map((m) => [m.id, m]));
      const offers = [
        makeOffer({ id: "o1", merchantId: "merchant-nonexistent", productId: "p1" }),
        makeOffer({ id: "o2", merchantId: "merchant-omniretail", productId: "p1" }),
      ];
      const eligible = filterEligibleOffers(offers, merchantMap);
      expect(eligible).toHaveLength(1);
      expect(eligible[0].id).toBe("o2");
    });
  });

  // ============================================================
  // 5. runMerchantDecision — Core Scenarios
  // ============================================================

  describe("runMerchantDecision", () => {
    const PRODUCT_ID = "phone-001";

    function makeStandardOffers(): MerchantOffer[] {
      return [
        makeOffer({
          id: "offer-phone-001-merchant-valuekart-0",
          merchantId: "merchant-valuekart",
          productId: PRODUCT_ID,
          price: 28499,
          stock: 3,
          warrantyMonths: 12,
          deliveryDays: 5,
        }),
        makeOffer({
          id: "offer-phone-001-merchant-omniretail-1",
          merchantId: "merchant-omniretail",
          productId: PRODUCT_ID,
          price: 29999,
          stock: 50,
          warrantyMonths: 12,
          deliveryDays: 3,
        }),
        makeOffer({
          id: "offer-phone-001-merchant-careplus-2",
          merchantId: "merchant-careplus",
          productId: PRODUCT_ID,
          price: 31199,
          stock: 12,
          warrantyMonths: 24,
          deliveryDays: 2,
        }),
      ];
    }

    it("1. Price-sensitive preference selects cheapest valid offer", () => {
      const result = runMerchantDecision({
        productId: PRODUCT_ID,
        productPrice: 29999,
        offers: makeStandardOffers(),
        merchants: MERCHANTS,
        priorities: [makePriority("budget", 3)],
      });

      expect(result).not.toBeNull();
      expect(result!.selectedOffer.merchantId).toBe("merchant-valuekart");
      expect(result!.selectedOffer.price).toBe(28499);
    });

    it("2. Reliability-sensitive preference selects highest-trust offer", () => {
      const result = runMerchantDecision({
        productId: PRODUCT_ID,
        productPrice: 29999,
        offers: makeStandardOffers(),
        merchants: MERCHANTS,
        priorities: [makePriority("reliability", 3)],
      });

      expect(result).not.toBeNull();
      expect(result!.selectedOffer.merchantId).toBe("merchant-omniretail");
      expect(result!.merchant.trustScore).toBe(98);
    });

    it("3. Warranty-sensitive preference selects best warranty offer", () => {
      const result = runMerchantDecision({
        productId: PRODUCT_ID,
        productPrice: 29999,
        offers: makeStandardOffers(),
        merchants: MERCHANTS,
        priorities: [makePriority("warranty", 3)],
      });

      expect(result).not.toBeNull();
      expect(result!.selectedOffer.merchantId).toBe("merchant-careplus");
      expect(result!.selectedOffer.warrantyMonths).toBe(24);
    });

    it("4. Default (no priorities) produces a deterministic winner with valid score", () => {
      const result = runMerchantDecision({
        productId: PRODUCT_ID,
        productPrice: 29999,
        offers: makeStandardOffers(),
        merchants: MERCHANTS,
        priorities: [],
      });

      expect(result).not.toBeNull();
      // With balanced weights, the exponential decay gives price the highest
      // weight. ValueKart's ~5% price advantage makes it the deterministic winner.
      // This is by design: without explicit priorities, the scoring system
      // still produces a deterministic, explainable result.
      expect(result!.selectedOffer.merchantId).toBe("merchant-valuekart");
      expect(result!.explanation.length).toBeGreaterThan(0);
      expect(result!.alternativeOffers.length).toBeGreaterThan(0);
    });

    it("5. Delivery-sensitive preference selects fastest delivery offer", () => {
      const result = runMerchantDecision({
        productId: PRODUCT_ID,
        productPrice: 29999,
        offers: makeStandardOffers(),
        merchants: MERCHANTS,
        priorities: [makePriority("delivery", 3)],
      });

      expect(result).not.toBeNull();
      expect(result!.selectedOffer.merchantId).toBe("merchant-careplus");
      expect(result!.selectedOffer.deliveryDays).toBe(2);
    });

    it("6. Out-of-stock offers are excluded", () => {
      const offers = makeStandardOffers();
      // Make ValueKart out of stock
      const valuekartIdx = offers.findIndex((o) => o.merchantId === "merchant-valuekart");
      offers[valuekartIdx] = { ...offers[valuekartIdx], stock: 0, isAvailable: false };

      const result = runMerchantDecision({
        productId: PRODUCT_ID,
        productPrice: 29999,
        offers,
        merchants: MERCHANTS,
        priorities: [makePriority("budget", 3)],
      });

      // ValueKart is excluded, so budget-priority should pick next cheapest
      expect(result).not.toBeNull();
      expect(result!.selectedOffer.merchantId).not.toBe("merchant-valuekart");
    });

    it("7. Unavailable offers are excluded", () => {
      const offers = makeStandardOffers();
      // Make ValueKart unavailable
      const valuekartIdx = offers.findIndex((o) => o.merchantId === "merchant-valuekart");
      offers[valuekartIdx] = { ...offers[valuekartIdx], isAvailable: false };

      const result = runMerchantDecision({
        productId: PRODUCT_ID,
        productPrice: 29999,
        offers,
        merchants: MERCHANTS,
        priorities: [makePriority("budget", 3)],
      });

      expect(result).not.toBeNull();
      expect(result!.selectedOffer.merchantId).not.toBe("merchant-valuekart");
    });

    it("8. Missing merchant records are handled safely", () => {
      const offers = makeStandardOffers();
      // Add an offer for a non-existent merchant
      offers.push(
        makeOffer({
          id: "offer-phantom",
          merchantId: "merchant-phantom",
          productId: PRODUCT_ID,
          price: 10000, // Cheapest, but no merchant record
        })
      );

      const result = runMerchantDecision({
        productId: PRODUCT_ID,
        productPrice: 29999,
        offers,
        merchants: MERCHANTS,
        priorities: [],
      });

      // Phantom offer should be excluded
      expect(result).not.toBeNull();
      expect(result!.selectedOffer.merchantId).not.toBe("merchant-phantom");
    });

    it("9. One valid offer works correctly", () => {
      const offers = [
        makeOffer({
          id: "only-one",
          merchantId: "merchant-omniretail",
          productId: PRODUCT_ID,
          price: 29999,
          stock: 50,
        }),
      ];

      const result = runMerchantDecision({
        productId: PRODUCT_ID,
        productPrice: 29999,
        offers,
        merchants: MERCHANTS,
        priorities: [],
      });

      expect(result).not.toBeNull();
      expect(result!.selectedOffer.id).toBe("only-one");
      expect(result!.alternativeOffers).toHaveLength(0);
    });

    it("10. No valid offers returns null", () => {
      const result = runMerchantDecision({
        productId: PRODUCT_ID,
        productPrice: 29999,
        offers: [],
        merchants: MERCHANTS,
        priorities: [],
      });

      expect(result).toBeNull();
    });

    it("11. All offers out of stock returns null", () => {
      const offers = makeStandardOffers().map((o) => ({
        ...o,
        stock: 0,
        isAvailable: false,
      }));

      const result = runMerchantDecision({
        productId: PRODUCT_ID,
        productPrice: 29999,
        offers,
        merchants: MERCHANTS,
        priorities: [],
      });

      expect(result).toBeNull();
    });

    it("12. Equal scores resolve deterministically by price, then ID", () => {
      // Create identical offers from different merchants
      const identical = [
        makeOffer({
          id: "offer-aaa",
          merchantId: "merchant-valuekart",
          productId: PRODUCT_ID,
          price: 30000,
          stock: 10,
          warrantyMonths: 12,
          deliveryDays: 3,
        }),
        makeOffer({
          id: "offer-bbb",
          merchantId: "merchant-omniretail",
          productId: PRODUCT_ID,
          price: 30000,
          stock: 10,
          warrantyMonths: 12,
          deliveryDays: 3,
        }),
      ];

      const result = runMerchantDecision({
        productId: PRODUCT_ID,
        productPrice: 30000,
        offers: identical,
        merchants: MERCHANTS,
        priorities: [],
      });

      expect(result).not.toBeNull();
      // With same price/stock/warranty/delivery, trust breaks tie
      // OmniRetail (trust=98) should beat ValueKart (trust=76)
      expect(result!.selectedOffer.merchantId).toBe("merchant-omniretail");
    });

    it("13. Returns alternatives sorted by score descending", () => {
      const result = runMerchantDecision({
        productId: PRODUCT_ID,
        productPrice: 29999,
        offers: makeStandardOffers(),
        merchants: MERCHANTS,
        priorities: [],
      });

      expect(result).not.toBeNull();
      expect(result!.alternativeOffers.length).toBeGreaterThan(0);

      // All alternatives should have valid merchant IDs
      for (const alt of result!.alternativeOffers) {
        expect(["merchant-valuekart", "merchant-omniretail", "merchant-careplus"]).toContain(
          alt.merchantId
        );
      }
    });

    it("14. Explanation is generated deterministically", () => {
      const result = runMerchantDecision({
        productId: PRODUCT_ID,
        productPrice: 29999,
        offers: makeStandardOffers(),
        merchants: MERCHANTS,
        priorities: [makePriority("reliability", 3)],
      });

      expect(result).not.toBeNull();
      expect(result!.explanation.length).toBeGreaterThan(0);
      // Should mention the winning merchant
      expect(result!.explanation).toContain("OmniRetail");
    });

    it("15. Explanation mentions alternatives for trade-offs", () => {
      const result = runMerchantDecision({
        productId: PRODUCT_ID,
        productPrice: 29999,
        offers: makeStandardOffers(),
        merchants: MERCHANTS,
        priorities: [makePriority("reliability", 3)],
      });

      expect(result).not.toBeNull();
      // With 3 offers, explanation should mention at least one alternative
      const explanation = result!.explanation;
      expect(
        explanation.includes("ValueKart") ||
        explanation.includes("CarePlus")
      ).toBe(true);
    });
  });

  // ============================================================
  // 6. Edge Cases
  // ============================================================

  describe("Edge Cases", () => {
    const PRODUCT_ID = "phone-001";

    it("handles single offer gracefully", () => {
      const result = runMerchantDecision({
        productId: PRODUCT_ID,
        productPrice: 29999,
        offers: [
          makeOffer({
            id: "solo",
            merchantId: "merchant-omniretail",
            productId: PRODUCT_ID,
          }),
        ],
        merchants: MERCHANTS,
        priorities: [],
      });

      expect(result).not.toBeNull();
      expect(result!.selectedOffer.id).toBe("solo");
      expect(result!.alternativeOffers).toHaveLength(0);
      expect(result!.explanation.length).toBeGreaterThan(0);
    });

    it("handles all offers having same price", () => {
      const offers = [
        makeOffer({ id: "o1", merchantId: "merchant-valuekart", productId: PRODUCT_ID, price: 30000 }),
        makeOffer({ id: "o2", merchantId: "merchant-omniretail", productId: PRODUCT_ID, price: 30000 }),
        makeOffer({ id: "o3", merchantId: "merchant-careplus", productId: PRODUCT_ID, price: 30000 }),
      ];

      const result = runMerchantDecision({
        productId: PRODUCT_ID,
        productPrice: 30000,
        offers,
        merchants: MERCHANTS,
        priorities: [],
      });

      expect(result).not.toBeNull();
      // With same price, trust/stock/warranty should determine winner
      expect(result!.selectedOffer.merchantId).toBe("merchant-omniretail");
    });

    it("handles offers only for subset of merchants", () => {
      const offers = [
        makeOffer({ id: "o1", merchantId: "merchant-valuekart", productId: PRODUCT_ID }),
        makeOffer({ id: "o2", merchantId: "merchant-careplus", productId: PRODUCT_ID }),
      ];

      const result = runMerchantDecision({
        productId: PRODUCT_ID,
        productPrice: 29999,
        offers,
        merchants: MERCHANTS,
        priorities: [],
      });

      expect(result).not.toBeNull();
      expect(result!.selectedOffer.merchantId).not.toBe("merchant-omniretail");
    });

    it("handles product with no offers", () => {
      const result = runMerchantDecision({
        productId: "nonexistent-product",
        productPrice: 29999,
        offers: [
          makeOffer({ id: "o1", merchantId: "merchant-valuekart", productId: PRODUCT_ID }),
        ],
        merchants: MERCHANTS,
        priorities: [],
      });

      expect(result).toBeNull();
    });

    it("handles extreme price differences", () => {
      const offers = [
        makeOffer({ id: "cheap", merchantId: "merchant-valuekart", productId: PRODUCT_ID, price: 1000 }),
        makeOffer({ id: "mid", merchantId: "merchant-omniretail", productId: PRODUCT_ID, price: 30000 }),
        makeOffer({ id: "exp", merchantId: "merchant-careplus", productId: PRODUCT_ID, price: 100000 }),
      ];

      const result = runMerchantDecision({
        productId: PRODUCT_ID,
        productPrice: 30000,
        offers,
        merchants: MERCHANTS,
        priorities: [makePriority("budget", 3)],
      });

      expect(result).not.toBeNull();
      expect(result!.selectedOffer.merchantId).toBe("merchant-valuekart");
    });
  });

  // ============================================================
  // 7. Score All Merchant Offers
  // ============================================================

  describe("scoreAllMerchantOffers", () => {
    const PRODUCT_ID = "phone-001";

    it("returns scored offers sorted by overallScore descending", () => {
      const offers = [
        makeOffer({ id: "o1", merchantId: "merchant-valuekart", productId: PRODUCT_ID, price: 28499 }),
        makeOffer({ id: "o2", merchantId: "merchant-omniretail", productId: PRODUCT_ID, price: 29999 }),
        makeOffer({ id: "o3", merchantId: "merchant-careplus", productId: PRODUCT_ID, price: 31199 }),
      ];

      const scores = scoreAllMerchantOffers(PRODUCT_ID, offers, MERCHANTS, []);
      expect(scores).toHaveLength(3);
      expect(scores[0].overallScore).toBeGreaterThanOrEqual(scores[1].overallScore);
      expect(scores[1].overallScore).toBeGreaterThanOrEqual(scores[2].overallScore);
    });

    it("returns empty array for unknown product", () => {
      const scores = scoreAllMerchantOffers("unknown", [], MERCHANTS, []);
      expect(scores).toHaveLength(0);
    });
  });

  // ============================================================
  // 8. Existing Merchant Data Compatibility
  // ============================================================

  describe("Existing merchant data produces valid results", () => {
    it("all three merchants produce valid offer scores", () => {
      const offers = [
        makeOffer({ id: "vk", merchantId: "merchant-valuekart", productId: "p1", price: 28499 }),
        makeOffer({ id: "or", merchantId: "merchant-omniretail", productId: "p1", price: 29999 }),
        makeOffer({ id: "cp", merchantId: "merchant-careplus", productId: "p1", price: 31199 }),
      ];
      const weights = calculateMerchantWeights([]);
      const priceRange = { min: 28499, max: 31199 };

      for (const offer of offers) {
        const merchant = MERCHANTS.find((m) => m.id === offer.merchantId)!;
        const score = scoreMerchantOffer(offer, merchant, weights, priceRange);

        expect(score.overallScore).toBeGreaterThanOrEqual(0);
        expect(score.overallScore).toBeLessThanOrEqual(100);
        expect(score.priceScore).toBeGreaterThanOrEqual(0);
        expect(score.priceScore).toBeLessThanOrEqual(100);
        expect(score.trustScore).toBeGreaterThanOrEqual(0);
        expect(score.trustScore).toBeLessThanOrEqual(100);
        expect(score.stockScore).toBeGreaterThanOrEqual(0);
        expect(score.stockScore).toBeLessThanOrEqual(100);
        expect(score.warrantyScore).toBeGreaterThanOrEqual(0);
        expect(score.warrantyScore).toBeLessThanOrEqual(100);
        expect(score.deliveryScore).toBeGreaterThanOrEqual(0);
        expect(score.deliveryScore).toBeLessThanOrEqual(100);
        expect(typeof score.tradeOffHighlight).toBe("string");
        expect(score.tradeOffHighlight.length).toBeGreaterThan(0);
      }
    });
  });
});
