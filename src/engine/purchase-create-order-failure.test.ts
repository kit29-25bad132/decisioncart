// ============================================================
// DecisionCart — Razorpay Order Creation Failure Tests
// Verifies that when Razorpay order creation throws, the
// purchase transitions ORDER_CREATED → FAILED instead of
// remaining permanently stuck.
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

// ============================================================
// Mock Razorpay
// ============================================================

const mockOrdersCreate = vi.hoisted(() => vi.fn());

vi.mock("razorpay", () => ({
  default: class MockRazorpay {
    orders = {
      create: (...args: unknown[]) => mockOrdersCreate(...args),
    };
  },
}));

// Import route AFTER vi.mock so it uses the mocked Razorpay.
import { POST as postCreateOrder } from "@/app/api/payment/create-order/route";

// ============================================================
// Helpers
// ============================================================

function mockRequest(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/payment/create-order",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
}

function setupApprovedPurchase(
  purchaseId: string,
  productId: string = "phone-001"
) {
  const purchase = purchaseStore.create(purchaseId, productId);

  purchaseStore.updateState(purchaseId, "CONFIRMING");
  purchaseStore.approve(purchaseId);

  return purchase;
}

// ============================================================
// Tests
// ============================================================

describe("Razorpay Order Creation Failure Recovery", () => {
  const origKeyId = process.env.RAZORPAY_KEY_ID;
  const origKeySecret = process.env.RAZORPAY_KEY_SECRET;

  beforeEach(() => {
    purchaseStore.clear();

    process.env.RAZORPAY_KEY_ID = "test_key_id";
    process.env.RAZORPAY_KEY_SECRET = "test_key_secret";

    mockOrdersCreate.mockReset();
  });

  afterEach(() => {
    if (origKeyId !== undefined) {
      process.env.RAZORPAY_KEY_ID = origKeyId;
    } else {
      delete process.env.RAZORPAY_KEY_ID;
    }

    if (origKeySecret !== undefined) {
      process.env.RAZORPAY_KEY_SECRET = origKeySecret;
    } else {
      delete process.env.RAZORPAY_KEY_SECRET;
    }
  });

  it("transitions to FAILED when Razorpay orders.create throws", async () => {
    mockOrdersCreate.mockRejectedValue(
      new Error("Razorpay API error")
    );

    setupApprovedPurchase("razorpay-fail-1");

    const res = await postCreateOrder(
      mockRequest({
        productId: "phone-001",
        category: "smartphone",
        purchaseId: "razorpay-fail-1",
      })
    );

    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("Failed to create payment order");

    const failedPurchase = purchaseStore.get("razorpay-fail-1");

    expect(failedPurchase?.state).toBe("FAILED");
  });

  it("transitions to FAILED on network timeout error", async () => {
    mockOrdersCreate.mockRejectedValue(
      new Error("ECONNRESET: connection reset")
    );

    setupApprovedPurchase("razorpay-fail-2");

    const res = await postCreateOrder(
      mockRequest({
        productId: "phone-001",
        category: "smartphone",
        purchaseId: "razorpay-fail-2",
      })
    );

    const data = await res.json();

    expect(data.success).toBe(false);
    expect(purchaseStore.get("razorpay-fail-2")?.state).toBe("FAILED");
  });

  it("prevents duplicate order creation after Razorpay failure", async () => {
    mockOrdersCreate.mockRejectedValue(
      new Error("Razorpay API error")
    );

    setupApprovedPurchase("dup-fail-1");

    const res1 = await postCreateOrder(
      mockRequest({
        productId: "phone-001",
        category: "smartphone",
        purchaseId: "dup-fail-1",
      })
    );

    const data1 = await res1.json();

    expect(data1.success).toBe(false);
    expect(purchaseStore.get("dup-fail-1")?.state).toBe("FAILED");

    const res2 = await postCreateOrder(
      mockRequest({
        productId: "phone-001",
        category: "smartphone",
        purchaseId: "dup-fail-1",
      })
    );

    const data2 = await res2.json();

    expect(data2.success).toBe(false);
    expect(data2.error).toContain("approved");
  });

  it("does not expose Razorpay secrets or internal error details", async () => {
    mockOrdersCreate.mockRejectedValue(
      new Error("Razorpay API error: invalid_key")
    );

    setupApprovedPurchase("secret-leak-1");

    const res = await postCreateOrder(
      mockRequest({
        productId: "phone-001",
        category: "smartphone",
        purchaseId: "secret-leak-1",
      })
    );

    const data = await res.json();
    const responseString = JSON.stringify(data);

    expect(responseString).not.toContain("test_key_secret");
    expect(responseString).not.toContain("invalid_key");
    expect(responseString).not.toContain("Razorpay API error");
  });

  it("still returns a failure response when Razorpay fails", async () => {
    mockOrdersCreate.mockRejectedValue(
      new Error("Simulated failure")
    );

    setupApprovedPurchase("fail-resilience-1");

    const res = await postCreateOrder(
      mockRequest({
        productId: "phone-001",
        category: "smartphone",
        purchaseId: "fail-resilience-1",
      })
    );

    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("Failed to create payment order");
  });

  it("prevents duplicate order creation after success", async () => {
    mockOrdersCreate.mockResolvedValueOnce({
      id: "order_real_123",
      amount: 2999900,
      currency: "INR",
    });

    setupApprovedPurchase("concurrent-1");

    const res1 = await postCreateOrder(
      mockRequest({
        productId: "phone-001",
        category: "smartphone",
        purchaseId: "concurrent-1",
      })
    );

    const data1 = await res1.json();

    expect(data1.success).toBe(true);
    expect(
      purchaseStore.get("concurrent-1")?.state
    ).toBe("ORDER_CREATED");

    const res2 = await postCreateOrder(
      mockRequest({
        productId: "phone-001",
        category: "smartphone",
        purchaseId: "concurrent-1",
      })
    );

    const data2 = await res2.json();

    expect(data2.success).toBe(false);
    expect(mockOrdersCreate).toHaveBeenCalledTimes(1);
  });

  it("preserves normal successful order creation flow", async () => {
    mockOrdersCreate.mockResolvedValue({
      id: "order_success_456",
      amount: 2999900,
      currency: "INR",
    });

    setupApprovedPurchase("success-flow-1");

    const res = await postCreateOrder(
      mockRequest({
        productId: "phone-001",
        category: "smartphone",
        purchaseId: "success-flow-1",
      })
    );

    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.order.id).toBe("order_success_456");

    const purchase = purchaseStore.get("success-flow-1");

    expect(purchase?.state).toBe("ORDER_CREATED");
    expect(purchase?.razorpayOrderId).toBe(
      "order_success_456"
    );
  });
});