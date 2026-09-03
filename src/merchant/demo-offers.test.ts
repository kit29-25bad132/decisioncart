// ============================================================
// DecisionCart — Demo Merchant Offers Tests
// Tests for seeded offer generation from catalog products.
// ============================================================

import { describe, it, expect } from "vitest";
import { generateSeededOffers, getSeededOffersForProduct } from "./demo-offers";
import { DEMO_SMARTPHONES, DEMO_LAPTOPS } from "@/catalog/demo-data";

// --- Tests ---

describe("Demo Merchant Offers", () => {
  describe("generateSeededOffers", () => {
    it("generates offers for all catalog products", () => {
      const offers = generateSeededOffers();
      const totalProducts = DEMO_SMARTPHONES.length + DEMO_LAPTOPS.length;
      // Each product gets 3 merchant offers
      expect(offers).toHaveLength(totalProducts * 3);
    });

    it("each offer has required fields", () => {
      const offers = generateSeededOffers();
      for (const offer of offers) {
        expect(typeof offer.id).toBe("string");
        expect(typeof offer.merchantId).toBe("string");
        expect(typeof offer.productId).toBe("string");
        expect(typeof offer.price).toBe("number");
        expect(offer.price).toBeGreaterThan(0);
        expect(offer.currency).toBe("INR");
        expect(typeof offer.stock).toBe("number");
        expect(offer.stock).toBeGreaterThanOrEqual(0);
        expect(typeof offer.warrantyMonths).toBe("number");
        expect(typeof offer.deliveryDays).toBe("number");
        expect(typeof offer.updatedAt).toBe("string");
        expect(typeof offer.isAvailable).toBe("boolean");
      }
    });

    it("every catalog product has offers from all 3 merchants", () => {
      const offers = generateSeededOffers();
      const allProducts = [...DEMO_SMARTPHONES, ...DEMO_LAPTOPS];

      for (const product of allProducts) {
        const productOffers = offers.filter((o) => o.productId === product.id);
        expect(productOffers).toHaveLength(3);

        const merchantIds = productOffers.map((o) => o.merchantId).sort();
        expect(merchantIds).toEqual([
          "merchant-careplus",
          "merchant-omniretail",
          "merchant-valuekart",
        ]);
      }
    });
  });

  describe("Pricing rules", () => {
    it("ValueKart has lowest price (~5% below catalog)", () => {
      const offers = generateSeededOffers();

      for (const product of DEMO_SMARTPHONES) {
        const valuekartOffer = offers.find(
          (o) => o.productId === product.id && o.merchantId === "merchant-valuekart"
        );
        expect(valuekartOffer).toBeDefined();
        expect(valuekartOffer!.price).toBeLessThan(product.price);
        // Should be roughly 5% below
        const discount = (product.price - valuekartOffer!.price) / product.price;
        expect(discount).toBeGreaterThan(0.03);
        expect(discount).toBeLessThan(0.07);
      }
    });

    it("OmniRetail matches catalog price exactly", () => {
      const offers = generateSeededOffers();

      for (const product of DEMO_SMARTPHONES) {
        const omniOffer = offers.find(
          (o) => o.productId === product.id && o.merchantId === "merchant-omniretail"
        );
        expect(omniOffer).toBeDefined();
        expect(omniOffer!.price).toBe(product.price);
      }
    });

    it("CarePlus has highest price (~4% above catalog)", () => {
      const offers = generateSeededOffers();

      for (const product of DEMO_SMARTPHONES) {
        const careplusOffer = offers.find(
          (o) => o.productId === product.id && o.merchantId === "merchant-careplus"
        );
        expect(careplusOffer).toBeDefined();
        expect(careplusOffer!.price).toBeGreaterThan(product.price);
        // Should be roughly 4% above
        const premium = (careplusOffer!.price - product.price) / product.price;
        expect(premium).toBeGreaterThan(0.02);
        expect(premium).toBeLessThan(0.06);
      }
    });

    it("ValueKart is always cheapest for every product", () => {
      const offers = generateSeededOffers();
      const allProducts = [...DEMO_SMARTPHONES, ...DEMO_LAPTOPS];

      for (const product of allProducts) {
        const productOffers = offers.filter((o) => o.productId === product.id);
        const prices = productOffers.map((o) => o.price);
        const minPrice = Math.min(...prices);
        const valuekartOffer = productOffers.find(
          (o) => o.merchantId === "merchant-valuekart"
        );
        expect(valuekartOffer!.price).toBe(minPrice);
      }
    });

    it("CarePlus is always most expensive for every product", () => {
      const offers = generateSeededOffers();
      const allProducts = [...DEMO_SMARTPHONES, ...DEMO_LAPTOPS];

      for (const product of allProducts) {
        const productOffers = offers.filter((o) => o.productId === product.id);
        const prices = productOffers.map((o) => o.price);
        const maxPrice = Math.max(...prices);
        const careplusOffer = productOffers.find(
          (o) => o.merchantId === "merchant-careplus"
        );
        expect(careplusOffer!.price).toBe(maxPrice);
      }
    });
  });

  describe("Stock rules", () => {
    it("ValueKart has low stock (2-3 units)", () => {
      const offers = generateSeededOffers();
      const valuekartOffers = offers.filter((o) => o.merchantId === "merchant-valuekart");

      for (const offer of valuekartOffers) {
        expect(offer.stock).toBeGreaterThanOrEqual(2);
        expect(offer.stock).toBeLessThanOrEqual(3);
      }
    });

    it("OmniRetail has high stock (~50 units)", () => {
      const offers = generateSeededOffers();
      const omniOffers = offers.filter((o) => o.merchantId === "merchant-omniretail");

      for (const offer of omniOffers) {
        expect(offer.stock).toBe(50);
      }
    });

    it("CarePlus has moderate stock (~12 units)", () => {
      const offers = generateSeededOffers();
      const careplusOffers = offers.filter((o) => o.merchantId === "merchant-careplus");

      for (const offer of careplusOffers) {
        expect(offer.stock).toBe(12);
      }
    });
  });

  describe("Warranty and delivery rules", () => {
    it("CarePlus has 24-month warranty (double the others)", () => {
      const offers = generateSeededOffers();
      const careplusOffers = offers.filter((o) => o.merchantId === "merchant-careplus");

      for (const offer of careplusOffers) {
        expect(offer.warrantyMonths).toBe(24);
      }
    });

    it("OmniRetail and ValueKart have 12-month warranty", () => {
      const offers = generateSeededOffers();
      const standardOffers = offers.filter(
        (o) =>
          o.merchantId === "merchant-omniretail" ||
          o.merchantId === "merchant-valuekart"
      );

      for (const offer of standardOffers) {
        expect(offer.warrantyMonths).toBe(12);
      }
    });

    it("CarePlus has fastest delivery (2 days)", () => {
      const offers = generateSeededOffers();
      const careplusOffers = offers.filter((o) => o.merchantId === "merchant-careplus");

      for (const offer of careplusOffers) {
        expect(offer.deliveryDays).toBe(2);
      }
    });

    it("OmniRetail has fast delivery (3 days)", () => {
      const offers = generateSeededOffers();
      const omniOffers = offers.filter((o) => o.merchantId === "merchant-omniretail");

      for (const offer of omniOffers) {
        expect(offer.deliveryDays).toBe(3);
      }
    });

    it("ValueKart has standard delivery (5 days)", () => {
      const offers = generateSeededOffers();
      const valuekartOffers = offers.filter((o) => o.merchantId === "merchant-valuekart");

      for (const offer of valuekartOffers) {
        expect(offer.deliveryDays).toBe(5);
      }
    });
  });

  describe("isAvailable flag", () => {
    it("all offers are available (stock > 0 for all seeded merchants)", () => {
      const offers = generateSeededOffers();
      const allAvailable = offers.every((o) => o.isAvailable);
      expect(allAvailable).toBe(true);
    });
  });

  describe("getSeededOffersForProduct", () => {
    it("returns offers for a known product", () => {
      const phone1Offers = getSeededOffersForProduct("phone-001");
      expect(phone1Offers).toHaveLength(3);
    });

    it("returns empty array for unknown product", () => {
      const unknownOffers = getSeededOffersForProduct("nonexistent");
      expect(unknownOffers).toHaveLength(0);
    });
  });

  describe("Offer ID format", () => {
    it("offer IDs follow the pattern offer-{productId}-{merchantId}-{index}", () => {
      const offers = generateSeededOffers();
      for (const offer of offers) {
        expect(offer.id).toMatch(
          /^offer-[a-z0-9-]+-[a-z0-9-]+-\d+$/
        );
      }
    });

    it("each offer ID is unique", () => {
      const offers = generateSeededOffers();
      const ids = offers.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
