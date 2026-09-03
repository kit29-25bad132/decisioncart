// ============================================================
// DecisionCart — Demo Merchant Data
// Seeded merchant profiles for the merchant intelligence layer.
// NOT live marketplace data. Clearly modeled as demo/fixture data.
// ============================================================

import type { Merchant } from "@/types";

// --- Seeded Merchants ---

export const MERCHANTS: Merchant[] = [
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

// --- Lookup Helpers ---

const MERCHANT_MAP = new Map<string, Merchant>(
  MERCHANTS.map((m) => [m.id, m])
);

/**
 * Get a merchant by ID.
 * Returns undefined if no merchant exists with that ID.
 */
export function getMerchantById(merchantId: string): Merchant | undefined {
  return MERCHANT_MAP.get(merchantId);
}

/**
 * Get all seeded merchants.
 */
export function getAllMerchants(): Merchant[] {
  return [...MERCHANTS];
}
