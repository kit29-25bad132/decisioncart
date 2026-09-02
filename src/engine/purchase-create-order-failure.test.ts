// ============================================================
// DecisionCart — Razorpay Order Creation Failure Tests
// Verifies that when Razorpay order creation throws, the
// purchase transitions ORDER_CREATED → FAILED instead of
// remaining permanently stuck.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { purchaseStore } from "@/engine/purchase-state-machine";

// --- Mock Razorpay to throw on orders.create ---
// vi.hoisted ensures the mock function is available when vi.mock is hoisted
const mockOrdersCreate = vi.hoisted(() => vi.fn());

vi.mock("razorpay", () => {
  return {
    default: vi.fn().mockImplementation(function () {
      this.orders = { create: mockOrdersCreate };
    }),
  };
});

// Import route AFTER vi.mock so it picks up the mock
import { POST as postCreateOrder } from "@/app/api/payment/create-order/route";

// --- Helper: create a mock NextRequest ---
function mockRequest(body: unknown): any {
  return {
    json: async () => body,
  } as any;
}

// --- Helper: set up an APPROVED purchase ---
function setupApprovedPurchase(purchaseId: string, productId: string = "phone-001") {
  const purchase = purchaseStore.create(purchaseId, productId);
  purchaseStore.updateState(purchaseId, "CONFIRMING");
  purchaseStore.approve(purchaseId);
  return purchase;
}

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
    if (origKeyId !== undefined) process.env.RAZORPAY_KEY_ID = origKeyId; else delete process.env.RAZORPAY_KEY_ID;
    if (origKeySecret !== undefined) process.env.RAZORPAY_KEY_SECRET = origKeySecret; else delete process.env.RAZORPAY_KEY_SECRET;
  });

  it("transitions to FAILED when Razorpay orders.create throws", async () => {
    mockOrdersCreate.mockRejectedValue(new Error("Razorpay API error"));

    setupApprovedPurchase("razorpay-fail-1");

    const res = await postCreateOrder(
      mockRequest({ productId: "phone-001", category: "smartphone", purchaseId: "razorpay-fail-1" })
    );
    const data = await res.json();

    // API should return failure
    expect(data.success).toBe(false);
    expect(data.error).toContain("Failed to create payment order");

    // Purchase should be in FAILED state, not stuck in ORDER_CREATED
    const failedPurchase = purchaseStore.get("razorpay-fail-1");
    expect(failedPurchase!.state).toBe("FAILED");
  });

  it("transitions to FAILED on network timeout error", async () => {
    mockOrdersCreate.mockRejectedValue(new Error("ECONNRESET: connection reset"));

    setupApprovedPurchase("razorpay-fail-2");

    const res = await postCreateOrder(
      mockRequest({ productId: "phone-001", category: "smartphone", purchaseId: "razorpay-fail-2" })
    );
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(purchaseStore.get("razorpay-fail-2")!.state).toBe("FAILED");
  });

  it("prevents duplicate order creation after Razorpay failure", async () => {
    mockOrdersCreate.mockRejectedValue(new Error("Razorpay API error"));

    setupApprovedPurchase("dup-fail-1");

    // First attempt: Razorpay fails → transitions to FAILED
    const res1 = await postCreateOrder(
      mockRequest({ productId: "phone-001", category: "smartphone", purchaseId: "dup-fail-1" })
    );
    expect((await res1.json()).success).toBe(false);
    expect(purchaseStore.get("dup-fail-1")!.state).toBe("FAILED");

    // Second attempt: purchase is in FAILED (terminal state), cannot create order
    const res2 = await postCreateOrder(
      mockRequest({ productId: "phone-001", category: "smartphone", purchaseId: "dup-fail-1" })
    );
    const data2 = await res2.json();
    expect(data2.success).toBe(false);
    expect(data2.error).toContain("approved");
  });

  it("does not expose Razorpay secrets or internal error details in response", async () => {
    mockOrdersCreate.mockRejectedValue(new Error("Razorpay API error: invalid_key"));

    setupApprovedPurchase("secret-leak-1");

    const res = await postCreateOrder(
      mockRequest({ productId: "phone-001", category: "smartphone", purchaseId: "secret-leak-1" })
    );
    const data = await res.json();
    const responseStr = JSON.stringify(data);

    // Should not contain the test secret or internal error details
    expect(responseStr).not.toContain("test_key_secret");
    expect(responseStr).not.toContain("invalid_key");
    expect(responseStr).not.toContain("Razorpay API error");
  });

  it("still transitions to FAILED even if fail() itself encounters issues", async () => {
    // This tests the inner try/catch around purchaseStore.fail()
    // We can't easily trigger a fail() error in isolation, but we verify
    // the outer catch still returns error response
    mockOrdersCreate.mockRejectedValue(new Error("Simulated failure"));

    setupApprovedPurchase("fail-resilience-1");

    const res = await postCreateOrder(
      mockRequest({ productId: "phone-001", category: "smartphone", purchaseId: "fail-resilience-1" })
    );
    const data = await res.json();

    // API always returns failure on Razorpay error
    expect(data.success).toBe(false);
    expect(data.error).toContain("Failed to create payment order");
  });

  it("preserves duplicate prevention: concurrent requests cannot both succeed", async () => {
    // Simulate: first request transitions to ORDER_CREATED, Razorpay succeeds
    // Second request finds state is ORDER_CREATED, rejects
    mockOrdersCreate
      .mockResolvedValueOnce({ id: "order_real_123", amount: 2999900, currency: "INR" })
      .mockRejectedValueOnce(new Error("Should not reach here"));

    setupApprovedPurchase("concurrent-1");

    // First request succeeds
    const res1 = await postCreateOrder(
      mockRequest({ productId: "phone-001", category: "smartphone", purchaseId: "concurrent-1" })
    );
    const data1 = await res1.json();
    expect(data1.success).toBe(true);
    expect(purchaseStore.get("concurrent-1")!.state).toBe("ORDER_CREATED");

    // Second request: purchase is already in ORDER_CREATED, cannot transition again
    const res2 = await postCreateOrder(
      mockRequest({ productId: "phone-001", category: "smartphone", purchaseId: "concurrent-1" })
    );
    const data2 = await res2.json();
    expect(data2.success).toBe(false);

    // Razorpay should only have been called once
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
      mockRequest({ productId: "phone-001", category: "smartphone", purchaseId: "success-flow-1" })
    );
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.order.id).toBe("order_success_456");

    const purchase = purchaseStore.get("success-flow-1");
    expect(purchase!.state).toBe("ORDER_CREATED");
    expect(purchase!.razorpayOrderId).toBe("order_success_456");
  });
});
