// ============================================================
// DecisionCart — Purchase State Machine Tests
// Verifies transition validation, expiry, and store behavior.
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import {
  isValidTransition,
  assertValidTransition,
  isTerminalState,
  isCompleted,
  isFailed,
  isApprovalExpired,
  approvalRemainingMs,
  purchaseStore,
  APPROVAL_EXPIRY_MS,
  VALID_TRANSITIONS,
} from "./purchase-state-machine";
import type { PurchaseState } from "./purchase-state-machine";

// --- Transition Validation Tests ---

describe("isValidTransition", () => {
  it("allows DECIDED → CONFIRMING", () => {
    expect(isValidTransition("DECIDED", "CONFIRMING")).toBe(true);
  });

  it("allows CONFIRMING → APPROVED", () => {
    expect(isValidTransition("CONFIRMING", "APPROVED")).toBe(true);
  });

  it("allows CONFIRMING → CANCELLED", () => {
    expect(isValidTransition("CONFIRMING", "CANCELLED")).toBe(true);
  });

  it("allows APPROVED → ORDER_CREATED", () => {
    expect(isValidTransition("APPROVED", "ORDER_CREATED")).toBe(true);
  });

  it("allows APPROVED → EXPIRED", () => {
    expect(isValidTransition("APPROVED", "EXPIRED")).toBe(true);
  });

  it("allows APPROVED → CANCELLED", () => {
    expect(isValidTransition("APPROVED", "CANCELLED")).toBe(true);
  });

  it("allows ORDER_CREATED → PAID", () => {
    expect(isValidTransition("ORDER_CREATED", "PAID")).toBe(true);
  });

  it("allows ORDER_CREATED → FAILED", () => {
    expect(isValidTransition("ORDER_CREATED", "FAILED")).toBe(true);
  });

  it("allows ORDER_CREATED → CANCELLED", () => {
    expect(isValidTransition("ORDER_CREATED", "CANCELLED")).toBe(true);
  });

  it("allows PAID → DONE", () => {
    expect(isValidTransition("PAID", "DONE")).toBe(true);
  });

  it("allows PAID → FAILED", () => {
    expect(isValidTransition("PAID", "FAILED")).toBe(true);
  });

  // --- Invalid transitions ---

  it("rejects DECIDED → PAID", () => {
    expect(isValidTransition("DECIDED", "PAID")).toBe(false);
  });

  it("rejects DECIDED → DONE", () => {
    expect(isValidTransition("DECIDED", "DONE")).toBe(false);
  });

  it("rejects DECIDED → ORDER_CREATED", () => {
    expect(isValidTransition("DECIDED", "ORDER_CREATED")).toBe(false);
  });

  it("rejects CONFIRMING → ORDER_CREATED", () => {
    expect(isValidTransition("CONFIRMING", "ORDER_CREATED")).toBe(false);
  });

  it("rejects CONFIRMING → PAID", () => {
    expect(isValidTransition("CONFIRMING", "PAID")).toBe(false);
  });

  it("rejects APPROVED → PAID", () => {
    expect(isValidTransition("APPROVED", "PAID")).toBe(false);
  });

  it("rejects APPROVED → DONE", () => {
    expect(isValidTransition("APPROVED", "DONE")).toBe(false);
  });

  it("rejects ORDER_CREATED → DONE", () => {
    expect(isValidTransition("ORDER_CREATED", "DONE")).toBe(false);
  });

  it("rejects CANCELLED → any state", () => {
    const terminalStates: PurchaseState[] = [
      "DONE",
      "CANCELLED",
      "EXPIRED",
      "FAILED",
    ];
    for (const target of terminalStates) {
      expect(isValidTransition("CANCELLED", target)).toBe(false);
    }
  });

  it("rejects EXPIRED → ORDER_CREATED", () => {
    expect(isValidTransition("EXPIRED", "ORDER_CREATED")).toBe(false);
  });

  it("rejects EXPIRED → any state", () => {
    const allStates: PurchaseState[] = [
      "DECIDED",
      "CONFIRMING",
      "APPROVED",
      "ORDER_CREATED",
      "PAID",
      "DONE",
      "CANCELLED",
      "EXPIRED",
      "FAILED",
    ];
    for (const target of allStates) {
      expect(isValidTransition("EXPIRED", target)).toBe(false);
    }
  });

  it("rejects FAILED → any state", () => {
    const allStates: PurchaseState[] = [
      "DECIDED",
      "CONFIRMING",
      "APPROVED",
      "ORDER_CREATED",
      "PAID",
      "DONE",
      "CANCELLED",
      "EXPIRED",
      "FAILED",
    ];
    for (const target of allStates) {
      expect(isValidTransition("FAILED", target)).toBe(false);
    }
  });

  it("rejects DONE → any state", () => {
    const allStates: PurchaseState[] = [
      "DECIDED",
      "CONFIRMING",
      "APPROVED",
      "ORDER_CREATED",
      "PAID",
      "DONE",
      "CANCELLED",
      "EXPIRED",
      "FAILED",
    ];
    for (const target of allStates) {
      expect(isValidTransition("DONE", target)).toBe(false);
    }
  });
});

// --- assertValidTransition Tests ---

describe("assertValidTransition", () => {
  it("does not throw for valid transitions", () => {
    expect(() => assertValidTransition("DECIDED", "CONFIRMING")).not.toThrow();
    expect(() => assertValidTransition("CONFIRMING", "APPROVED")).not.toThrow();
    expect(() => assertValidTransition("APPROVED", "ORDER_CREATED")).not.toThrow();
    expect(() => assertValidTransition("ORDER_CREATED", "PAID")).not.toThrow();
    expect(() => assertValidTransition("PAID", "DONE")).not.toThrow();
  });

  it("throws for invalid transitions", () => {
    expect(() => assertValidTransition("DECIDED", "PAID")).toThrow(
      "Invalid purchase state transition"
    );
    expect(() => assertValidTransition("CANCELLED", "DONE")).toThrow(
      "Invalid purchase state transition"
    );
  });
});

// --- Terminal State Tests ---

describe("isTerminalState", () => {
  it("returns true for DONE", () => {
    expect(isTerminalState("DONE")).toBe(true);
  });

  it("returns true for CANCELLED", () => {
    expect(isTerminalState("CANCELLED")).toBe(true);
  });

  it("returns true for EXPIRED", () => {
    expect(isTerminalState("EXPIRED")).toBe(true);
  });

  it("returns true for FAILED", () => {
    expect(isTerminalState("FAILED")).toBe(true);
  });

  it("returns false for non-terminal states", () => {
    expect(isTerminalState("DECIDED")).toBe(false);
    expect(isTerminalState("CONFIRMING")).toBe(false);
    expect(isTerminalState("APPROVED")).toBe(false);
    expect(isTerminalState("ORDER_CREATED")).toBe(false);
    expect(isTerminalState("PAID")).toBe(false);
  });
});

describe("isCompleted", () => {
  it("returns true only for DONE", () => {
    expect(isCompleted("DONE")).toBe(true);
  });

  it("returns false for all other states", () => {
    expect(isCompleted("PAID")).toBe(false);
    expect(isCompleted("CANCELLED")).toBe(false);
  });
});

describe("isFailed", () => {
  it("returns true for CANCELLED", () => {
    expect(isFailed("CANCELLED")).toBe(true);
  });

  it("returns true for EXPIRED", () => {
    expect(isFailed("EXPIRED")).toBe(true);
  });

  it("returns true for FAILED", () => {
    expect(isFailed("FAILED")).toBe(true);
  });

  it("returns false for active states", () => {
    expect(isFailed("DECIDED")).toBe(false);
    expect(isFailed("APPROVED")).toBe(false);
    expect(isFailed("DONE")).toBe(false);
  });
});

// --- Approval Expiry Tests ---

describe("isApprovalExpired", () => {
  it("returns false when within expiry window", () => {
    const now = Date.now();
    expect(isApprovalExpired(now, now + 5 * 60 * 1000)).toBe(false); // 5 min later
  });

  it("returns true when past expiry window", () => {
    const now = Date.now();
    expect(isApprovalExpired(now, now + 10 * 60 * 1000)).toBe(true); // Exactly 10 min
  });

  it("returns true when well past expiry", () => {
    const now = Date.now();
    expect(isApprovalExpired(now, now + 60 * 60 * 1000)).toBe(true); // 1 hour
  });

  it("uses configurable expiry duration", () => {
    const approvedAt = 1000;
    const customExpiry = 5000; // 5 seconds
    expect(isApprovalExpired(approvedAt, 6000, customExpiry)).toBe(true);
    expect(isApprovalExpired(approvedAt, 5999, customExpiry)).toBe(false);
  });
});

describe("approvalRemainingMs", () => {
  it("returns full expiry when just approved", () => {
    const now = Date.now();
    expect(approvalRemainingMs(now, now)).toBe(APPROVAL_EXPIRY_MS);
  });

  it("returns 0 when expired", () => {
    const now = Date.now();
    expect(approvalRemainingMs(now, now + APPROVAL_EXPIRY_MS + 1)).toBe(0);
  });

  it("returns correct remaining time", () => {
    const approvedAt = 0;
    const now = APPROVAL_EXPIRY_MS / 2;
    expect(approvalRemainingMs(approvedAt, now)).toBe(APPROVAL_EXPIRY_MS / 2);
  });
});

// --- Purchase Store Tests ---

describe("PurchaseStore", () => {
  beforeEach(() => {
    purchaseStore.clear();
  });

  it("creates a purchase in DECIDED state", () => {
    const purchase = purchaseStore.create("p1", "product-1");
    expect(purchase.state).toBe("DECIDED");
    expect(purchase.productId).toBe("product-1");
    expect(purchase.approvedAt).toBeNull();
    expect(purchase.razorpayOrderId).toBeNull();
  });

  it("retrieves a purchase by ID", () => {
    purchaseStore.create("p1", "product-1");
    const found = purchaseStore.get("p1");
    expect(found).not.toBeNull();
    expect(found!.purchaseId).toBe("p1");
  });

  it("returns null for non-existent purchase", () => {
    expect(purchaseStore.get("nonexistent")).toBeNull();
  });

  it("transitions DECIDED → CONFIRMING via updateState", () => {
    purchaseStore.create("p1", "product-1");
    const updated = purchaseStore.updateState("p1", "CONFIRMING");
    expect(updated.state).toBe("CONFIRMING");
  });

  it("approves a purchase (CONFIRMING → APPROVED)", () => {
    purchaseStore.create("p1", "product-1");
    purchaseStore.updateState("p1", "CONFIRMING");
    const approved = purchaseStore.approve("p1");
    expect(approved.state).toBe("APPROVED");
    expect(approved.approvedAt).not.toBeNull();
    expect(approved.expiresAt).not.toBeNull();
    expect(approved.expiresAt! - approved.approvedAt!).toBe(APPROVAL_EXPIRY_MS);
  });

  it("creates Razorpay order (APPROVED → ORDER_CREATED)", () => {
    purchaseStore.create("p1", "product-1");
    purchaseStore.updateState("p1", "CONFIRMING");
    purchaseStore.approve("p1");
    const orderCreated = purchaseStore.setRazorpayOrder("p1", "order_123");
    expect(orderCreated.state).toBe("ORDER_CREATED");
    expect(orderCreated.razorpayOrderId).toBe("order_123");
  });

  it("records payment (ORDER_CREATED → PAID)", () => {
    purchaseStore.create("p1", "product-1");
    purchaseStore.updateState("p1", "CONFIRMING");
    purchaseStore.approve("p1");
    purchaseStore.setRazorpayOrder("p1", "order_123");
    const paid = purchaseStore.setRazorpayPayment("p1", "pay_456");
    expect(paid.state).toBe("PAID");
    expect(paid.razorpayPaymentId).toBe("pay_456");
  });

  it("completes purchase (PAID → DONE)", () => {
    purchaseStore.create("p1", "product-1");
    purchaseStore.updateState("p1", "CONFIRMING");
    purchaseStore.approve("p1");
    purchaseStore.setRazorpayOrder("p1", "order_123");
    purchaseStore.setRazorpayPayment("p1", "pay_456");
    const done = purchaseStore.complete("p1");
    expect(done.state).toBe("DONE");
  });

  it("cancels a purchase from CONFIRMING", () => {
    purchaseStore.create("p1", "product-1");
    purchaseStore.updateState("p1", "CONFIRMING");
    const cancelled = purchaseStore.cancel("p1");
    expect(cancelled.state).toBe("CANCELLED");
  });

  it("expires an approved purchase", () => {
    purchaseStore.create("p1", "product-1");
    purchaseStore.updateState("p1", "CONFIRMING");
    purchaseStore.approve("p1");
    const expired = purchaseStore.expire("p1");
    expect(expired.state).toBe("EXPIRED");
  });

  it("throws on invalid transition", () => {
    purchaseStore.create("p1", "product-1");
    expect(() => purchaseStore.updateState("p1", "PAID")).toThrow(
      "Invalid purchase state transition"
    );
  });

  it("throws when updating non-existent purchase", () => {
    expect(() => purchaseStore.updateState("nonexistent", "CONFIRMING")).toThrow(
      "not found"
    );
  });

  it("full happy path: DECIDED → CONFIRMING → APPROVED → ORDER_CREATED → PAID → DONE", () => {
    purchaseStore.create("p1", "product-1");
    purchaseStore.updateState("p1", "CONFIRMING");
    purchaseStore.approve("p1");
    purchaseStore.setRazorpayOrder("p1", "order_123");
    purchaseStore.setRazorpayPayment("p1", "pay_456");
    purchaseStore.complete("p1");

    const final = purchaseStore.get("p1");
    expect(final!.state).toBe("DONE");
  });

  it("clear removes all purchases", () => {
    purchaseStore.create("p1", "product-1");
    purchaseStore.create("p2", "product-2");
    purchaseStore.clear();
    expect(purchaseStore.get("p1")).toBeNull();
    expect(purchaseStore.get("p2")).toBeNull();
  });
});

// --- VALID_TRANSITIONS Completeness ---

describe("VALID_TRANSITIONS completeness", () => {
  const allStates: PurchaseState[] = [
    "DECIDED",
    "CONFIRMING",
    "APPROVED",
    "ORDER_CREATED",
    "PAID",
    "DONE",
    "CANCELLED",
    "EXPIRED",
    "FAILED",
  ];

  it("covers all purchase states", () => {
    for (const state of allStates) {
      expect(VALID_TRANSITIONS).toHaveProperty(state);
    }
  });

  it("each state has a transition list", () => {
    for (const state of allStates) {
      expect(Array.isArray(VALID_TRANSITIONS[state])).toBe(true);
    }
  });
});
