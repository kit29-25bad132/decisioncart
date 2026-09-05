import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { purchaseStore } from "@/engine/purchase-state-machine";
import {
  getPurchaseRepository,
  resetPurchaseRepository,
} from "@/engine/purchase-repository";
import { resetMerchantRepository } from "@/merchant/merchant-repository";

const mockOrdersCreate = vi.hoisted(() => vi.fn());

vi.mock("razorpay", () => ({
  default: class MockRazorpay {
    orders = {
      create: (...args: unknown[]) => mockOrdersCreate(...args),
    };
  },
}));

import { POST as postCreate } from "@/app/api/purchase/create/route";
import { POST as postConfirm } from "@/app/api/purchase/confirm/route";
import { POST as postApprove } from "@/app/api/purchase/approve/route";
import { POST as postCreateOrder } from "@/app/api/payment/create-order/route";
import { POST as postWebhook } from "./route";

const WEBHOOK_SECRET = "test_webhook_secret";
const KEY_ID = "test_key_id";
const KEY_SECRET = "test_key_secret";

function request(body: string, signature?: string): NextRequest {
  const headers = new Headers();
  if (signature) headers.set("x-razorpay-signature", signature);
  return {
    headers,
    text: async () => body,
    json: async () => JSON.parse(body),
  } as unknown as NextRequest;
}

function signed(body: string): string {
  return crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(body)
    .digest("hex");
}

let orderNumber = 0;
let lastOrder: { id: string; amount: number; currency: string } | null = null;

async function createOrderCreatedPurchase() {
  const createdResponse = await postCreate(
    request(JSON.stringify({ productId: "phone-001", category: "smartphone" }))
  );
  const created = await createdResponse.json();
  await postConfirm(request(JSON.stringify({ purchaseId: created.purchaseId })));
  await postApprove(request(JSON.stringify({ purchaseId: created.purchaseId })));

  const orderResponse = await postCreateOrder(
    request(
      JSON.stringify({
        productId: "phone-001",
        category: "smartphone",
        purchaseId: created.purchaseId,
      })
    )
  );
  const order = await orderResponse.json();
  return {
    purchaseId: created.purchaseId as string,
    orderId: order.order.id as string,
    amount: order.order.amount as number,
  };
}

function webhookBody(
  orderId: string,
  paymentId: string,
  amount: number,
  event = "payment.captured"
): string {
  return JSON.stringify({
    event,
    payload: {
      payment: {
        entity: {
          id: paymentId,
          order_id: orderId,
          amount,
          status: "captured",
        },
      },
    },
  });
}

describe("Razorpay payment webhook", () => {
  beforeEach(() => {
    purchaseStore.clear();
    resetPurchaseRepository();
    resetMerchantRepository();
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.RAZORPAY_KEY_ID = KEY_ID;
    process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
    orderNumber = 0;
    lastOrder = null;
    mockOrdersCreate.mockImplementation((options: { amount: number; currency: string }) => {
      orderNumber += 1;
      lastOrder = {
        id: `order_webhook_${orderNumber}`,
        amount: options.amount,
        currency: options.currency,
      };
      return { ...lastOrder };
    });
  });

  afterEach(() => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    vi.restoreAllMocks();
  });

  it("reconciles a valid signed captured payment", async () => {
    const lifecycle = await createOrderCreatedPurchase();
    const body = webhookBody(lifecycle.orderId, "pay_webhook_1", lifecycle.amount);
    const response = await postWebhook(request(body, signed(body)));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true, acknowledged: true, reconciled: true });
    expect(purchaseStore.get(lifecycle.purchaseId)?.state).toBe("DONE");
  });

  it("rejects an invalid signature without mutation", async () => {
    const lifecycle = await createOrderCreatedPurchase();
    const body = webhookBody(lifecycle.orderId, "pay_webhook_bad", lifecycle.amount);
    const response = await postWebhook(request(body, "invalid"));

    expect(response.status).toBe(400);
    expect(purchaseStore.get(lifecycle.purchaseId)?.state).toBe("ORDER_CREATED");
  });

  it("rejects a missing signature", async () => {
    const lifecycle = await createOrderCreatedPurchase();
    const body = webhookBody(lifecycle.orderId, "pay_webhook_missing", lifecycle.amount);
    const response = await postWebhook(request(body));

    expect(response.status).toBe(400);
    expect(purchaseStore.get(lifecycle.purchaseId)?.state).toBe("ORDER_CREATED");
  });

  it("rejects malformed signed bodies safely", async () => {
    const body = "{not-json";
    const response = await postWebhook(request(body, signed(body)));

    expect(response.status).toBe(400);
  });

  it("acknowledges unsupported signed events without mutation", async () => {
    const lifecycle = await createOrderCreatedPurchase();
    const body = webhookBody(
      lifecycle.orderId,
      "pay_webhook_unsupported",
      lifecycle.amount,
      "payment.failed"
    );
    const response = await postWebhook(request(body, signed(body)));

    expect(response.status).toBe(200);
    expect((await response.json()).acknowledged).toBe(true);
    expect(purchaseStore.get(lifecycle.purchaseId)?.state).toBe("ORDER_CREATED");
  });

  it("is idempotent for duplicate successful delivery", async () => {
    const lifecycle = await createOrderCreatedPurchase();
    const body = webhookBody(lifecycle.orderId, "pay_webhook_duplicate", lifecycle.amount);
    await postWebhook(request(body, signed(body)));
    const second = await postWebhook(request(body, signed(body)));

    expect(second.status).toBe(200);
    expect((await second.json()).reconciled).toBe(false);
    expect(purchaseStore.get(lifecycle.purchaseId)?.razorpayPaymentId).toBe(
      "pay_webhook_duplicate"
    );
  });

  it("does not overwrite a completed purchase with another payment ID", async () => {
    const lifecycle = await createOrderCreatedPurchase();
    const firstBody = webhookBody(lifecycle.orderId, "pay_webhook_original", lifecycle.amount);
    await postWebhook(request(firstBody, signed(firstBody)));

    const conflictingBody = webhookBody(
      lifecycle.orderId,
      "pay_webhook_conflict",
      lifecycle.amount
    );
    const response = await postWebhook(
      request(conflictingBody, signed(conflictingBody))
    );

    expect(response.status).toBe(409);
    expect(purchaseStore.get(lifecycle.purchaseId)?.razorpayPaymentId).toBe(
      "pay_webhook_original"
    );
  });

  it("does not reconcile an unknown order", async () => {
    const body = webhookBody("order_unknown", "pay_unknown", 2999900);
    const response = await postWebhook(request(body, signed(body)));

    expect(response.status).toBe(404);
  });

  it("rejects a webhook amount mismatch", async () => {
    const lifecycle = await createOrderCreatedPurchase();
    const body = webhookBody(
      lifecycle.orderId,
      "pay_webhook_amount_mismatch",
      lifecycle.amount - 1
    );
    const response = await postWebhook(request(body, signed(body)));

    expect(response.status).toBe(400);
    expect(purchaseStore.get(lifecycle.purchaseId)?.state).toBe("ORDER_CREATED");
  });

  it("leaves persistence failures retryable and does not report success", async () => {
    const lifecycle = await createOrderCreatedPurchase();
    const repo = await getPurchaseRepository();
    const finalize = vi
      .spyOn(repo, "finalizeVerifiedPayment")
      .mockRejectedValueOnce(new Error("persistence failure"));
    const body = webhookBody(lifecycle.orderId, "pay_webhook_retry", lifecycle.amount);

    const failed = await postWebhook(request(body, signed(body)));
    expect(failed.status).toBe(500);
    expect(purchaseStore.get(lifecycle.purchaseId)?.state).toBe("ORDER_CREATED");

    finalize.mockRestore();
    const retried = await postWebhook(request(body, signed(body)));
    expect(retried.status).toBe(200);
    expect(purchaseStore.get(lifecycle.purchaseId)?.state).toBe("DONE");
  });

  it("fails closed when the webhook secret is absent", async () => {
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    const body = webhookBody("order_missing_secret", "pay_missing_secret", 1);
    const response = await postWebhook(request(body, signed(body)));

    expect(response.status).toBe(500);
  });
});
