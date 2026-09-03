// ============================================================
// DecisionCart — Demo Merchant Tests
// Tests for seeded merchant data and lookup helpers.
// ============================================================

import { describe, it, expect } from "vitest";
import { MERCHANTS, getMerchantById, getAllMerchants } from "./merchants";

// --- Tests ---

describe("Demo Merchants", () => {
  describe("MERCHANTS constant", () => {
    it("contains exactly 3 merchants", () => {
      expect(MERCHANTS).toHaveLength(3);
    });

    it("each merchant has a unique ID", () => {
      const ids = MERCHANTS.map((m) => m.id);
      expect(new Set(ids).size).toBe(3);
    });

    it("each merchant has required fields", () => {
      for (const merchant of MERCHANTS) {
        expect(typeof merchant.id).toBe("string");
        expect(typeof merchant.name).toBe("string");
        expect(typeof merchant.trustScore).toBe("number");
        expect(typeof merchant.verified).toBe("boolean");
        expect(typeof merchant.ratingCount).toBe("number");
        expect(typeof merchant.returnPolicyDays).toBe("number");
        expect(["standard", "fast", "priority"]).toContain(merchant.fulfillmentSpeed);
      }
    });

    it("all trust scores are in 0–100 range", () => {
      for (const merchant of MERCHANTS) {
        expect(merchant.trustScore).toBeGreaterThanOrEqual(0);
        expect(merchant.trustScore).toBeLessThanOrEqual(100);
      }
    });

    it("all return policy days are positive", () => {
      for (const merchant of MERCHANTS) {
        expect(merchant.returnPolicyDays).toBeGreaterThan(0);
      }
    });
  });

  describe("ValueKart Express", () => {
    it("has the lowest trust score of the three", () => {
      const valuekart = MERCHANTS.find((m) => m.id === "merchant-valuekart");
      expect(valuekart).toBeDefined();
      expect(valuekart!.trustScore).toBe(76);
      expect(valuekart!.verified).toBe(false);
      expect(valuekart!.fulfillmentSpeed).toBe("standard");
    });
  });

  describe("OmniRetail Direct", () => {
    it("has the highest trust score", () => {
      const omni = MERCHANTS.find((m) => m.id === "merchant-omniretail");
      expect(omni).toBeDefined();
      expect(omni!.trustScore).toBe(98);
      expect(omni!.verified).toBe(true);
      expect(omni!.fulfillmentSpeed).toBe("fast");
    });
  });

  describe("CarePlus Premium", () => {
    it("has extended warranty and priority delivery", () => {
      const careplus = MERCHANTS.find((m) => m.id === "merchant-careplus");
      expect(careplus).toBeDefined();
      expect(careplus!.trustScore).toBe(90);
      expect(careplus!.verified).toBe(true);
      expect(careplus!.fulfillmentSpeed).toBe("priority");
      expect(careplus!.returnPolicyDays).toBe(30);
    });
  });

  describe("getMerchantById", () => {
    it("returns the merchant for a valid ID", () => {
      const merchant = getMerchantById("merchant-valuekart");
      expect(merchant).toBeDefined();
      expect(merchant!.name).toBe("ValueKart Express");
    });

    it("returns undefined for an unknown ID", () => {
      expect(getMerchantById("nonexistent")).toBeUndefined();
    });
  });

  describe("getAllMerchants", () => {
    it("returns all merchants", () => {
      const all = getAllMerchants();
      expect(all).toHaveLength(3);
    });

    it("returns a copy, not the original array", () => {
      const all = getAllMerchants();
      all.pop();
      expect(getAllMerchants()).toHaveLength(3);
    });
  });
});
