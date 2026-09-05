// ============================================================
// DecisionCart — Payment Persistence Correctness Tests
// Verifies that /api/payment/verify never reports success or marks
// a purchase PAID/DONE unless authoritative persistence has succeeded.
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

import { POST as postCreate } from "@/app/api/purchase/create/route";
import { POST as postConfirm } from "@/app/api/purchase/confirm/route";
import { POST as postApprove } from "@/app/api/purchase/approve/route";
import { POST as postCreateOrder } from "@/app/api/payment/create-order/route";
import { POST as postVerify } from "@/app/api/payment/verify/route";

function mockRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest;
}

const TEST_PRODUCT_ID = "phone-001";
const TEST_CATEGORY = "smartphone";
const TEST_KEY_ID = "test_key_id";
const TEST_KEY_SECRET = "test_key_secret";

function validSignature(orderId: string, paymentId: string): string {
  return crypto
    .createHmac("sha256", TEST_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

let orderSeq = 0;
let lastCreatedOrder: { id: string; amount: number; currency: string } | null = null;

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

async function runLifecycleToOrderCreated(offerId?: string) {
  const body: Record<string, unknown> = {
    productId: TEST_PRODUCT_ID,
    category: TEST_CATEGORY,
  };
  if (offerId !== undefined) body.offerId = offerId;

  const createRes = await postCreate(mockRequest(body));
  const createData = await createRes.json();
  if (!createData.success) throw new Error(`Create failed: ${createData.error}`);

  const confirmRes = await postConfirm(mockRequest({ purchaseId: createData.purchaseId }));
  const confirmData = await confirmRes.json();
  if (!confirmData.success) throw new Error(`Confirm failed: ${confirmData.error}`);

  const approveRes = await postApprove(mockRequest({ purchaseId: createData.purchaseId }));
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

describe("Payment Persistence Correctness", () => {
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

    mockOrdersCreate.mockClear();
    mockPaymentsFetch.mockClear();

    mockOrdersCreate.mockImplementation((opts: { amount: number; currency: string }) => {
      orderSeq += 1;
      lastCreatedOrder = {
        id: `order_persist_test_${orderSeq}`,
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

  it("persists a verified payment and reaches DONE with server-authoritative receipt fields", async () => {
    const { purchaseId, razorpayOrderId } = await runLifecycleToOrderCreated();

    const paymentId = "pay_persist_success";
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

    const purchase = purchaseStore.get(purchaseId);
    expect(purchase!.state).toBe("DONE");
    expect(purchase!.razorpayPaymentId).toBe(paymentId);

    expect(data.receipt).toBeDefined();
    expect(data.receipt.purchaseId).toBe(purchaseId);
    expect(data.receipt.productId).toBe(TEST_PRODUCT_ID);
    expect(data.receipt.trustedAmount).toBeGreaterThan(0);
    expect(data.receipt.currency).toBe("INR");
    expect(data.receipt.razorpayOrderId).toBe(razorpayOrderId);
    expect(data.receipt.razorpayPaymentId).toBe(paymentId);
    expect(data.receipt.dataSource).toBe("DecisionCart demo catalog");

    const repo = await getPurchaseRepository();
    const events = await repo.listAuditEvents(purchaseId);
    expect(events.some((e) => e.eventType === "PAYMENT_PERSISTENCE_SUCCESS")).toBe(true);
    expect(events.some((e) => e.eventType === "PAYMENT_PERSISTENCE_FAILED")).toBe(false);
  });

  it("does NOT return success when verified payment persistence fails", async () => {
    const { razorpayOrderId } = await runLifecycleToOrderCreated();

    const repo = await getPurchaseRepository();
    vi.spyOn(repo, "finalizeVerifiedPayment").mockImplementation(
      async () => { throw new Error("persistence failure"); }
    );

    const paymentId = "pay_persist_failed";
    const res = await postVerify(
      mockRequest({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature(razorpayOrderId, paymentId),
      })
    );
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.message).toContain("final purchase recording failed");
  });

  it("does NOT mark the purchase PAID or DONE when persistence fails", async () => {
    const { purchaseId, razorpayOrderId } = await runLifecycleToOrderCreated();

    const repo = await getPurchaseRepository();
    vi.spyOn(repo, "finalizeVerifiedPayment").mockImplementation(
      async () => { throw new Error("persistence failure"); }
    );

    const paymentId = "pay_persist_no_done";
    const res = await postVerify(
      mockRequest({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature(razorpayOrderId, paymentId),
      })
    );
    await res.json();

    const purchase = purchaseStore.get(purchaseId);
    expect(purchase!.state).toBe("ORDER_CREATED");
    expect(purchase!.state).not.toBe("PAID");
    expect(purchase!.state).not.toBe("DONE");
    expect(purchase!.razorpayPaymentId).toBeNull();
  });

  it("returns the already-persisted successful result on retry after persistence succeeded", async () => {
    const { purchaseId, razorpayOrderId } = await runLifecycleToOrderCreated();

    const paymentId = "pay_persist_idem";
    const first = await postVerify(
      mockRequest({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature(razorpayOrderId, paymentId),
      })
    );
    const firstData = await first.json();
    expect(firstData.success).toBe(true);
    expect(purchaseStore.get(purchaseId)!.state).toBe("DONE");

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

  it("does not duplicate payment success/audit records on repeated verification", async () => {
    const { purchaseId, razorpayOrderId } = await runLifecycleToOrderCreated();

    const paymentId = "pay_persist_no_dup";

    await postVerify(
      mockRequest({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature(razorpayOrderId, paymentId),
      })
    );

    await postVerify(
      mockRequest({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature(razorpayOrderId, paymentId),
      })
    );

    const repo = await getPurchaseRepository();
    const events = await repo.listAuditEvents(purchaseId);
    const persistenceSuccessCount = events.filter(
      (e) => e.eventType === "PAYMENT_PERSISTENCE_SUCCESS"
    ).length;
    const persistenceFailedCount = events.filter(
      (e) => e.eventType === "PAYMENT_PERSISTENCE_FAILED"
    ).length;

    expect(persistenceSuccessCount).toBe(1);
    expect(persistenceFailedCount).toBe(0);
  });

  it("rejects a different payment ID after the purchase is already complete", async () => {
    const { razorpayOrderId } = await runLifecycleToOrderCreated();
    const paymentId = "pay_persist_original";

    const first = await postVerify(
      mockRequest({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature(razorpayOrderId, paymentId),
      })
    );
    expect((await first.json()).success).toBe(true);

    const replacementPaymentId = "pay_persist_replacement";
    const retry = await postVerify(
      mockRequest({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: replacementPaymentId,
        razorpay_signature: validSignature(
          razorpayOrderId,
          replacementPaymentId
        ),
      })
    );
    const retryData = await retry.json();

    expect(retryData.success).toBe(false);
    expect(retry.status).toBe(409);
  });

  it("leaves a verified payment safely recoverable after local persistence failure", async () => {
    const { purchaseId, razorpayOrderId } = await runLifecycleToOrderCreated();

    const repo = await getPurchaseRepository();
    vi.spyOn(repo, "finalizeVerifiedPayment").mockImplementation(
      async () => { throw new Error("persistence failure"); }
    );

    const paymentId = "pay_persist_recoverable";
    await postVerify(
      mockRequest({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: validSignature(razorpayOrderId, paymentId),
      })
    );

    const purchase = purchaseStore.get(purchaseId);
    expect(purchase).not.toBeNull();
    expect(purchase!.state).toBe("ORDER_CREATED");
    expect(purchase!.razorpayOrderId).toBe(razorpayOrderId);

    const events = await repo.listAuditEvents(purchaseId);
    expect(
      events.some(
        (e) =>
          e.eventType === "PAYMENT_PERSISTENCE_FAILED" &&
          e.metadata.razorpayPaymentId === paymentId
      )
    ).toBe(true);
  });

  it("can safely retry after a transient local persistence failure", async () => {
    const { purchaseId, razorpayOrderId } = await runLifecycleToOrderCreated();
    const repo = await getPurchaseRepository();
    const finalize = vi.spyOn(repo, "finalizeVerifiedPayment");
    finalize.mockRejectedValueOnce(new Error("transient persistence failure"));

    const paymentId = "pay_persist_retry";
    const requestBody = {
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: validSignature(razorpayOrderId, paymentId),
    };

    const first = await postVerify(mockRequest(requestBody));
    expect((await first.json()).success).toBe(false);
    expect(purchaseStore.get(purchaseId)!.state).toBe("ORDER_CREATED");

    finalize.mockRestore();
    const second = await postVerify(mockRequest(requestBody));
    const secondData = await second.json();

    expect(secondData.success).toBe(true);
    expect(purchaseStore.get(purchaseId)!.state).toBe("DONE");
  });

  it("still rejects an amount mismatch without marking the purchase PAID/DONE", async () => {
    const { purchaseId, razorpayOrderId, authoritativeAmountInPaise } =
      await runLifecycleToOrderCreated();

    const paymentId = "pay_amount_mismatch";
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
    expect(purchaseStore.get(purchaseId)!.state).toBe("ORDER_CREATED");
    expect(purchaseStore.get(purchaseId)!.razorpayPaymentId).toBeNull();

    const repo = await getPurchaseRepository();
    const events = await repo.listAuditEvents(purchaseId);
    expect(events.some((e) => e.eventType === "PAYMENT_AMOUNT_MISMATCH")).toBe(true);
    expect(events.some((e) => e.eventType === "PAYMENT_PERSISTENCE_SUCCESS")).toBe(false);
  });

  it("still blocks order creation when the bound merchant offer price changed after approval", async () => {
    const merchantRepo = await getMerchantRepository();
    const offers = await merchantRepo.getOffersByProduct(TEST_PRODUCT_ID);
    const offer: MerchantOffer = offers.find(
      (o) => o.isAvailable && o.stock > 0 && o.price > 0
    )!;
    const originalPrice = offer.price;
    const newPrice = originalPrice - 5000;

    const createRes = await postCreate(
      mockRequest({ productId: TEST_PRODUCT_ID, category: TEST_CATEGORY, offerId: offer.id })
    );
    const createData = await createRes.json();
    expect(createData.success).toBe(true);

    const confirmRes = await postConfirm(mockRequest({ purchaseId: createData.purchaseId }));
    expect((await confirmRes.json()).success).toBe(true);

    const approveRes = await postApprove(mockRequest({ purchaseId: createData.purchaseId }));
    const approveData = await approveRes.json();
    expect(approveData.success).toBe(true);

    // At this point the purchase is APPROVED and the approval snapshot has
    // been recorded by the approve route.
    await merchantRepo.updateOfferPrice(offer.id, newPrice);

    const orderRes = await postCreateOrder(
      mockRequest({
        productId: TEST_PRODUCT_ID,
        category: TEST_CATEGORY,
        purchaseId: createData.purchaseId as string,
        offerId: offer.id,
      })
    );
    const orderData = await orderRes.json();

    expect(orderData.success).toBe(false);
    expect(orderData.error.toLowerCase()).toContain("could not be validated");
    expect(purchaseStore.get(createData.purchaseId as string)!.state).toBe("EXPIRED");
  });

  it("still fails safely on an invalid Razorpay signature before any persistence", async () => {
    const { purchaseId, razorpayOrderId } = await runLifecycleToOrderCreated();

    const paymentId = "pay_bad_sig";
    const res = await postVerify(
      mockRequest({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: "deadbeef_invalid_signature",
      })
    );
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(purchaseStore.get(purchaseId)!.state).toBe("ORDER_CREATED");
    expect(purchaseStore.get(purchaseId)!.razorpayPaymentId).toBeNull();

    const repo = await getPurchaseRepository();
    const events = await repo.listAuditEvents(purchaseId);
    expect(events.some((e) => e.eventType === "PAYMENT_PERSISTENCE_SUCCESS")).toBe(false);
    expect(events.some((e) => e.eventType === "PAYMENT_PERSISTENCE_FAILED")).toBe(false);
  });
});
