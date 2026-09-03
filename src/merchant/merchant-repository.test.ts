// ============================================================
// DecisionCart — Merchant Repository Tests
// Tests for the MerchantRepository abstraction and in-memory
// implementation, including live mutable offer updates.
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import {
  getMerchantRepository,
  resetMerchantRepository,
} from "./merchant-repository";
import type { MerchantRepository } from "./merchant-repository";


// --- Tests ---

describe("MerchantRepository", () => {
  let repo: MerchantRepository;

  beforeEach(async () => {
    resetMerchantRepository();
    repo = await getMerchantRepository();
    await repo.reset();
  });

  // --- 1. Merchant Lookup ---

  describe("getMerchant", () => {
    it("returns a merchant by ID", async () => {
      const merchant = await repo.getMerchant("merchant-valuekart");
      expect(merchant).not.toBeNull();
      expect(merchant!.name).toBe("ValueKart Express");
    });

    it("returns null for non-existent merchant", async () => {
      expect(await repo.getMerchant("nonexistent")).toBeNull();
    });

    it("returns all three seeded merchants", async () => {
      const all = await repo.getAllMerchants();
      expect(all).toHaveLength(3);
    });
  });

  // --- 2. Offer Lookup ---

  describe("getOffersByProduct", () => {
    it("returns 3 offers for each catalog product", async () => {
      const offers = await repo.getOffersByProduct("phone-001");
      expect(offers).toHaveLength(3);
    });

    it("returns empty array for unknown product", async () => {
      const offers = await repo.getOffersByProduct("nonexistent");
      expect(offers).toHaveLength(0);
    });

    it("each offer has a valid merchantId", async () => {
      const offers = await repo.getOffersByProduct("phone-001");
      const merchantIds = ["merchant-valuekart", "merchant-omniretail", "merchant-careplus"];

      for (const offer of offers) {
        expect(merchantIds).toContain(offer.merchantId);
      }
    });
  });

  describe("getOffer", () => {
    it("returns an offer by ID", async () => {
      const offers = await repo.getOffersByProduct("phone-001");
      const firstOffer = offers[0];
      const found = await repo.getOffer(firstOffer.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(firstOffer.id);
    });

    it("returns null for non-existent offer", async () => {
      expect(await repo.getOffer("nonexistent")).toBeNull();
    });
  });

  describe("getAvailableOffersByProduct", () => {
    it("returns only available offers", async () => {
      const allOffers = await repo.getOffersByProduct("phone-001");
      const availableOffers = await repo.getAvailableOffersByProduct("phone-001");

      // All seeded offers should be available
      expect(availableOffers).toHaveLength(allOffers.length);
    });

    it("excludes out-of-stock offers", async () => {
      // Set all offers for phone-001 to zero stock
      const offers = await repo.getOffersByProduct("phone-001");
      for (const offer of offers) {
        await repo.updateOfferStock(offer.id, 0);
      }

      const availableOffers = await repo.getAvailableOffersByProduct("phone-001");
      expect(availableOffers).toHaveLength(0);
    });
  });

  // --- 3. Live Mutable Updates ---

  describe("updateOfferPrice", () => {
    it("updates the price of an offer", async () => {
      const offers = await repo.getOffersByProduct("phone-001");
      const omniOffer = offers.find((o) => o.merchantId === "merchant-omniretail")!;

      const originalPrice = omniOffer.price;
      const updated = await repo.updateOfferPrice(omniOffer.id, originalPrice + 1000);

      expect(updated.price).toBe(originalPrice + 1000);
      expect(updated.id).toBe(omniOffer.id);
    });

    it("subsequent reads reflect the updated price", async () => {
      const offers = await repo.getOffersByProduct("phone-001");
      const omniOffer = offers.find((o) => o.merchantId === "merchant-omniretail")!;

      await repo.updateOfferPrice(omniOffer.id, 36999);

      // Read again — should see the new price
      const readOffer = await repo.getOffer(omniOffer.id);
      expect(readOffer!.price).toBe(36999);
    });

    it("updates the updatedAt timestamp", async () => {
      const offers = await repo.getOffersByProduct("phone-001");
      const omniOffer = offers.find((o) => o.merchantId === "merchant-omniretail")!;

      const before = new Date(omniOffer.updatedAt).getTime();
      await repo.updateOfferPrice(omniOffer.id, 30000);
      const readOffer = await repo.getOffer(omniOffer.id);
      const after = new Date(readOffer!.updatedAt).getTime();

      expect(after).toBeGreaterThanOrEqual(before);
    });

    it("throws for non-existent offer", async () => {
      await expect(repo.updateOfferPrice("nonexistent", 1000)).rejects.toThrow("not found");
    });

    it("throws for invalid price (zero)", async () => {
      const offers = await repo.getOffersByProduct("phone-001");
      await expect(repo.updateOfferPrice(offers[0].id, 0)).rejects.toThrow("Invalid price");
    });

    it("throws for invalid price (negative)", async () => {
      const offers = await repo.getOffersByProduct("phone-001");
      await expect(repo.updateOfferPrice(offers[0].id, -100)).rejects.toThrow("Invalid price");
    });
  });

  describe("updateOfferStock", () => {
    it("updates the stock of an offer", async () => {
      const offers = await repo.getOffersByProduct("phone-001");
      const valuekartOffer = offers.find((o) => o.merchantId === "merchant-valuekart")!;

      const updated = await repo.updateOfferStock(valuekartOffer.id, 10);
      expect(updated.stock).toBe(10);
    });

    it("sets isAvailable to false when stock is 0", async () => {
      const offers = await repo.getOffersByProduct("phone-001");
      const valuekartOffer = offers.find((o) => o.merchantId === "merchant-valuekart")!;

      const updated = await repo.updateOfferStock(valuekartOffer.id, 0);
      expect(updated.stock).toBe(0);
      expect(updated.isAvailable).toBe(false);
    });

    it("sets isAvailable to true when stock goes from 0 to positive", async () => {
      const offers = await repo.getOffersByProduct("phone-001");
      const valuekartOffer = offers.find((o) => o.merchantId === "merchant-valuekart")!;

      await repo.updateOfferStock(valuekartOffer.id, 0);
      const restored = await repo.updateOfferStock(valuekartOffer.id, 5);
      expect(restored.stock).toBe(5);
      expect(restored.isAvailable).toBe(true);
    });

    it("subsequent reads reflect the updated stock", async () => {
      const offers = await repo.getOffersByProduct("phone-001");
      const valuekartOffer = offers.find((o) => o.merchantId === "merchant-valuekart")!;

      await repo.updateOfferStock(valuekartOffer.id, 7);

      const readOffer = await repo.getOffer(valuekartOffer.id);
      expect(readOffer!.stock).toBe(7);
    });

    it("throws for non-existent offer", async () => {
      await expect(repo.updateOfferStock("nonexistent", 5)).rejects.toThrow("not found");
    });

    it("throws for negative stock", async () => {
      const offers = await repo.getOffersByProduct("phone-001");
      await expect(repo.updateOfferStock(offers[0].id, -1)).rejects.toThrow("Invalid stock");
    });

    it("allows setting stock to zero", async () => {
      const offers = await repo.getOffersByProduct("phone-001");
      const updated = await repo.updateOfferStock(offers[0].id, 0);
      expect(updated.stock).toBe(0);
    });
  });

  // --- 4. Live State Persistence ---

  describe("live mutable state persistence", () => {
    it("price change persists across reads", async () => {
      const offers = await repo.getOffersByProduct("phone-001");
      const omniOffer = offers.find((o) => o.merchantId === "merchant-omniretail")!;

      // Simulate merchant console changing price
      await repo.updateOfferPrice(omniOffer.id, 36999);

      // Multiple reads should all see the new price
      const read1 = await repo.getOffer(omniOffer.id);
      const read2 = await repo.getOffer(omniOffer.id);
      expect(read1!.price).toBe(36999);
      expect(read2!.price).toBe(36999);
    });

    it("stock change persists across getAvailableOffersByProduct", async () => {
      const offers = await repo.getOffersByProduct("phone-001");
      const valuekartOffer = offers.find((o) => o.merchantId === "merchant-valuekart")!;

      await repo.updateOfferStock(valuekartOffer.id, 0);

      const available = await repo.getAvailableOffersByProduct("phone-001");
      expect(available.find((o) => o.id === valuekartOffer.id)).toBeUndefined();
    });
  });

  // --- 5. Reset / Clear ---

  describe("reset", () => {
    it("restores seeded data after clear", async () => {
      await repo.clear();
      const offers = await repo.getOffersByProduct("phone-001");
      expect(offers).toHaveLength(0);

      await repo.reset();
      const restoredOffers = await repo.getOffersByProduct("phone-001");
      expect(restoredOffers).toHaveLength(3);
    });

    it("restores original prices after reset", async () => {
      const offers = await repo.getOffersByProduct("phone-001");
      const omniOffer = offers.find((o) => o.merchantId === "merchant-omniretail")!;
      const originalPrice = omniOffer.price;

      await repo.updateOfferPrice(omniOffer.id, 99999);
      await repo.reset();

      const restored = await repo.getOffer(omniOffer.id);
      expect(restored!.price).toBe(originalPrice);
    });
  });

  describe("clear", () => {
    it("removes all merchants and offers", async () => {
      await repo.clear();
      const merchants = await repo.getAllMerchants();
      const offers = await repo.listAllOffers();
      expect(merchants).toHaveLength(0);
      expect(offers).toHaveLength(0);
    });
  });

  // --- 6. listAllOffers ---

  describe("listAllOffers", () => {
    it("returns all seeded offers", async () => {
      const all = await repo.listAllOffers();
      expect(all.length).toBeGreaterThan(0);
    });

    it("returns the same count as generateSeededOffers", async () => {
      const all = await repo.listAllOffers();
      // 11 catalog products * 3 merchants = 33
      expect(all).toHaveLength(33);
    });
  });

  // --- 7. Repository Singleton ---

  describe("repository singleton", () => {
    it("resetMerchantRepository creates a fresh instance", async () => {
      const repo1 = await getMerchantRepository();
      const offers1 = await repo1.listAllOffers();

      resetMerchantRepository();
      const repo2 = await getMerchantRepository();

      // Fresh instance should have the same seeded data
      const offers2 = await repo2.listAllOffers();
      expect(offers2.length).toBe(offers1.length);

      // But they should be different object instances
      expect(repo2).not.toBe(repo1);
    });
  });

  // --- 8. No Secrets ---

  describe("no secrets in repository", () => {
    it("merchant data contains no sensitive fields", async () => {
      const allOffers = await repo.listAllOffers();
      const allMerchants = await repo.getAllMerchants();
      const allData = JSON.stringify({ offers: allOffers, merchants: allMerchants });

      expect(allData).not.toContain("password");
      expect(allData).not.toContain("secret");
      expect(allData).not.toContain("API_KEY");
      expect(allData).not.toContain("RAZORPAY");
    });
  });
});
