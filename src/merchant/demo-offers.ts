// ============================================================
// DecisionCart — Demo Merchant Offers
// Seeded offers generated from existing catalog products.
// Each catalog product gets offers from all three merchants.
// NOT live marketplace data. Clearly modeled as demo/fixture data.
//
// Pricing rules:
//   - ValueKart Express:  ~5% below catalog price (lowest)
//   - OmniRetail Direct:  catalog price (standard)
//   - CarePlus Premium:   ~4% above catalog price (value-add)
// ============================================================

import type { MerchantOffer } from "@/types";
import { DEMO_SMARTPHONES, DEMO_LAPTOPS } from "@/catalog/demo-data";

// --- Pricing Configuration ---

const VALUEKART_DISCOUNT_PCT = 0.05;
const CAREPLUS_PREMIUM_PCT = 0.04;

// --- Default Fulfillment Parameters ---

interface MerchantDefaults {
  warrantyMonths: number;
  deliveryDays: number;
  stockRange: { min: number; max: number };
}

const MERCHANT_DEFAULTS: Record<string, MerchantDefaults> = {
  "merchant-valuekart": {
    warrantyMonths: 12,
    deliveryDays: 5,
    stockRange: { min: 2, max: 3 },
  },
  "merchant-omniretail": {
    warrantyMonths: 12,
    deliveryDays: 3,
    stockRange: { min: 50, max: 50 },
  },
  "merchant-careplus": {
    warrantyMonths: 24,
    deliveryDays: 2,
    stockRange: { min: 12, max: 12 },
  },
};

const MERCHANT_IDS = ["merchant-valuekart", "merchant-omniretail", "merchant-careplus"];

// --- Offer Generation ---

/**
 * Generate a deterministic stock value within a range.
 * Uses a simple hash of the product ID + merchant ID for determinism.
 */
function deterministicStock(productId: string, merchantId: string, range: { min: number; max: number }): number {
  let hash = 0;
  const combined = `${productId}:${merchantId}`;
  for (let i = 0; i < combined.length; i++) {
    hash = ((hash << 5) - hash + combined.charCodeAt(i)) | 0;
  }
  const normalized = Math.abs(hash) % (range.max - range.min + 1);
  return range.min + normalized;
}

/**
 * Calculate merchant-specific price from the base catalog price.
 */
function calculatePrice(basePrice: number, merchantId: string): number {
  if (merchantId === "merchant-valuekart") {
    return Math.round(basePrice * (1 - VALUEKART_DISCOUNT_PCT));
  }
  if (merchantId === "merchant-careplus") {
    return Math.round(basePrice * (1 + CAREPLUS_PREMIUM_PCT));
  }
  // OmniRetail Direct = catalog price
  return basePrice;
}

/**
 * Generate a single offer for a product from a merchant.
 */
function generateOffer(
  productId: string,
  basePrice: number,
  merchantId: string,
  defaults: MerchantDefaults,
  index: number
): MerchantOffer {
  const price = calculatePrice(basePrice, merchantId);
  const stock = deterministicStock(productId, merchantId, defaults.stockRange);

  return {
    id: `offer-${productId}-${merchantId}-${index}`,
    merchantId,
    productId,
    price,
    currency: "INR",
    stock,
    warrantyMonths: defaults.warrantyMonths,
    deliveryDays: defaults.deliveryDays,
    updatedAt: new Date().toISOString(),
    isAvailable: stock > 0,
  };
}

/**
 * Generate seeded offers for all catalog products across all merchants.
 */
export function generateSeededOffers(): MerchantOffer[] {
  const offers: MerchantOffer[] = [];
  const allProducts = [...DEMO_SMARTPHONES, ...DEMO_LAPTOPS];

  for (const product of allProducts) {
    for (let i = 0; i < MERCHANT_IDS.length; i++) {
      const merchantId = MERCHANT_IDS[i];
      const defaults = MERCHANT_DEFAULTS[merchantId];
      offers.push(generateOffer(product.id, product.price, merchantId, defaults, i));
    }
  }

  return offers;
}

/**
 * Find offers for a specific product from the seeded data.
 */
export function getSeededOffersForProduct(productId: string): MerchantOffer[] {
  return generateSeededOffers().filter((o) => o.productId === productId);
}
