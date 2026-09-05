// ============================================================
// DecisionCart — Server-Side Payment Amount Verification Tests
// Verifies that /api/payment/verify independently compares the
// Razorpay-paid amount (fetched server-side) against the
// authoritative server-side purchase/order amount.
//
// Security invariants under test:
// - Correct amount  → verification succeeds (existing behavior)
// - Wrong amount    → rejected, purchase NOT marked PAID/DONE,
//                     PAYMENT_AMOUNT_MISMATCH audit event recorded
// - Client-supplied amounts are ignored entirely
// - Signature verification remains enforced first
// - Missing/invalid authoritative state fails closed
// ============================================================

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { purchaseStore } from "@/engine/purchase-state-machine";
import {
  getPurchaseRepository,
  resetPurchaseRepository,
} from "@/engine/purchase-repository";
import { getMerchantRepository, resetMerchantRepository } from "@/merchant/merchant-repository";
import type { MerchantOffer } from "@/types";

// --- Mock Razorpay SDK (orders.create + payments.fetch) ---
const mockOrdersCreate = vi.hoisted(() => vi.fn());
const mockPaymentsFetch = vi.hoisted(() => vi.fn());

vi.mock("razorpay", () => ({
  default: class MockRazorpay {
    orders = {
      create: (...args: unknown[]) => mockOrdersCreate(...args),
    };
    payments = {
      fetch: (...args: unknown[]) => mockPaymentsFetch(...args),
    };
  },
}));

// Import routes AFTER vi.mock so they use the mocked Razorpay
import { POST as postCreate } from "@/app/api/purchase/create/route";
import { POST as postConfirm } from "@/app/api/purchase/confirm/route";
import { POST as postApprove } from "@/app/api/purchase/approve/route";
import { POST as postCreateOrder } from "@/app/api/payment/create-order/route";
import { POST as postVerify } from "@/app/api/payment/verify/route";

// --- Helpers ---

function mockRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest;
}

const TEST_PRODUCT_ID = "phone-001";
const TEST_CATEGORY = "smartphone";
const TEST_KEY_ID = "test_key_id";
const TEST_KEY_SECRET = "test_key_secret";

/** Valid HMAC signature for the test secret (what a real client would receive). */
function validSignature(orderId: string, paymentId: string): string {
  return crypto
    .createHmac("sha256", TEST_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

let orderSeq = 0;
let lastCreatedOrder: { id: string; amount: number; currency: string } | null = null;

/** Default SDK behavior: payments.fetch returns the amount actually charged. */
function defaultPaymentFetchResponse(paymentId: string) {
  if (!lastCreatedOrder) throw new Error("No order created yet");
  return {
    id: paymentId,
    order_id: lastCreatedOrder.id,
    amount: lastCreatedOrder.amount,
    currency: lastCreatedOrder.currency,
    status: "captured",
  };
}

/**
 * Run the full real flow through the API routes:
 * create → confirm → approve → create-order.
 * Returns the purchase/order identifiers and the authoritative
 * order amount (in paise) that create-order charged.
 */
async function runLifecycleToOrderCreated(offerId?: string) {
  const body: Record<string, unknown> = {
    productId: TEST_PRODUCT_ID,
    category: TEST_CATEGORY,
  };
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

  const orderRes = await postCreateOrder(
    mockRequest({
      productId: TEST_PRODUCT_ID,
      category: TEST_CATEGORY,
      purchaseId: createData.purchaseId,
      ...(offerId !== undefined ? { offerId } : {}),
    })
  );
  const orderData = await orderRes.json();
  if (!orderData.success) throw new Error(`Create-order failed: ${orderData.error}`);

  return {
    purchaseId: createData.purchaseId as string,
    razorpayOrderId: orderData.order.id as string,
    authoritativeAmountInPaise: orderData.order.amount as number,
  };
}

// ============================================================
// Test setup
// ============================================================

describe("Server-Side Payment Amount Verification", () => {
  const origKeyId = process.env.RAZORPAY_KEY_ID;
  const origKeySecret = process.env.RAZORPAY_KEY_SECRET;

  beforeEach(() => {
    purchaseStore.clear();
    resetMerchantRepository();
    resetPurchaseRepository();
    process.env.RAZORPAY_KEY_ID = TEST_KEY_ID;
    process.env.RAZORPAY_KEY_SECRET = TEST_KEY_SECRET;

    orderSeq = 0;
    lastCreatedOrder = null;

    // Clear call history so per-test assertions (e.g. "never called") hold
    mockOrdersCreate.mockClear();
    mockPaymentsFetch.mockClear();

    mockOrdersCreate.mockImplementation((opts: { amount: number; currency: string }) => {
      orderSeq += 1;
      lastCreatedOrder = {
        id: `order_amount_test_${orderSeq}`,
        amount: opts.amount,
        currency: opts.currency,
      };
      return { id: lastCreatedOrder.id, ...opts };
    });

    mockPaymentsFetch.mockImplementation((paymentId: string) =>
      defaultPaymentFetchResponse(paymentId)
    );
  });

  afterEach(() => {
    if (origKeyId !== undefined) process.env.RAZORPAY_KEY_ID = origKeyId;
    else delete process.env.RAZORPAY_KEY_ID;
    if (origKeySecret !== undefined) process.env.RAZORPAY_KEY_SECRET = origKeySecret;
    else delete process.env.RAZORPAY_KEY_SECRET;
    vi.restoreAllMocks();
  });

  // ============================================================
  // A. Correct amount → verification succeeds
  // ============================================================

  it("succeeds when the paid amount equals the authoritative order amount (catalog path)", async () => {
    const { purchaseId, razorpayOrderId, authoritativeAmountInPaise } =
      await runLifecycleToOrderCreated();

    const paymentId = "pay_correct_amount";
    const res = await postVerify(
      mockRequest({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature(razorpayOrderId, paymentId),
      })
    );
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.message).toContain("verified");

    // Purchase completed: ORDER_CREATED → PAID → DONE
    const purchase = purchaseStore.get(purchaseId);
    expect(purchase!.state).toBe("DONE");
    expect(purchase!.razorpayPaymentId).toBe(paymentId);

    // Authoritative amount actually flowed through (sanity)
    expect(authoritativeAmountInPaise).toBeGreaterThan(0);
    expect(mockPaymentsFetch).toHaveBeenCalledWith(paymentId);

    // No mismatch event, success events present
    const repo = await getPurchaseRepository();
    const events = await repo.listAuditEvents(purchaseId);
    expect(events.some((e) => e.eventType === "PAYMENT_AMOUNT_MISMATCH")).toBe(false);
    expect(events.some((e) => e.eventType === "PAYMENT_VERIFIED")).toBe(true);
    expect(events.some((e) => e.eventType === "PURCHASE_COMPLETED")).toBe(true);
  });

  it("succeeds when the paid amount equals the bound merchant offer price (merchant path)", async () => {
    const merchantRepo = await getMerchantRepository();
    const offers = await merchantRepo.getOffersByProduct(TEST_PRODUCT_ID);
    const offer: MerchantOffer = offers.find((o) => o.isAvailable && o.stock > 0 && o.price > 0)!;

    const { purchaseId, razorpayOrderId } = await runLifecycleToOrderCreated(offer.id);

    const paymentId = "pay_merchant_correct";
    const res = await postVerify(
      mockRequest({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature(razorpayOrderId, paymentId),
      })
    );
    const data = await res.json();

    expect(data.success).toBe(true);
    const purchase = purchaseStore.get(purchaseId);
    expect(purchase!.state).toBe("DONE");
  });

  it("returns success without state changes when re-verifying a DONE purchase", async () => {
    const { purchaseId, razorpayOrderId } = await runLifecycleToOrderCreated();

    const paymentId = "pay_repeat";
    const first = await postVerify(
      mockRequest({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature(razorpayOrderId, paymentId),
      })
    );
    expect((await first.json()).success).toBe(true);

    // Second verification of the same completed purchase is safe/idempotent
    const second = await postVerify(
      mockRequest({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature(razorpayOrderId, paymentId),
      })
    );
    const secondData = await second.json();
    expect(secondData.success).toBe(true);
    expect(purchaseStore.get(purchaseId)!.state).toBe("DONE");
  });

  // ============================================================
  // B. Incorrect amount → rejected, NOT marked PAID/DONE
  // ============================================================

  it("rejects when the paid amount differs from the authoritative amount and does NOT mark the purchase PAID or DONE", async () => {
    const { purchaseId, razorpayOrderId, authoritativeAmountInPaise } =
      await runLifecycleToOrderCreated();

    const paymentId = "pay_wrong_amount";
    // The "payment" was captured for a different amount than the order
    mockPaymentsFetch.mockImplementation((pid: string) => ({
      ...defaultPaymentFetchResponse(pid),
      amount: authoritativeAmountInPaise - 1,
    }));

    const res = await postVerify(
      mockRequest({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature(razorpayOrderId, paymentId),
      })
    );
    const data = await res.json();

    expect(data.success).toBe(false);

    // Purchase is NOT marked PAID or DONE — remains in ORDER_CREATED
    const purchase = purchaseStore.get(purchaseId);
    expect(purchase!.state).toBe("ORDER_CREATED");
    expect(purchase!.state).not.toBe("PAID");
    expect(purchase!.state).not.toBe("DONE");

    // Amount-mismatch audit event recorded with both sides of the comparison
    const repo = await getPurchaseRepository();
    const events = await repo.listAuditEvents(purchaseId);
    const mismatch = events.find((e) => e.eventType === "PAYMENT_AMOUNT_MISMATCH");
    expect(mismatch).toBeDefined();
    expect(mismatch!.metadata.expectedAmount).toBe(authoritativeAmountInPaise);
    expect(mismatch!.metadata.paidAmount).toBe(authoritativeAmountInPaise - 1);
    expect(mismatch!.metadata.razorpayOrderId).toBe(razorpayOrderId);

    // No successful payment/completion events
    expect(events.some((e) => e.eventType === "PAYMENT_VERIFIED")).toBe(false);
    expect(events.some((e) => e.eventType === "PURCHASE_COMPLETED")).toBe(false);
  });

  // ============================================================
  // C. Client-supplied amounts are ignored
  // ============================================================

  it("ignores misleading client-supplied amounts and uses the server-side purchase amount", async () => {
    const { purchaseId, razorpayOrderId } = await runLifecycleToOrderCreated();

    const paymentId = "pay_client_override_attempt";

    // Attacker-controlled extra fields in the request body.
    // The server must derive the expected amount itself; the fetch mock
    // returns the true charged amount, so verification must succeed
    // regardless of the misleading client values.
    const res = await postVerify(
      mockRequest({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature(razorpayOrderId, paymentId),
        amount: 1,
        price: 1,
        total: 1,
        clientPrice: 1,
        expectedAmount: 1,
      })
    );
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(purchaseStore.get(purchaseId)!.state).toBe("DONE");
    // Server retrieved the actual paid amount from Razorpay (not from the client)
    expect(mockPaymentsFetch).toHaveBeenCalledWith(paymentId);
  });

  it("rejects even when the client sends an amount matching the paid amount but not the authoritative amount", async () => {
    const { purchaseId, razorpayOrderId, authoritativeAmountInPaise } =
      await runLifecycleToOrderCreated();

    const paymentId = "pay_colluding_client";
    mockPaymentsFetch.mockImplementation((pid: string) => ({
      ...defaultPaymentFetchResponse(pid),
      amount: authoritativeAmountInPaise - 1,
    }));

    const res = await postVerify(
      mockRequest({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature(razorpayOrderId, paymentId),
        // Client "confirms" the wrong amount — must not become authoritative
        amount: authoritativeAmountInPaise - 1,
        expectedAmount: authoritativeAmountInPaise - 1,
      })
    );
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(purchaseStore.get(purchaseId)!.state).toBe("ORDER_CREATED");
  });

  // ============================================================
  // D. Signature verification remains enforced first
  // ============================================================

  it("still rejects an invalid signature before any amount verification happens", async () => {
    const { purchaseId, razorpayOrderId } = await runLifecycleToOrderCreated();

    const paymentId = "pay_bad_signature";
    const res = await postVerify(
      mockRequest({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: "deadbeef_invalid_signature",
      })
    );
    const data = await res.json();

    expect(data.success).toBe(false);

    // Signature gate precedes the amount check: no Razorpay payment fetch
    expect(mockPaymentsFetch).not.toHaveBeenCalled();

    // State untouched, no mismatch event fired either
    expect(purchaseStore.get(purchaseId)!.state).toBe("ORDER_CREATED");
    const repo = await getPurchaseRepository();
    const events = await repo.listAuditEvents(purchaseId);
    expect(events.some((e) => e.eventType === "PAYMENT_AMOUNT_MISMATCH")).toBe(false);
  });

  it("rejects when a tampered payment ID invalidates the signature, even with a matching amount", async () => {
    const { purchaseId, razorpayOrderId } = await runLifecycleToOrderCreated();

    const paymentId = "pay_signed";
    const tamperedPaymentId = "pay_tampered";
    const res = await postVerify(
      mockRequest({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: tamperedPaymentId,
        // Signature computed for the ORIGINAL payment id — invalid for the tampered one
        razorpay_signature: validSignature(razorpayOrderId, paymentId),
      })
    );
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(purchaseStore.get(purchaseId)!.state).toBe("ORDER_CREATED");
  });

  // ============================================================
  // E. Missing/invalid authoritative state → fail closed
  // ============================================================

  it("fails closed when the bound merchant offer no longer exists", async () => {
    // Hand-craft a purchase whose bound offer cannot be resolved
    const purchase = purchaseStore.create(
      "test-orphan-offer",
      TEST_PRODUCT_ID,
      "offer_does_not_exist"
    );
    purchaseStore.updateState("test-orphan-offer", "CONFIRMING");
    purchaseStore.approve("test-orphan-offer");
    purchaseStore.setRazorpayOrder("test-orphan-offer", "order_orphan_offer");

    const paymentId = "pay_orphan_offer";
    const res = await postVerify(
      mockRequest({
        razorpay_order_id: "order_orphan_offer",
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature("order_orphan_offer", paymentId),
      })
    );
    const data = await res.json();

    expect(data.success).toBe(false);
    // NOT marked PAID or DONE
    expect(purchase.state).toBe("ORDER_CREATED");
    // No payment fetch reached the comparison stage with a wrong amount
    // (fetch may have happened, but no success transition is possible)
    const repo = await getPurchaseRepository();
    const events = await repo.listAuditEvents("test-orphan-offer");
    expect(events.some((e) => e.eventType === "PAYMENT_VERIFIED")).toBe(false);
    expect(events.some((e) => e.eventType === "PURCHASE_COMPLETED")).toBe(false);
  });

  it("fails closed when the catalog product cannot be resolved", async () => {
    purchaseStore.create("test-orphan-product", "product-does-not-exist");
    purchaseStore.updateState("test-orphan-product", "CONFIRMING");
    purchaseStore.approve("test-orphan-product");
    purchaseStore.setRazorpayOrder("test-orphan-product", "order_orphan_product");

    const paymentId = "pay_orphan_product";
    const res = await postVerify(
      mockRequest({
        razorpay_order_id: "order_orphan_product",
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature("order_orphan_product", paymentId),
      })
    );
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(purchaseStore.get("test-orphan-product")!.state).toBe("ORDER_CREATED");
    expect(purchaseStore.get("test-orphan-product")!.razorpayPaymentId).toBeNull();
  });

  it("fails closed when Razorpay payment cannot be retrieved", async () => {
    const { purchaseId, razorpayOrderId } = await runLifecycleToOrderCreated();

    mockPaymentsFetch.mockRejectedValue(new Error("razorpay unavailable"));

    const paymentId = "pay_fetch_fails";
    const res = await postVerify(
      mockRequest({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature(razorpayOrderId, paymentId),
      })
    );
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(purchaseStore.get(purchaseId)!.state).toBe("ORDER_CREATED");
    const repo = await getPurchaseRepository();
    const events = await repo.listAuditEvents(purchaseId);
    expect(events.some((e) => e.eventType === "PAYMENT_VERIFIED")).toBe(false);
  });

  it("rejects when the fetched payment belongs to a different Razorpay order", async () => {
    const { purchaseId, razorpayOrderId } = await runLifecycleToOrderCreated();

    const paymentId = "pay_cross_order";
    mockPaymentsFetch.mockImplementation((pid: string) => ({
      ...defaultPaymentFetchResponse(pid),
      order_id: "order_some_other_order",
    }));

    const res = await postVerify(
      mockRequest({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature(razorpayOrderId, paymentId),
      })
    );
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(purchaseStore.get(purchaseId)!.state).toBe("ORDER_CREATED");
  });
});
