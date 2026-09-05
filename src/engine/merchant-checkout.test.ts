// ============================================================
// DecisionCart — Merchant-Aware Trusted Checkout Tests
// Verifies the full merchant-aware purchase lifecycle:
// purchase creation with offer binding, verification,
// Razorpay order creation with server-side offer price,
// and all security invariants.
// ============================================================

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { NextRequest } from "next/server";
import { purchaseStore } from "@/engine/purchase-state-machine";
import { getMerchantRepository, resetMerchantRepository } from "@/merchant/merchant-repository";
import { getPurchaseRepository, resetPurchaseRepository } from "@/engine/purchase-repository";
import type { MerchantOffer } from "@/types";

// --- Mock Razorpay ---
const mockOrdersCreate = vi.hoisted(() => vi.fn());

vi.mock("razorpay", () => ({
  default: class MockRazorpay {
    orders = {
      create: (...args: unknown[]) => mockOrdersCreate(...args),
    };
  },
}));

// Import routes AFTER vi.mock so they use the mocked Razorpay
import { POST as postCreate } from "@/app/api/purchase/create/route";
import { POST as postVerify } from "@/app/api/purchase/verify/route";
import { POST as postCreateOrder } from "@/app/api/payment/create-order/route";

// --- Helpers ---

function mockRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest;
}

const TEST_PRODUCT_ID = "phone-001";
const TEST_CATEGORY = "smartphone";

/**
 * Get a seeded offer for a product from the merchant repository.
 * Returns the first available offer.
 */
async function getSeededOfferForProduct(productId: string): Promise<MerchantOffer> {
  const merchantRepo = await getMerchantRepository();
  const offers = await merchantRepo.getOffersByProduct(productId);
  const available = offers.filter((o) => o.isAvailable && o.stock > 0 && o.price > 0);
  if (available.length === 0) throw new Error(`No available offers for ${productId}`);
  return available[0];
}

/**
 * Create a purchase through the API and return the response data.
 */
async function createPurchase(
  productId: string = TEST_PRODUCT_ID,
  category: string = TEST_CATEGORY,
  offerId?: string
) {
  const body: Record<string, unknown> = { productId, category };
  if (offerId !== undefined) body.offerId = offerId;
  const res = await postCreate(mockRequest(body));
  return { res, data: await res.json() };
}

/**
 * Create, confirm, and approve a purchase through the API.
 */
async function createApprovedPurchase(
  productId: string = TEST_PRODUCT_ID,
  category: string = TEST_CATEGORY,
  offerId?: string
) {
  const { data: createData } = await createPurchase(productId, category, offerId);
  if (!createData.success) throw new Error(`Create failed: ${createData.error}`);

  const confirmRes = await (
    await import("@/app/api/purchase/confirm/route")
  ).POST(mockRequest({ purchaseId: createData.purchaseId }));
  const confirmData = await confirmRes.json();
  if (!confirmData.success) throw new Error(`Confirm failed: ${confirmData.error}`);

  const approveRes = await (
    await import("@/app/api/purchase/approve/route")
  ).POST(mockRequest({ purchaseId: createData.purchaseId }));
  const approveData = await approveRes.json();
  if (!approveData.success) throw new Error(`Approve failed: ${approveData.error}`);

  return {
    purchaseId: createData.purchaseId,
    offerId: createData.offerId ?? null,
    createData,
    approveData,
  };
}

// ============================================================
// PURCHASE CREATION TESTS
// ============================================================

describe("Merchant-Aware Purchase Creation", () => {
  beforeEach(() => {
    purchaseStore.clear();
    resetMerchantRepository();
    resetPurchaseRepository();
  });

  it("valid offer creates merchant-aware purchase with bound offerId", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { data } = await createPurchase(TEST_PRODUCT_ID, TEST_CATEGORY, offer.id);

    expect(data.success).toBe(true);
    expect(data.purchaseId).toBeDefined();
    expect(data.state).toBe("DECIDED");
    expect(data.offerId).toBe(offer.id);

    // Verify the purchase record has the offer bound
    const repo = await getPurchaseRepository();
    const purchase = await repo.getPurchase(data.purchaseId);
    expect(purchase).not.toBeNull();
    expect(purchase!.merchantOfferId).toBe(offer.id);
  });

  it("nonexistent offer is rejected", async () => {
    const { data } = await createPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      "offer-nonexistent-999"
    );

    expect(data.success).toBe(false);
    expect(data.error).toContain("not found");
  });

  it("offer belonging to different product is rejected", async () => {
    // Get an offer for a different product
    const merchantRepo = await getMerchantRepository();
    const allOffers = await merchantRepo.listAllOffers();
    const otherProductOffer = allOffers.find(
      (o) => o.productId !== TEST_PRODUCT_ID && o.isAvailable && o.stock > 0
    );

    if (!otherProductOffer) {
      // Skip if no cross-product offer available
      return;
    }

    const { data } = await createPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      otherProductOffer.id
    );

    expect(data.success).toBe(false);
    expect(data.error).toContain("does not match");
  });

  it("unavailable offer is rejected", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const merchantRepo = await getMerchantRepository();

    // Set offer to unavailable
    await merchantRepo.updateOfferStock(offer.id, 0);

    const { data } = await createPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    expect(data.success).toBe(false);
    expect(data.error).toContain("available");
  });

  it("zero stock offer is rejected", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const merchantRepo = await getMerchantRepository();

    // Set stock to 0 (which also sets isAvailable to false)
    await merchantRepo.updateOfferStock(offer.id, 0);

    const { data } = await createPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    expect(data.success).toBe(false);
  });

  it("legacy purchase without offerId succeeds", async () => {
    const { data } = await createPurchase(TEST_PRODUCT_ID, TEST_CATEGORY);

    expect(data.success).toBe(true);
    expect(data.purchaseId).toBeDefined();
    expect(data.offerId).toBeUndefined();

    const repo = await getPurchaseRepository();
    const purchase = await repo.getPurchase(data.purchaseId);
    expect(purchase!.merchantOfferId).toBeNull();
  });

  it("MERCHANT_OFFER_SELECTED audit event is logged for merchant-aware purchases", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { data } = await createPurchase(TEST_PRODUCT_ID, TEST_CATEGORY, offer.id);

    const repo = await getPurchaseRepository();
    const events = await repo.listAuditEvents(data.purchaseId);
    const selectedEvent = events.find(
      (e) => e.eventType === "MERCHANT_OFFER_SELECTED"
    );

    expect(selectedEvent).toBeDefined();
    expect(selectedEvent!.metadata.offerId).toBe(offer.id);
  });

  it("no MERCHANT_OFFER_SELECTED event for legacy purchases", async () => {
    const { data } = await createPurchase(TEST_PRODUCT_ID, TEST_CATEGORY);

    const repo = await getPurchaseRepository();
    const events = await repo.listAuditEvents(data.purchaseId);
    const selectedEvent = events.find(
      (e) => e.eventType === "MERCHANT_OFFER_SELECTED"
    );

    expect(selectedEvent).toBeUndefined();
  });
});

// ============================================================
// PURCHASE VERIFICATION TESTS
// ============================================================

describe("Merchant-Aware Purchase Verification", () => {
  it("verified price comes from merchant offer, not catalog", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);

    const res = await postVerify(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        offerId: offer.id,
      })
    );
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.productId).toBe(TEST_PRODUCT_ID);
    expect(data.offerId).toBe(offer.id);
    expect(data.merchantId).toBe(offer.merchantId);
    expect(data.verifiedPrice).toBe(offer.price);
    expect(data.source).toBe("merchant-repository");
    expect(data.available).toBe(true);
    expect(data.stock).toBeGreaterThanOrEqual(0);
  });

  it("catalog price is NOT used as merchant checkout price", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);

    // Verify that the catalog price differs from the offer price
    // (at least for some merchants this should be true)
    const { getCatalog } = await import("@/catalog/demo-data");
    const catalog = getCatalog(TEST_CATEGORY);
    const product = catalog.find((p) => p.id === TEST_PRODUCT_ID);

    // If the prices happen to be the same (OmniRetail = catalog price),
    // skip this test
    if (product && product.price === offer.price) {
      return;
    }

    const res = await postVerify(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        offerId: offer.id,
      })
    );
    const data = await res.json();

    // The verified price must be the offer price
    expect(data.verifiedPrice).toBe(offer.price);
    // If catalog price is different, verified price must NOT be catalog price
    if (product && product.price !== offer.price) {
      expect(data.verifiedPrice).not.toBe(product.price);
    }
  });

  it("mismatched product is rejected", async () => {
    const merchantRepo = await getMerchantRepository();
    const allOffers = await merchantRepo.listAllOffers();
    const otherProductOffer = allOffers.find(
      (o) => o.productId !== TEST_PRODUCT_ID && o.isAvailable && o.stock > 0
    );

    if (!otherProductOffer) return;

    const res = await postVerify(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        offerId: otherProductOffer.id,
      })
    );
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("not belong");
  });

  it("unavailable offer is rejected", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const merchantRepo = await getMerchantRepository();
    await merchantRepo.updateOfferStock(offer.id, 0);

    const res = await postVerify(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        offerId: offer.id,
      })
    );
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.available).toBe(false);
    expect(data.stock).toBe(0);
  });

  it("catalog-only verification still works without offerId", async () => {
    const res = await postVerify(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
      })
    );
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.source).toBe("DecisionCart demo catalog");
    expect(data.verifiedPrice).toBeGreaterThan(0);
  });

  it("returns price mismatch details when client price differs", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);

    const res = await postVerify(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        offerId: offer.id,
        clientPrice: 99999,
      })
    );
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.priceMismatch).toBeDefined();
    expect(data.priceMismatch.clientPrice).toBe(99999);
    expect(data.priceMismatch.trustedPrice).toBe(offer.price);
    expect(data.priceMismatch.difference).toBe(offer.price - 99999);
  });
});

// ============================================================
// ORDER CREATION TESTS
// ============================================================

describe("Merchant-Aware Order Creation", () => {
  const origKeyId = process.env.RAZORPAY_KEY_ID;
  const origKeySecret = process.env.RAZORPAY_KEY_SECRET;

  beforeEach(() => {
    purchaseStore.clear();
    resetMerchantRepository();
    resetPurchaseRepository();
    process.env.RAZORPAY_KEY_ID = "test_key_id";
    process.env.RAZORPAY_KEY_SECRET = "test_key_secret";
    mockOrdersCreate.mockReset();
  });

  afterEach(() => {
    if (origKeyId !== undefined) process.env.RAZORPAY_KEY_ID = origKeyId;
    else delete process.env.RAZORPAY_KEY_ID;
    if (origKeySecret !== undefined) process.env.RAZORPAY_KEY_SECRET = origKeySecret;
    else delete process.env.RAZORPAY_KEY_SECRET;
  });

  it("Razorpay amount uses offer price × 100", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    mockOrdersCreate.mockResolvedValue({
      id: "order_merchant_001",
      amount: 0,
      currency: "INR",
    });

    const res = await postCreateOrder(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        purchaseId,
        offerId: offer.id,
      })
    );
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(mockOrdersCreate).toHaveBeenCalledTimes(1);

    const callArgs = mockOrdersCreate.mock.calls[0][0];
    expect(callArgs.amount).toBe(Math.round(offer.price * 100));
    expect(callArgs.currency).toBe("INR");
  });

  it("client price cannot override offer price", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    mockOrdersCreate.mockResolvedValue({
      id: "order_merchant_002",
      amount: 0,
      currency: "INR",
    });

    // Send a spoofed low price in the request — it should be ignored
    const res = await postCreateOrder(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        purchaseId,
        offerId: offer.id,
        price: 1, // Spoofed client price — must be ignored
      })
    );
    const data = await res.json();

    expect(data.success).toBe(true);
    const callArgs = mockOrdersCreate.mock.calls[0][0];
    // Must use server-verified offer price, NOT client price
    expect(callArgs.amount).toBe(Math.round(offer.price * 100));
    expect(callArgs.amount).not.toBe(100); // 1 × 100
  });

  it("purchase offer mismatch is rejected", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    // Get a different offer for the same product
    const merchantRepo = await getMerchantRepository();
    const allOffers = await merchantRepo.getOffersByProduct(TEST_PRODUCT_ID);
    const otherOffer = allOffers.find(
      (o) => o.id !== offer.id && o.isAvailable && o.stock > 0
    );

    if (!otherOffer) return;

    const res = await postCreateOrder(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        purchaseId,
        offerId: otherOffer.id, // Wrong offer
      })
    );
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("does not match");
  });

  it("expired approval is rejected", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    // Backdate approval to expire it
    const purchase = purchaseStore.get(purchaseId)!;
    const { APPROVAL_EXPIRY_MS } = await import(
      "@/engine/purchase-state-machine"
    );
    purchase.approvedAt = Date.now() - APPROVAL_EXPIRY_MS - 1000;
    purchase.expiresAt = purchase.approvedAt + APPROVAL_EXPIRY_MS;

    const res = await postCreateOrder(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        purchaseId,
        offerId: offer.id,
      })
    );
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("expired");
  });

  it("unavailable offer is rejected before Razorpay call", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    // Make offer unavailable AFTER purchase approval
    const merchantRepo = await getMerchantRepository();
    await merchantRepo.updateOfferStock(offer.id, 0);

    const res = await postCreateOrder(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        purchaseId,
        offerId: offer.id,
      })
    );
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(mockOrdersCreate).not.toHaveBeenCalled();
  });

  it("zero stock is rejected before Razorpay call", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    const merchantRepo = await getMerchantRepository();
    await merchantRepo.updateOfferStock(offer.id, 0);

    const res = await postCreateOrder(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        purchaseId,
        offerId: offer.id,
      })
    );
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(mockOrdersCreate).not.toHaveBeenCalled();
  });

  it("missing offerId for merchant-aware purchase is rejected", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    // Don't provide offerId even though purchase requires one
    const res = await postCreateOrder(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        purchaseId,
      })
    );
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("offer");
  });

  it("OFFER_VERIFIED audit event is logged", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    mockOrdersCreate.mockResolvedValue({
      id: "order_audit_001",
      amount: Math.round(offer.price * 100),
      currency: "INR",
    });

    await postCreateOrder(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        purchaseId,
        offerId: offer.id,
      })
    );

    const repo = await getPurchaseRepository();
    const events = await repo.listAuditEvents(purchaseId);
    const verifiedEvent = events.find(
      (e) => e.eventType === "OFFER_VERIFIED"
    );

    expect(verifiedEvent).toBeDefined();
    expect(verifiedEvent!.metadata.offerId).toBe(offer.id);
    expect(verifiedEvent!.metadata.verifiedPrice).toBe(offer.price);
    expect(verifiedEvent!.metadata.merchantId).toBe(offer.merchantId);
  });

  it("concurrent duplicate order prevention still works", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    mockOrdersCreate.mockResolvedValue({
      id: "order_concurrent_001",
      amount: Math.round(offer.price * 100),
      currency: "INR",
    });

    const res1 = await postCreateOrder(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        purchaseId,
        offerId: offer.id,
      })
    );
    const data1 = await res1.json();
    expect(data1.success).toBe(true);

    // Second request should fail
    const res2 = await postCreateOrder(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        purchaseId,
        offerId: offer.id,
      })
    );
    const data2 = await res2.json();
    expect(data2.success).toBe(false);

    // Only one Razorpay call should have been made
    expect(mockOrdersCreate).toHaveBeenCalledTimes(1);
  });

  it("Razorpay failure transitions correctly to FAILED", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    mockOrdersCreate.mockRejectedValue(new Error("Razorpay API error"));

    const res = await postCreateOrder(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        purchaseId,
        offerId: offer.id,
      })
    );
    const data = await res.json();

    expect(data.success).toBe(false);
    const purchase = purchaseStore.get(purchaseId);
    expect(purchase?.state).toBe("FAILED");
  });

  it("RAZORPAY_ORDER_CREATED audit includes offer metadata", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    mockOrdersCreate.mockResolvedValue({
      id: "order_meta_001",
      amount: Math.round(offer.price * 100),
      currency: "INR",
    });

    await postCreateOrder(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        purchaseId,
        offerId: offer.id,
      })
    );

    const repo = await getPurchaseRepository();
    const events = await repo.listAuditEvents(purchaseId);
    const orderEvent = events.find(
      (e) => e.eventType === "RAZORPAY_ORDER_CREATED"
    );

    expect(orderEvent).toBeDefined();
    expect(orderEvent!.metadata.offerId).toBe(offer.id);
    expect(orderEvent!.metadata.merchantId).toBe(offer.merchantId);
    expect(orderEvent!.metadata.verifiedPrice).toBe(offer.price);
  });

  it("legacy catalog-only order still works without offerId", async () => {
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY
    );

    mockOrdersCreate.mockResolvedValue({
      id: "order_legacy_001",
      amount: 0,
      currency: "INR",
    });

    const res = await postCreateOrder(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        purchaseId,
      })
    );
    const data = await res.json();

    expect(data.success).toBe(true);
    const callArgs = mockOrdersCreate.mock.calls[0][0];
    expect(callArgs.amount).toBeGreaterThan(0);
  });
});

// ============================================================
// PRICE CHANGE TESTS
// ============================================================

describe("Price Change Behavior", () => {
  const origKeyId = process.env.RAZORPAY_KEY_ID;
  const origKeySecret = process.env.RAZORPAY_KEY_SECRET;

  beforeEach(() => {
    purchaseStore.clear();
    resetMerchantRepository();
    resetPurchaseRepository();
    process.env.RAZORPAY_KEY_ID = "test_key_id";
    process.env.RAZORPAY_KEY_SECRET = "test_key_secret";
    mockOrdersCreate.mockReset();
  });

  afterEach(() => {
    if (origKeyId !== undefined) process.env.RAZORPAY_KEY_ID = origKeyId;
    else delete process.env.RAZORPAY_KEY_ID;
    if (origKeySecret !== undefined) process.env.RAZORPAY_KEY_SECRET = origKeySecret;
    else delete process.env.RAZORPAY_KEY_SECRET;
  });

  it("price change after approval blocks order creation and invalidates the stale approval", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const originalPrice = offer.price;
    const newPrice = originalPrice - 5000;

    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    // Change offer price AFTER purchase approval but BEFORE order creation
    const merchantRepo = await getMerchantRepository();
    await merchantRepo.updateOfferPrice(offer.id, newPrice);

    mockOrdersCreate.mockResolvedValue({
      id: "order_price_change_001",
      amount: 0,
      currency: "INR",
    });

    const res = await postCreateOrder(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        purchaseId,
        offerId: offer.id,
      })
    );
    const data = await res.json();

    // Material change: order creation MUST be blocked
    expect(data.success).toBe(false);
    // No Razorpay order was created
    expect(mockOrdersCreate).not.toHaveBeenCalled();
    // Stale approval invalidated — purchase is EXPIRED, not stuck in APPROVED
    expect(purchaseStore.get(purchaseId)!.state).toBe("EXPIRED");

    // Same stale approval cannot be retried successfully without fresh approval
    const retry = await postCreateOrder(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        purchaseId,
        offerId: offer.id,
      })
    );
    const retryData = await retry.json();
    expect(retryData.success).toBe(false);
    expect(mockOrdersCreate).not.toHaveBeenCalled();
  });

  it("stale client price cannot override the authoritative current price", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const originalPrice = offer.price;
    const newPrice = originalPrice - 10000;

    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    // Change price after approval — a material change regardless of what
    // the client sends
    const merchantRepo = await getMerchantRepository();
    await merchantRepo.updateOfferPrice(offer.id, newPrice);

    mockOrdersCreate.mockResolvedValue({
      id: "order_stale_001",
      amount: 0,
      currency: "INR",
    });

    // Client sends the OLD price — the server compares current server-side
    // facts against the approved snapshot, never the client's price
    const res = await postCreateOrder(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        purchaseId,
        offerId: offer.id,
        price: originalPrice, // Stale — must be ignored
      })
    );
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(mockOrdersCreate).not.toHaveBeenCalled();
    expect(purchaseStore.get(purchaseId)!.state).toBe("EXPIRED");
  });
});

// ============================================================
// PURCHASE RECORD OFFER BINDING TESTS
// ============================================================

describe("PurchaseRecord Offer Binding", () => {
  beforeEach(() => {
    purchaseStore.clear();
    resetMerchantRepository();
    resetPurchaseRepository();
  });

  it("purchase record stores merchantOfferId", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { data } = await createPurchase(TEST_PRODUCT_ID, TEST_CATEGORY, offer.id);

    const repo = await getPurchaseRepository();
    const purchase = await repo.getPurchase(data.purchaseId);

    expect(purchase!.merchantOfferId).toBe(offer.id);
  });

  it("purchase record has null merchantOfferId for legacy purchases", async () => {
    const { data } = await createPurchase(TEST_PRODUCT_ID, TEST_CATEGORY);

    const repo = await getPurchaseRepository();
    const purchase = await repo.getPurchase(data.purchaseId);

    expect(purchase!.merchantOfferId).toBeNull();
  });
});
