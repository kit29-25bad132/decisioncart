// ============================================================
// DecisionCart — Stale Merchant Offer Protection Tests
// Verifies that a purchase approval is only valid while the
// material merchant facts that were approved remain unchanged.
//
// Trust model under test:
// - The browser is never authoritative for price, availability,
//   stock, merchant identity, or offer validity.
// - Current offer facts are re-resolved server-side at the
//   create-order boundary and compared deterministically against
//   the approved snapshot recorded in the PURCHASE_APPROVED audit
//   event.
// - A material change blocks order creation, invalidates the
//   stale approval (APPROVED → EXPIRED), and records a
//   MERCHANT_STALE_OFFER_BLOCKED audit event.
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
import {
  getPurchaseRepository,
  resetPurchaseRepository,
} from "@/engine/purchase-repository";
import {
  getMerchantRepository,
  resetMerchantRepository,
  setMerchantRepository,
} from "@/merchant/merchant-repository";
import type { MerchantRepository } from "@/merchant/merchant-repository";
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
import { POST as postConfirm } from "@/app/api/purchase/confirm/route";
import { POST as postApprove } from "@/app/api/purchase/approve/route";
import { POST as postCreateOrder } from "@/app/api/payment/create-order/route";

// --- Helpers ---

function mockRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest;
}

const TEST_PRODUCT_ID = "phone-001";
const TEST_CATEGORY = "smartphone";

async function getSeededOfferForProduct(productId: string): Promise<MerchantOffer> {
  const merchantRepo = await getMerchantRepository();
  const offers = await merchantRepo.getOffersByProduct(productId);
  const available = offers.filter((o) => o.isAvailable && o.stock > 0 && o.price > 0);
  if (available.length === 0) throw new Error(`No available offers for ${productId}`);
  return available[0];
}

/**
 * Create → confirm → approve a merchant-aware purchase through the API.
 * The PURCHASE_APPROVED audit event then carries the approved snapshot.
 */
async function createApprovedPurchase(
  productId: string = TEST_PRODUCT_ID,
  category: string = TEST_CATEGORY,
  offerId?: string
) {
  const body: Record<string, unknown> = { productId, category };
  if (offerId !== undefined) body.offerId = offerId;

  const createRes = await postCreate(mockRequest(body));
  const createData = await createRes.json();
  if (!createData.success) throw new Error(`Create failed: ${createData.error}`);

  const confirmRes = await postConfirm(
    mockRequest({ purchaseId: createData.purchaseId })
  );
  const confirmData = await confirmRes.json();
  if (!confirmData.success) throw new Error(`Confirm failed: ${confirmData.error}`);

  const approveRes = await postApprove(
    mockRequest({ purchaseId: createData.purchaseId })
  );
  const approveData = await approveRes.json();
  if (!approveData.success) throw new Error(`Approve failed: ${approveData.error}`);

  return { purchaseId: createData.purchaseId as string };
}

/**
 * Wrapper repository that overrides only `getOffer` (simulating a
 * server-side change to the offer — removal, mutation, reassignment)
 * while delegating everything else to the base repository.
 */
function makeOverriddenOfferRepo(
  base: MerchantRepository,
  offerOverride: MerchantOffer | null
): MerchantRepository {
  return {
    getMerchant: (id) => base.getMerchant(id),
    getAllMerchants: () => base.getAllMerchants(),
    getOffersByProduct: (pid) => base.getOffersByProduct(pid),
    getOffer: async () => offerOverride,
    getAvailableOffersByProduct: (pid) => base.getAvailableOffersByProduct(pid),
    updateOfferPrice: (oid, p) => base.updateOfferPrice(oid, p),
    updateOfferStock: (oid, s) => base.updateOfferStock(oid, s),
    listAllOffers: () => base.listAllOffers(),
    clear: () => base.clear(),
    reset: () => base.reset(),
  };
}

async function getBlockedEvent(purchaseId: string) {
  const repo = await getPurchaseRepository();
  const events = await repo.listAuditEvents(purchaseId);
  return events.find((e) => e.eventType === "MERCHANT_STALE_OFFER_BLOCKED");
}

// ============================================================
// Tests
// ============================================================

describe("Stale Merchant Offer Protection", () => {
  const origKeyId = process.env.RAZORPAY_KEY_ID;
  const origKeySecret = process.env.RAZORPAY_KEY_SECRET;

  beforeEach(() => {
    purchaseStore.clear();
    resetMerchantRepository();
    resetPurchaseRepository();
    process.env.RAZORPAY_KEY_ID = "test_key_id";
    process.env.RAZORPAY_KEY_SECRET = "test_key_secret";
    mockOrdersCreate.mockReset();
    mockOrdersCreate.mockResolvedValue({
      id: "order_stale_prot_001",
      amount: 0,
      currency: "INR",
    });
  });

  afterEach(() => {
    if (origKeyId !== undefined) process.env.RAZORPAY_KEY_ID = origKeyId;
    else delete process.env.RAZORPAY_KEY_ID;
    if (origKeySecret !== undefined) process.env.RAZORPAY_KEY_SECRET = origKeySecret;
    else delete process.env.RAZORPAY_KEY_SECRET;
  });

  // ============================================================
  // A + I. Unchanged offer → existing happy path preserved
  // ============================================================

  it("proceeds normally when all approved material facts are unchanged, and snapshots the approved facts", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

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
    // Order created for exactly the approved price (integer paise)
    expect(mockOrdersCreate).toHaveBeenCalledTimes(1);
    expect(mockOrdersCreate.mock.calls[0][0].amount).toBe(
      Math.round(offer.price * 100)
    );
    expect(purchaseStore.get(purchaseId)!.state).toBe("ORDER_CREATED");

    // Approved snapshot was recorded at approval time
    const repo = await getPurchaseRepository();
    const events = await repo.listAuditEvents(purchaseId);
    const approvedEvent = events.find((e) => e.eventType === "PURCHASE_APPROVED");
    expect(approvedEvent).toBeDefined();
    expect(approvedEvent!.metadata.approvedPrice).toBe(offer.price);
    expect(approvedEvent!.metadata.approvedOfferId).toBe(offer.id);
    expect(approvedEvent!.metadata.approvedMerchantId).toBe(offer.merchantId);

    // No stale-offer blocking occurred
    expect(await getBlockedEvent(purchaseId)).toBeUndefined();
  });

  it("catalog-only purchases (no offer) keep working unchanged", async () => {
    const { purchaseId } = await createApprovedPurchase(TEST_PRODUCT_ID, TEST_CATEGORY);

    const res = await postCreateOrder(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        purchaseId,
      })
    );
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(mockOrdersCreate).toHaveBeenCalledTimes(1);
    expect(purchaseStore.get(purchaseId)!.state).toBe("ORDER_CREATED");
    expect(await getBlockedEvent(purchaseId)).toBeUndefined();
  });

  // ============================================================
  // B + C. Price changed (increase AND decrease are material)
  // ============================================================

  it("blocks order creation when price increased after approval and invalidates the stale approval", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    const merchantRepo = await getMerchantRepository();
    await merchantRepo.updateOfferPrice(offer.id, offer.price + 700); // ₹700 increase

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
    // Stale approval invalidated
    expect(purchaseStore.get(purchaseId)!.state).toBe("EXPIRED");

    const blocked = await getBlockedEvent(purchaseId);
    expect(blocked).toBeDefined();
    expect(blocked!.metadata.reason).toBe("PRICE_CHANGED");
    expect(blocked!.metadata.approvedPrice).toBe(offer.price);
    expect(blocked!.metadata.currentPrice).toBe(offer.price + 700);
    expect(blocked!.metadata.offerId).toBe(offer.id);

    // The same stale approval cannot be retried without fresh approval
    const retry = await postCreateOrder(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        purchaseId,
        offerId: offer.id,
      })
    );
    expect((await retry.json()).success).toBe(false);
    expect(mockOrdersCreate).not.toHaveBeenCalled();
  });

  it("blocks order creation when price decreased after approval (any price change is material)", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    const merchantRepo = await getMerchantRepository();
    await merchantRepo.updateOfferPrice(offer.id, offer.price - 1000);

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
    expect(purchaseStore.get(purchaseId)!.state).toBe("EXPIRED");
    const blocked = await getBlockedEvent(purchaseId);
    expect(blocked!.metadata.reason).toBe("PRICE_CHANGED");
    expect(blocked!.metadata.currentPrice).toBe(offer.price - 1000);
  });

  // ============================================================
  // D. Offer removed
  // ============================================================

  it("blocks order creation when the bound offer no longer exists", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    // Simulate server-side offer removal
    const base = await getMerchantRepository();
    setMerchantRepository(makeOverriddenOfferRepo(base, null));

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
    expect(purchaseStore.get(purchaseId)!.state).toBe("EXPIRED");
    const blocked = await getBlockedEvent(purchaseId);
    expect(blocked!.metadata.reason).toBe("OFFER_REMOVED");
  });

  // ============================================================
  // E. Offer unavailable
  // ============================================================

  it("blocks order creation when the offer becomes unavailable", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    // Simulate server-side availability change (stock still 5, but unavailable)
    const base = await getMerchantRepository();
    setMerchantRepository(
      makeOverriddenOfferRepo(base, { ...offer, isAvailable: false, stock: 5 })
    );

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
    expect(purchaseStore.get(purchaseId)!.state).toBe("EXPIRED");
    const blocked = await getBlockedEvent(purchaseId);
    expect(blocked!.metadata.reason).toBe("OUT_OF_STOCK");
  });

  // ============================================================
  // F. Stock becomes insufficient
  // ============================================================

  it("blocks order creation when stock drops below the required quantity", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    // Available but zero stock (required quantity is 1 in V1)
    const base = await getMerchantRepository();
    setMerchantRepository(
      makeOverriddenOfferRepo(base, { ...offer, isAvailable: true, stock: 0 })
    );

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
    expect(purchaseStore.get(purchaseId)!.state).toBe("EXPIRED");
    const blocked = await getBlockedEvent(purchaseId);
    expect(blocked!.metadata.reason).toBe("INSUFFICIENT_STOCK");
    expect(blocked!.metadata.currentStock).toBe(0);
  });

  // ============================================================
  // G. Merchant / product identity mismatch
  // ============================================================

  it("blocks order creation when the offer's merchant identity changed after approval", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    // Simulate the offer being reassigned to a different merchant server-side
    const base = await getMerchantRepository();
    setMerchantRepository(
      makeOverriddenOfferRepo(base, { ...offer, merchantId: "merchant-imposter" })
    );

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
    expect(purchaseStore.get(purchaseId)!.state).toBe("EXPIRED");
    const blocked = await getBlockedEvent(purchaseId);
    expect(blocked!.metadata.reason).toBe("OFFER_MISMATCH");
    expect(blocked!.metadata.currentMerchantId).toBe("merchant-imposter");
  });

  it("blocks order creation when the offer's product binding changed after approval", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    // Simulate the offer being re-bound to a different product server-side
    const base = await getMerchantRepository();
    setMerchantRepository(
      makeOverriddenOfferRepo(base, { ...offer, productId: "phone-999" })
    );

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
    expect(purchaseStore.get(purchaseId)!.state).toBe("EXPIRED");
    const blocked = await getBlockedEvent(purchaseId);
    expect(blocked!.metadata.reason).toBe("OFFER_MISMATCH");
  });

  // ============================================================
  // H. Browser-supplied price is never authoritative
  // ============================================================

  it("cannot be bypassed by the browser sending the previously approved price", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    // Server-side price changed after approval
    const merchantRepo = await getMerchantRepository();
    await merchantRepo.updateOfferPrice(offer.id, offer.price + 500);

    // Client echoes the OLD (approved) price — must not restore validity
    const res = await postCreateOrder(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        purchaseId,
        offerId: offer.id,
        price: offer.price, // stale client-side price
        clientPrice: offer.price,
        amount: Math.round(offer.price * 100),
      })
    );
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(mockOrdersCreate).not.toHaveBeenCalled();
    expect(purchaseStore.get(purchaseId)!.state).toBe("EXPIRED");
    const blocked = await getBlockedEvent(purchaseId);
    expect(blocked!.metadata.reason).toBe("PRICE_CHANGED");
  });

  // ============================================================
  // B + C + D + E. Missing/malformed snapshot → FAIL CLOSED
  // ============================================================

  it("blocks an APPROVED purchase with a missing approval snapshot and does not create an order", async () => {
    // Hand-craft an APPROVED purchase directly on the store with no
    // PURCHASE_APPROVED audit snapshot (e.g. pre-existing data).
    purchaseStore.create("legacy-approved", TEST_PRODUCT_ID);
    purchaseStore.updateState("legacy-approved", "CONFIRMING");
    purchaseStore.approve("legacy-approved");

    const res = await postCreateOrder(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        purchaseId: "legacy-approved",
      })
    );
    const data = await res.json();

    // Fail closed: no order, no ORDER_CREATED
    expect(data.success).toBe(false);
    expect(data.error).toContain("approve again");
    expect(mockOrdersCreate).not.toHaveBeenCalled();
    expect(purchaseStore.get("legacy-approved")!.state).toBe("EXPIRED");

    const blocked = await getBlockedEvent("legacy-approved");
    expect(blocked).toBeDefined();
    expect(blocked!.metadata.reason).toBe("APPROVAL_SNAPSHOT_MISSING");
  });

  it("blocks an APPROVED purchase whose snapshot lacks the approved price", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    // Corrupt the snapshot: strip approvedPrice (malformed/incomplete)
    const repo = await getPurchaseRepository();
    const events = await repo.listAuditEvents(purchaseId);
    const approvedEvent = events.find((e) => e.eventType === "PURCHASE_APPROVED")!;
    delete (approvedEvent.metadata as Record<string, unknown>).approvedPrice;

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
    expect(purchaseStore.get(purchaseId)!.state).toBe("EXPIRED");
    const blocked = await getBlockedEvent(purchaseId);
    expect(blocked!.metadata.reason).toBe("APPROVAL_SNAPSHOT_MISSING");
  });

  it("blocks a merchant-aware purchase whose snapshot lacks offer/merchant identity", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    // Snapshot has a price but no offer/merchant identity → cannot
    // establish the approved merchant facts for a merchant-aware purchase
    const repo = await getPurchaseRepository();
    const events = await repo.listAuditEvents(purchaseId);
    const approvedEvent = events.find((e) => e.eventType === "PURCHASE_APPROVED")!;
    delete (approvedEvent.metadata as Record<string, unknown>).approvedOfferId;
    delete (approvedEvent.metadata as Record<string, unknown>).approvedMerchantId;

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
    expect(purchaseStore.get(purchaseId)!.state).toBe("EXPIRED");
    const blocked = await getBlockedEvent(purchaseId);
    expect(blocked!.metadata.reason).toBe("APPROVAL_SNAPSHOT_MISSING");
  });

  it("blocks a snapshot with a non-positive or non-numeric approved price", async () => {
    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const { purchaseId } = await createApprovedPurchase(
      TEST_PRODUCT_ID,
      TEST_CATEGORY,
      offer.id
    );

    const repo = await getPurchaseRepository();
    const events = await repo.listAuditEvents(purchaseId);
    const approvedEvent = events.find((e) => e.eventType === "PURCHASE_APPROVED")!;
    (approvedEvent.metadata as Record<string, unknown>).approvedPrice = 0;

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
    expect(purchaseStore.get(purchaseId)!.state).toBe("EXPIRED");
    const blocked = await getBlockedEvent(purchaseId);
    expect(blocked!.metadata.reason).toBe("APPROVAL_SNAPSHOT_MISSING");
  });

  // ============================================================
  // F. Browser cannot bypass the missing-snapshot gate
  // ============================================================

  it("cannot be bypassed by the browser supplying prices or identity data", async () => {
    purchaseStore.create("legacy-approved-2", TEST_PRODUCT_ID);
    purchaseStore.updateState("legacy-approved-2", "CONFIRMING");
    purchaseStore.approve("legacy-approved-2");

    const offer = await getSeededOfferForProduct(TEST_PRODUCT_ID);
    const res = await postCreateOrder(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        purchaseId: "legacy-approved-2",
        offerId: offer.id,
        // Client tries to fabricate the snapshot server-side — these fields
        // are read only from the server-side audit trail, never the request
        approvedPrice: offer.price,
        approvedOfferId: offer.id,
        approvedMerchantId: offer.merchantId,
        price: offer.price,
        clientPrice: offer.price,
      })
    );
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(mockOrdersCreate).not.toHaveBeenCalled();
    expect(purchaseStore.get("legacy-approved-2")!.state).toBe("EXPIRED");
    const blocked = await getBlockedEvent("legacy-approved-2");
    expect(blocked!.metadata.reason).toBe("APPROVAL_SNAPSHOT_MISSING");
  });
});
