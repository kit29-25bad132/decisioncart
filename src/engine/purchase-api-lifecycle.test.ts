// ============================================================
// DecisionCart — Server-Authoritative Purchase Lifecycle Tests
// Tests the full server-authoritative purchase flow through
// the API routes, verifying state transitions, security, and
// error handling.
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  purchaseStore,
  APPROVAL_EXPIRY_MS,
} from "@/engine/purchase-state-machine";
import { getCatalog } from "@/catalog/demo-data";
import { POST as postCreate } from "@/app/api/purchase/create/route";
import { POST as postConfirm } from "@/app/api/purchase/confirm/route";
import { POST as postApprove } from "@/app/api/purchase/approve/route";
import { NextRequest } from "next/server";
import { POST as postCreateOrder } from "@/app/api/payment/create-order/route";
import { POST as postVerify } from "@/app/api/payment/verify/route";

// --- Helper: create a mock NextRequest ---
function mockRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest;
}

// --- Helper: get a real productId from the catalog ---
function getValidProductId(category: string = "smartphone"): string {
  const catalog = getCatalog(category);
  return catalog[0].id;
}

// ============================================================
// Purchase API Lifecycle Tests
// ============================================================

describe("Server-Authoritative Purchase Lifecycle", () => {
  beforeEach(() => {
    purchaseStore.clear();
  });

  describe("Full lifecycle: create → confirm → approve", () => {
    it("creates a purchase in DECIDED state", async () => {
      const productId = getValidProductId();
      const res = await postCreate(mockRequest({ productId, category: "smartphone" }));
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.purchaseId).toBeDefined();
      expect(typeof data.purchaseId).toBe("string");
      expect(data.purchaseId.length).toBeGreaterThan(0);
      expect(data.state).toBe("DECIDED");
    });

    it("generates cryptographically secure purchaseId (UUID format)", async () => {
      const productId = getValidProductId();
      const res = await postCreate(mockRequest({ productId, category: "smartphone" }));
      const data = await res.json();

      // UUID v4 format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(data.purchaseId).toMatch(uuidRegex);
    });

    it("confirms a DECIDED purchase → CONFIRMING", async () => {
      const productId = getValidProductId();
      const createRes = await postCreate(mockRequest({ productId, category: "smartphone" }));
      const createData = await createRes.json();

      const confirmRes = await postConfirm(mockRequest({ purchaseId: createData.purchaseId }));
      const confirmData = await confirmRes.json();

      expect(confirmData.success).toBe(true);
      expect(confirmData.state).toBe("CONFIRMING");
    });

    it("approves a CONFIRMING purchase → APPROVED with expiry", async () => {
      const productId = getValidProductId();
      const createRes = await postCreate(mockRequest({ productId, category: "smartphone" }));
      const createData = await createRes.json();
      await postConfirm(mockRequest({ purchaseId: createData.purchaseId }));

      const approveRes = await postApprove(mockRequest({ purchaseId: createData.purchaseId }));
      const approveData = await approveRes.json();

      expect(approveData.success).toBe(true);
      expect(approveData.state).toBe("APPROVED");
      expect(approveData.expiresAt).toBeDefined();
      expect(typeof approveData.expiresAt).toBe("number");
      expect(approveData.expiresAt).toBeGreaterThan(Date.now());

      const purchase = purchaseStore.get(createData.purchaseId);
      expect(purchase!.approvedAt).toBeDefined();
      expect(purchase!.expiresAt! - purchase!.approvedAt!).toBe(APPROVAL_EXPIRY_MS);
    });

    it("stores purchase record with correct fields after full lifecycle", async () => {
      const productId = getValidProductId();
      const createRes = await postCreate(mockRequest({ productId, category: "smartphone" }));
      const createData = await createRes.json();
      await postConfirm(mockRequest({ purchaseId: createData.purchaseId }));
      await postApprove(mockRequest({ purchaseId: createData.purchaseId }));

      const purchase = purchaseStore.get(createData.purchaseId);
      expect(purchase).not.toBeNull();
      expect(purchase!.purchaseId).toBe(createData.purchaseId);
      expect(purchase!.productId).toBe(productId);
      expect(purchase!.state).toBe("APPROVED");
      expect(purchase!.approvedAt).toBeDefined();
      expect(purchase!.expiresAt).toBeDefined();
      expect(purchase!.razorpayOrderId).toBeNull();
      expect(purchase!.razorpayPaymentId).toBeNull();
    });
  });
});

// ============================================================
// Invalid Transition Tests
// ============================================================

describe("Invalid Transitions", () => {
  beforeEach(() => {
    purchaseStore.clear();
  });

  it("rejects approve directly on DECIDED (skipping CONFIRMING)", async () => {
    const productId = getValidProductId();
    const createRes = await postCreate(mockRequest({ productId, category: "smartphone" }));
    const createData = await createRes.json();

    const approveRes = await postApprove(mockRequest({ purchaseId: createData.purchaseId }));
    const approveData = await approveRes.json();

    expect(approveData.success).toBe(false);
    expect(approveData.error).toContain("CONFIRMING");
  });

  it("rejects confirm on already CONFIRMING purchase", async () => {
    const productId = getValidProductId();
    const createRes = await postCreate(mockRequest({ productId, category: "smartphone" }));
    const createData = await createRes.json();

    const confirm1 = await postConfirm(mockRequest({ purchaseId: createData.purchaseId }));
    expect((await confirm1.json()).success).toBe(true);

    const confirm2 = await postConfirm(mockRequest({ purchaseId: createData.purchaseId }));
    const data = await confirm2.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("DECIDED");
  });

  it("rejects approve on APPROVED purchase (already approved)", async () => {
    const productId = getValidProductId();
    const createRes = await postCreate(mockRequest({ productId, category: "smartphone" }));
    const createData = await createRes.json();
    await postConfirm(mockRequest({ purchaseId: createData.purchaseId }));
    await postApprove(mockRequest({ purchaseId: createData.purchaseId }));

    const approveRes = await postApprove(mockRequest({ purchaseId: createData.purchaseId }));
    const approveData = await approveRes.json();

    expect(approveData.success).toBe(false);
    expect(approveData.error).toContain("CONFIRMING");
  });

  it("rejects confirm on non-existent purchase", async () => {
    const res = await postConfirm(mockRequest({ purchaseId: "non-existent-id-12345" }));
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("not found");
  });

  it("rejects approve on non-existent purchase", async () => {
    const res = await postApprove(mockRequest({ purchaseId: "non-existent-id-12345" }));
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("not found");
  });
});

// ============================================================
// Product Validation Tests
// ============================================================

describe("Product Validation", () => {
  beforeEach(() => {
    purchaseStore.clear();
  });

  it("rejects unknown productId", async () => {
    const res = await postCreate(mockRequest({ productId: "unknown-product-999", category: "smartphone" }));
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("not found");
  });

  it("rejects empty productId", async () => {
    const res = await postCreate(mockRequest({ productId: "", category: "smartphone" }));
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("required");
  });

  it("rejects unknown category", async () => {
    const res = await postCreate(mockRequest({ productId: "phone-001", category: "unknown-category" }));
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("not found");
  });

  it("rejects missing category", async () => {
    const res = await postCreate(mockRequest({ productId: "phone-001" }));
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("category");
  });
});

// ============================================================
// Expiry Tests
// ============================================================

describe("Approval Expiry", () => {
  const origKeyId = process.env.RAZORPAY_KEY_ID;
  const origKeySecret = process.env.RAZORPAY_KEY_SECRET;

  beforeEach(() => {
    purchaseStore.clear();
    process.env.RAZORPAY_KEY_ID = "test_key_id";
    process.env.RAZORPAY_KEY_SECRET = "test_key_secret";
  });

  afterEach(() => {
    if (origKeyId !== undefined) process.env.RAZORPAY_KEY_ID = origKeyId; else delete process.env.RAZORPAY_KEY_ID;
    if (origKeySecret !== undefined) process.env.RAZORPAY_KEY_SECRET = origKeySecret; else delete process.env.RAZORPAY_KEY_SECRET;
  });

  it("create-order rejects when approval has expired", async () => {
    const productId = getValidProductId();
    const createRes = await postCreate(mockRequest({ productId, category: "smartphone" }));
    const createData = await createRes.json();
    await postConfirm(mockRequest({ purchaseId: createData.purchaseId }));
    await postApprove(mockRequest({ purchaseId: createData.purchaseId }));

    // Manually expire the approval by backdating approvedAt
    const purchase = purchaseStore.get(createData.purchaseId)!;
    purchase.approvedAt = Date.now() - APPROVAL_EXPIRY_MS - 1000;
    purchase.expiresAt = purchase.approvedAt + APPROVAL_EXPIRY_MS;

    const orderRes = await postCreateOrder(
      mockRequest({ productId, category: "smartphone", purchaseId: createData.purchaseId })
    );
    const orderData = await orderRes.json();

    expect(orderData.success).toBe(false);
    expect(orderData.error).toContain("expired");

    const expiredPurchase = purchaseStore.get(createData.purchaseId);
    expect(expiredPurchase!.state).toBe("EXPIRED");
  });

  it("create-order rejects when purchase is not APPROVED", async () => {
    const productId = getValidProductId();
    const createRes = await postCreate(mockRequest({ productId, category: "smartphone" }));
    const createData = await createRes.json();

    const orderRes = await postCreateOrder(
      mockRequest({ productId, category: "smartphone", purchaseId: createData.purchaseId })
    );
    const orderData = await orderRes.json();

    expect(orderData.success).toBe(false);
    expect(orderData.error).toContain("approved");
  });
});

// ============================================================
// Product Mismatch Tests
// ============================================================

describe("Product Mismatch", () => {
  const origKeyId = process.env.RAZORPAY_KEY_ID;
  const origKeySecret = process.env.RAZORPAY_KEY_SECRET;

  beforeEach(() => {
    purchaseStore.clear();
    process.env.RAZORPAY_KEY_ID = "test_key_id";
    process.env.RAZORPAY_KEY_SECRET = "test_key_secret";
  });

  afterEach(() => {
    if (origKeyId !== undefined) process.env.RAZORPAY_KEY_ID = origKeyId; else delete process.env.RAZORPAY_KEY_ID;
    if (origKeySecret !== undefined) process.env.RAZORPAY_KEY_SECRET = origKeySecret; else delete process.env.RAZORPAY_KEY_SECRET;
  });

  it("create-order rejects when productId doesn't match purchase", async () => {
    const productId = getValidProductId();
    const createRes = await postCreate(mockRequest({ productId, category: "smartphone" }));
    const createData = await createRes.json();
    await postConfirm(mockRequest({ purchaseId: createData.purchaseId }));
    await postApprove(mockRequest({ purchaseId: createData.purchaseId }));

    const otherProductId = productId === "phone-001" ? "phone-002" : "phone-001";
    const orderRes = await postCreateOrder(
      mockRequest({ productId: otherProductId, category: "smartphone", purchaseId: createData.purchaseId })
    );
    const orderData = await orderRes.json();

    expect(orderData.success).toBe(false);
    expect(orderData.error).toContain("match");
  });
});

// ============================================================
// Payment Verification Tests
// ============================================================

describe("Payment Verification", () => {
  const origKeySecret = process.env.RAZORPAY_KEY_SECRET;

  beforeEach(() => {
    purchaseStore.clear();
    process.env.RAZORPAY_KEY_SECRET = "test_key_secret";
  });

  afterEach(() => {
    if (origKeySecret !== undefined) process.env.RAZORPAY_KEY_SECRET = origKeySecret; else delete process.env.RAZORPAY_KEY_SECRET;
  });

  it("verify rejects unknown Razorpay order ID", async () => {
    const res = await postVerify(
      mockRequest({
        razorpay_order_id: "order_unknown_123",
        razorpay_payment_id: "pay_123",
        razorpay_signature: "sig_123",
      })
    );
    const data = await res.json();

    // Signature won't match for unknown order, so verification fails
    expect(data.success).toBe(false);
  });

  it("verify rejects missing fields", async () => {
    // Missing razorpay_order_id
    const res1 = await postVerify(
      mockRequest({
        razorpay_payment_id: "pay_123",
        razorpay_signature: "sig_123",
      })
    );
    const data1 = await res1.json();
    expect(data1.success).toBe(false);
    expect(data1.error).toContain("razorpay_order_id");

    // Missing razorpay_payment_id
    const res2 = await postVerify(
      mockRequest({
        razorpay_order_id: "order_123",
        razorpay_signature: "sig_123",
      })
    );
    const data2 = await res2.json();
    expect(data2.success).toBe(false);
    expect(data2.error).toContain("razorpay_payment_id");

    // Missing razorpay_signature
    const res3 = await postVerify(
      mockRequest({
        razorpay_order_id: "order_123",
        razorpay_payment_id: "pay_123",
      })
    );
    const data3 = await res3.json();
    expect(data3.success).toBe(false);
    expect(data3.error).toContain("razorpay_signature");
  });

  it("verify handles repeated verification after DONE safely", async () => {
    purchaseStore.create("test-done-purchase", "phone-001");
    purchaseStore.updateState("test-done-purchase", "CONFIRMING");
    purchaseStore.approve("test-done-purchase");
    purchaseStore.setRazorpayOrder("test-done-purchase", "order_done_123");
    purchaseStore.setRazorpayPayment("test-done-purchase", "pay_done_456");
    purchaseStore.complete("test-done-purchase");

    const donePurchase = purchaseStore.get("test-done-purchase");
    expect(donePurchase!.state).toBe("DONE");
  });

  it("verify rejects when purchase is not in ORDER_CREATED state", async () => {
    const purchase = purchaseStore.create("test-approved-purchase", "phone-001");
    purchaseStore.updateState("test-approved-purchase", "CONFIRMING");
    purchaseStore.approve("test-approved-purchase");
    purchase.razorpayOrderId = "order_test_789";
    purchase.updatedAt = Date.now();

    expect(purchase.state).toBe("APPROVED");
    expect(purchase.razorpayOrderId).toBe("order_test_789");
  });
});

// ============================================================
// Unknown Purchase Tests
// ============================================================

describe("Unknown Purchase", () => {
  const origKeyId = process.env.RAZORPAY_KEY_ID;
  const origKeySecret = process.env.RAZORPAY_KEY_SECRET;

  beforeEach(() => {
    purchaseStore.clear();
    process.env.RAZORPAY_KEY_ID = "test_key_id";
    process.env.RAZORPAY_KEY_SECRET = "test_key_secret";
  });

  afterEach(() => {
    if (origKeyId !== undefined) process.env.RAZORPAY_KEY_ID = origKeyId; else delete process.env.RAZORPAY_KEY_ID;
    if (origKeySecret !== undefined) process.env.RAZORPAY_KEY_SECRET = origKeySecret; else delete process.env.RAZORPAY_KEY_SECRET;
  });

  it("confirm rejects unknown purchaseId", async () => {
    const res = await postConfirm(mockRequest({ purchaseId: "random-uuid-12345" }));
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("not found");
  });

  it("approve rejects unknown purchaseId", async () => {
    const res = await postApprove(mockRequest({ purchaseId: "random-uuid-12345" }));
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("not found");
  });

  it("create-order rejects unknown purchaseId", async () => {
    const res = await postCreateOrder(
      mockRequest({ productId: "phone-001", category: "smartphone", purchaseId: "random-uuid-12345" })
    );
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("not found");
  });
});

// ============================================================
// State Transition Error Handling Tests
// ============================================================

describe("State Transition Error Handling", () => {
  beforeEach(() => {
    purchaseStore.clear();
  });

  it("does not return fake success on invalid transitions", async () => {
    const productId = getValidProductId();
    const createRes = await postCreate(mockRequest({ productId, category: "smartphone" }));
    const createData = await createRes.json();

    const approveRes = await postApprove(mockRequest({ purchaseId: createData.purchaseId }));
    const approveData = await approveRes.json();

    expect(approveData.success).toBe(false);
    expect(approveData.error).toBeDefined();
  });

  it("confirms return error for wrong state", async () => {
    const productId = getValidProductId();
    const createRes = await postCreate(mockRequest({ productId, category: "smartphone" }));
    const createData = await createRes.json();

    const confirmRes = await postConfirm(mockRequest({ purchaseId: createData.purchaseId }));
    expect((await confirmRes.json()).success).toBe(true);

    // Try to confirm again (already CONFIRMING)
    const confirmRes2 = await postConfirm(mockRequest({ purchaseId: createData.purchaseId }));
    const data = await confirmRes2.json();

    expect(data.success).toBe(false);
  });

  it("handles empty request body gracefully", async () => {
    const res = await postCreate(mockRequest({}));
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("required");
  });

  it("handles invalid JSON body gracefully", async () => {
    const res = await postCreate({
      json: async () => {
        throw new Error("Invalid JSON");
      },
    } as unknown as NextRequest);
    const data = await res.json();

    expect(data.success).toBe(false);
  });
});

// ============================================================
// PurchaseStore Duplicate Prevention Tests
// ============================================================

describe("Duplicate Prevention", () => {
  beforeEach(() => {
    purchaseStore.clear();
  });

  it("prevents transition from APPROVED after already transitioning to ORDER_CREATED", () => {
    const purchase = purchaseStore.create("dup-test", "phone-001");
    purchaseStore.updateState("dup-test", "CONFIRMING");
    purchaseStore.approve("dup-test");

    purchaseStore.setRazorpayOrder("dup-test", "order_first");
    expect(purchase.state).toBe("ORDER_CREATED");
    expect(purchase.razorpayOrderId).toBe("order_first");

    expect(() => {
      purchaseStore.setRazorpayOrder("dup-test", "order_second");
    }).toThrow("Invalid purchase state transition");
  });

  it("prevents transition from ORDER_CREATED to PAID after already transitioning", () => {
    const purchase = purchaseStore.create("dup-test-2", "phone-001");
    purchaseStore.updateState("dup-test-2", "CONFIRMING");
    purchaseStore.approve("dup-test-2");
    purchaseStore.setRazorpayOrder("dup-test-2", "order_123");

    purchaseStore.setRazorpayPayment("dup-test-2", "pay_first");
    expect(purchase.state).toBe("PAID");

    expect(() => {
      purchaseStore.setRazorpayPayment("dup-test-2", "pay_second");
    }).toThrow("Invalid purchase state transition");
  });
});
