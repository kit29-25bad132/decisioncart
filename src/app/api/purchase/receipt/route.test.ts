// ============================================================
// DecisionCart — Purchase Receipt API Tests
// Tests for the trusted payment receipt endpoint.
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { purchaseStore } from "@/engine/purchase-state-machine";
import { getCatalog } from "@/catalog/demo-data";
import { POST as postReceipt } from "./route";

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

// --- Helper: create a purchase in a specific state ---
function createPurchaseInState(
  state: "DECIDED" | "CONFIRMING" | "APPROVED" | "ORDER_CREATED" | "PAID" | "DONE" | "CANCELLED" | "EXPIRED" | "FAILED",
  purchaseId: string,
  productId: string
): void {
  purchaseStore.create(purchaseId, productId);
  if (state === "DECIDED") return;

  purchaseStore.updateState(purchaseId, "CONFIRMING");
  if (state === "CONFIRMING") return;

  purchaseStore.approve(purchaseId);
  if (state === "APPROVED") return;

  purchaseStore.setRazorpayOrder(purchaseId, `order_${purchaseId}`);
  if (state === "ORDER_CREATED") return;

  purchaseStore.setRazorpayPayment(purchaseId, `pay_${purchaseId}`);
  if (state === "PAID") return;

  purchaseStore.complete(purchaseId);
  if (state === "DONE") return;

  // For terminal error states, transition back and fail/expire/cancel
  // We need to handle this differently since DONE is terminal
  if (state === "CANCELLED") {
    // Reset and go through CONFIRMING → CANCELLED
    purchaseStore.clear();
    purchaseStore.create(purchaseId, productId);
    purchaseStore.updateState(purchaseId, "CONFIRMING");
    purchaseStore.cancel(purchaseId);
  } else if (state === "EXPIRED") {
    purchaseStore.clear();
    purchaseStore.create(purchaseId, productId);
    purchaseStore.updateState(purchaseId, "CONFIRMING");
    purchaseStore.approve(purchaseId);
    purchaseStore.expire(purchaseId);
  } else if (state === "FAILED") {
    purchaseStore.clear();
    purchaseStore.create(purchaseId, productId);
    purchaseStore.updateState(purchaseId, "CONFIRMING");
    purchaseStore.approve(purchaseId);
    purchaseStore.setRazorpayOrder(purchaseId, `order_${purchaseId}`);
    purchaseStore.fail(purchaseId);
  }
}

// ============================================================
// Receipt Availability Tests
// ============================================================

describe("Receipt API — Availability", () => {
  beforeEach(() => {
    purchaseStore.clear();
  });

  it("receipt unavailable for DECIDED state", async () => {
    const productId = getValidProductId();
    createPurchaseInState("DECIDED", "test-decided", productId);

    const res = await postReceipt(mockRequest({ purchaseId: "test-decided" }));
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("successfully paid");
    expect(data.error).toContain("Current state: DECIDED");
  });

  it("receipt unavailable for CONFIRMING state", async () => {
    const productId = getValidProductId();
    createPurchaseInState("CONFIRMING", "test-confirming", productId);

    const res = await postReceipt(mockRequest({ purchaseId: "test-confirming" }));
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("Current state: CONFIRMING");
  });

  it("receipt unavailable for APPROVED state", async () => {
    const productId = getValidProductId();
    createPurchaseInState("APPROVED", "test-approved", productId);

    const res = await postReceipt(mockRequest({ purchaseId: "test-approved" }));
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("Current state: APPROVED");
  });

  it("receipt unavailable for ORDER_CREATED state", async () => {
    const productId = getValidProductId();
    createPurchaseInState("ORDER_CREATED", "test-order-created", productId);

    const res = await postReceipt(mockRequest({ purchaseId: "test-order-created" }));
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("Current state: ORDER_CREATED");
  });

  it("receipt unavailable for FAILED state", async () => {
    const productId = getValidProductId();
    createPurchaseInState("FAILED", "test-failed", productId);

    const res = await postReceipt(mockRequest({ purchaseId: "test-failed" }));
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("Current state: FAILED");
  });

  it("receipt unavailable for CANCELLED state", async () => {
    const productId = getValidProductId();
    createPurchaseInState("CANCELLED", "test-cancelled", productId);

    const res = await postReceipt(mockRequest({ purchaseId: "test-cancelled" }));
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("Current state: CANCELLED");
  });

  it("receipt unavailable for EXPIRED state", async () => {
    const productId = getValidProductId();
    createPurchaseInState("EXPIRED", "test-expired", productId);

    const res = await postReceipt(mockRequest({ purchaseId: "test-expired" }));
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("Current state: EXPIRED");
  });
});

// ============================================================
// Receipt Generation After Successful Payment
// ============================================================

describe("Receipt API — Successful Generation", () => {
  beforeEach(() => {
    purchaseStore.clear();
  });

  it("generates receipt after successful payment (DONE state)", async () => {
    const productId = getValidProductId();
    createPurchaseInState("DONE", "test-done", productId);

    const res = await postReceipt(mockRequest({ purchaseId: "test-done" }));
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.receipt).toBeDefined();
    expect(data.receipt.purchaseId).toBe("test-done");
    expect(data.receipt.productId).toBe(productId);
  });

  it("uses trusted catalog price in receipt", async () => {
    const productId = getValidProductId();
    const catalog = getCatalog("smartphone");
    const catalogProduct = catalog.find((p) => p.id === productId)!;

    createPurchaseInState("DONE", "test-price", productId);

    const res = await postReceipt(mockRequest({ purchaseId: "test-price" }));
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.receipt.trustedAmount).toBe(catalogProduct.price);
    expect(data.receipt.currency).toBe("INR");
  });

  it("server ignores any client-provided price — uses catalog price", async () => {
    const productId = getValidProductId();
    const catalog = getCatalog("smartphone");
    const catalogProduct = catalog.find((p) => p.id === productId)!;

    createPurchaseInState("DONE", "test-ignore-price", productId);

    // The endpoint doesn't even accept client price — it resolves from catalog
    const res = await postReceipt(mockRequest({ purchaseId: "test-ignore-price" }));
    const data = await res.json();

    expect(data.success).toBe(true);
    // Always returns the catalog price, never influenced by client
    expect(data.receipt.trustedAmount).toBe(catalogProduct.price);
  });

  it("includes correct product details from catalog", async () => {
    const productId = getValidProductId();
    const catalog = getCatalog("smartphone");
    const catalogProduct = catalog.find((p) => p.id === productId)!;

    createPurchaseInState("DONE", "test-product-details", productId);

    const res = await postReceipt(mockRequest({ purchaseId: "test-product-details" }));
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.receipt.productName).toBe(catalogProduct.name);
    expect(data.receipt.brand).toBe(catalogProduct.brand);
    expect(data.receipt.category).toBe(catalogProduct.category);
  });

  it("correctly includes Razorpay order and payment IDs", async () => {
    const productId = getValidProductId();
    createPurchaseInState("DONE", "test-razorpay-ids", productId);

    const res = await postReceipt(mockRequest({ purchaseId: "test-razorpay-ids" }));
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.receipt.razorpayOrderId).toBe("order_test-razorpay-ids");
    expect(data.receipt.razorpayPaymentId).toBe("pay_test-razorpay-ids");
    expect(data.receipt.paymentStatus).toBe("Verified");
  });

  it("includes a valid ISO 8601 purchasedAt timestamp", async () => {
    const productId = getValidProductId();
    createPurchaseInState("DONE", "test-timestamp", productId);

    const res = await postReceipt(mockRequest({ purchaseId: "test-timestamp" }));
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.receipt.purchasedAt).toBeDefined();
    expect(new Date(data.receipt.purchasedAt).toISOString()).toBe(data.receipt.purchasedAt);
  });

  it("receipt data source is honest about demo catalog", async () => {
    const productId = getValidProductId();
    createPurchaseInState("DONE", "test-data-source", productId);

    const res = await postReceipt(mockRequest({ purchaseId: "test-data-source" }));
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.receipt.dataSource).toBe("DecisionCart demo catalog");
  });
});

// ============================================================
// Missing Purchase Tests
// ============================================================

describe("Receipt API — Missing Purchase", () => {
  beforeEach(() => {
    purchaseStore.clear();
  });

  it("returns controlled error for missing purchase", async () => {
    const res = await postReceipt(mockRequest({ purchaseId: "nonexistent-uuid-12345" }));
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("not found");
  });

  it("returns controlled error for empty purchaseId", async () => {
    const res = await postReceipt(mockRequest({ purchaseId: "" }));
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("required");
  });

  it("returns controlled error for missing purchaseId", async () => {
    const res = await postReceipt(mockRequest({}));
    const data = await res.json();

    expect(data.success).toBe(false);
    expect(data.error).toContain("required");
  });

  it("returns controlled error for invalid JSON body", async () => {
    const res = await postReceipt({
      json: async () => {
        throw new Error("Invalid JSON");
      },
    } as unknown as NextRequest);
    const data = await res.json();

    expect(data.success).toBe(false);
  });
});

// ============================================================
// Security Tests — No Secrets Exposed
// ============================================================

describe("Receipt API — Security", () => {
  beforeEach(() => {
    purchaseStore.clear();
  });

  it("receipt response does not expose Razorpay secrets", async () => {
    const productId = getValidProductId();
    createPurchaseInState("DONE", "test-secrets", productId);

    const res = await postReceipt(mockRequest({ purchaseId: "test-secrets" }));
    const data = await res.json();
    const responseString = JSON.stringify(data);

    // Should not contain Razorpay secret keys
    expect(responseString).not.toContain("RAZORPAY_KEY_SECRET");
    expect(responseString).not.toContain("key_secret");
    expect(responseString).not.toContain("secret_key");
  });

  it("error responses do not expose internal details", async () => {
    const res = await postReceipt(mockRequest({ purchaseId: "nonexistent" }));
    const data = await res.json();
    const responseString = JSON.stringify(data);

    expect(responseString).not.toContain("RAZORPAY");
    expect(responseString).not.toContain("key_secret");
    expect(responseString).not.toContain("API_KEY");
  });

  it("receipt does not include server internals", async () => {
    const productId = getValidProductId();
    createPurchaseInState("DONE", "test-no-internals", productId);

    const res = await postReceipt(mockRequest({ purchaseId: "test-no-internals" }));
    const data = await res.json();
    const responseString = JSON.stringify(data);

    expect(responseString).not.toContain("password");
    expect(responseString).not.toContain("token");
    expect(responseString).not.toContain("secret");
    expect(responseString).not.toContain("env");
  });
});
