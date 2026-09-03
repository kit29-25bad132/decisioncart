// ============================================================
// DecisionCart — Purchase Repository & Audit Trail Tests
// Tests for the PurchaseRepository abstraction and audit events.
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import {
  getPurchaseRepository,
  resetPurchaseRepository,
} from "./purchase-repository";
import type { PurchaseRepository, AuditEvent } from "./purchase-repository";

// --- Helpers ---

function getRepo(): PurchaseRepository {
  return getPurchaseRepository();
}

// --- Tests ---

describe("PurchaseRepository", () => {
  let repo: PurchaseRepository;

  beforeEach(() => {
    resetPurchaseRepository();
    repo = getPurchaseRepository();
    repo.clear();
  });

  // --- 1. Create / Get ---

  describe("createPurchase and getPurchase", () => {
    it("creates a purchase in DECIDED state", () => {
      const record = repo.createPurchase("p1", "phone-001");
      expect(record.purchaseId).toBe("p1");
      expect(record.productId).toBe("phone-001");
      expect(record.state).toBe("DECIDED");
      expect(record.createdAt).toBeTypeOf("number");
    });

    it("retrieves a purchase by ID", () => {
      repo.createPurchase("p1", "phone-001");
      const found = repo.getPurchase("p1");
      expect(found).not.toBeNull();
      expect(found!.purchaseId).toBe("p1");
    });

    it("returns null for non-existent purchase", () => {
      expect(repo.getPurchase("nonexistent")).toBeNull();
    });

    it("finds purchase by Razorpay order ID", () => {
      repo.createPurchase("p1", "phone-001");
      repo.transitionPurchaseState("p1", "CONFIRMING");
      repo.approvePurchase("p1");
      repo.setRazorpayOrder("p1", "order_abc");

      const found = repo.getPurchaseByRazorpayOrderId("order_abc");
      expect(found).not.toBeNull();
      expect(found!.purchaseId).toBe("p1");
    });

    it("returns null for unknown Razorpay order ID", () => {
      expect(repo.getPurchaseByRazorpayOrderId("unknown")).toBeNull();
    });
  });

  // --- 2. Valid State Transitions ---

  describe("valid state transitions", () => {
    it("transitions DECIDED → CONFIRMING", () => {
      repo.createPurchase("p1", "phone-001");
      const updated = repo.transitionPurchaseState("p1", "CONFIRMING");
      expect(updated.state).toBe("CONFIRMING");
    });

    it("transitions CONFIRMING → APPROVED via approvePurchase", () => {
      repo.createPurchase("p1", "phone-001");
      repo.transitionPurchaseState("p1", "CONFIRMING");
      const approved = repo.approvePurchase("p1");
      expect(approved.state).toBe("APPROVED");
      expect(approved.approvedAt).not.toBeNull();
      expect(approved.expiresAt).not.toBeNull();
    });

    it("transitions APPROVED → ORDER_CREATED via setRazorpayOrder", () => {
      repo.createPurchase("p1", "phone-001");
      repo.transitionPurchaseState("p1", "CONFIRMING");
      repo.approvePurchase("p1");
      const orderCreated = repo.setRazorpayOrder("p1", "order_123");
      expect(orderCreated.state).toBe("ORDER_CREATED");
      expect(orderCreated.razorpayOrderId).toBe("order_123");
    });

    it("transitions ORDER_CREATED → PAID via setRazorpayPayment", () => {
      repo.createPurchase("p1", "phone-001");
      repo.transitionPurchaseState("p1", "CONFIRMING");
      repo.approvePurchase("p1");
      repo.setRazorpayOrder("p1", "order_123");
      const paid = repo.setRazorpayPayment("p1", "pay_456");
      expect(paid.state).toBe("PAID");
      expect(paid.razorpayPaymentId).toBe("pay_456");
    });

    it("transitions PAID → DONE via completePurchase", () => {
      repo.createPurchase("p1", "phone-001");
      repo.transitionPurchaseState("p1", "CONFIRMING");
      repo.approvePurchase("p1");
      repo.setRazorpayOrder("p1", "order_123");
      repo.setRazorpayPayment("p1", "pay_456");
      const done = repo.completePurchase("p1");
      expect(done.state).toBe("DONE");
    });

    it("full happy path: DECIDED → CONFIRMING → APPROVED → ORDER_CREATED → PAID → DONE", () => {
      repo.createPurchase("p1", "phone-001");
      repo.transitionPurchaseState("p1", "CONFIRMING");
      repo.approvePurchase("p1");
      repo.setRazorpayOrder("p1", "order_123");
      repo.setRazorpayPayment("p1", "pay_456");
      repo.completePurchase("p1");
      expect(repo.getPurchase("p1")!.state).toBe("DONE");
    });
  });

  // --- 3. Invalid State Transitions ---

  describe("invalid state transitions", () => {
    it("rejects DECIDED → PAID", () => {
      repo.createPurchase("p1", "phone-001");
      expect(() => repo.transitionPurchaseState("p1", "PAID")).toThrow(
        "Invalid purchase state transition"
      );
    });

    it("rejects CONFIRMING → ORDER_CREATED", () => {
      repo.createPurchase("p1", "phone-001");
      repo.transitionPurchaseState("p1", "CONFIRMING");
      expect(() => repo.transitionPurchaseState("p1", "ORDER_CREATED")).toThrow(
        "Invalid purchase state transition"
      );
    });

    it("rejects transition on non-existent purchase", () => {
      expect(() => repo.transitionPurchaseState("nonexistent", "CONFIRMING")).toThrow(
        "not found"
      );
    });
  });

  // --- 4. Audit Event Creation ---

  describe("audit events", () => {
    it("creates an audit event", () => {
      repo.createPurchase("p1", "phone-001");
      const event = repo.createAuditEvent(
        "p1",
        "PURCHASE_CREATED",
        null,
        "DECIDED",
        { productId: "phone-001" }
      );
      expect(event.eventId).toBeDefined();
      expect(event.purchaseId).toBe("p1");
      expect(event.eventType).toBe("PURCHASE_CREATED");
      expect(event.previousState).toBeNull();
      expect(event.resultingState).toBe("DECIDED");
      expect(event.timestamp).toBeTypeOf("number");
      expect(event.metadata).toEqual({ productId: "phone-001" });
    });

    it("returns events in chronological order", () => {
      repo.createPurchase("p1", "phone-001");

      repo.createAuditEvent("p1", "PURCHASE_CREATED", null, "DECIDED");
      repo.createAuditEvent("p1", "PURCHASE_CONFIRMED", "DECIDED", "CONFIRMING");
      repo.createAuditEvent("p1", "PURCHASE_APPROVED", "CONFIRMING", "APPROVED");

      const events = repo.listAuditEvents("p1");
      expect(events).toHaveLength(3);
      expect(events[0].eventType).toBe("PURCHASE_CREATED");
      expect(events[1].eventType).toBe("PURCHASE_CONFIRMED");
      expect(events[2].eventType).toBe("PURCHASE_APPROVED");

      // Chronological ordering
      expect(events[0].timestamp).toBeLessThanOrEqual(events[1].timestamp);
      expect(events[1].timestamp).toBeLessThanOrEqual(events[2].timestamp);
    });

    it("returns empty array for purchase with no events", () => {
      const events = repo.listAuditEvents("nonexistent");
      expect(events).toEqual([]);
    });

    it("audit events have unique IDs", () => {
      repo.createPurchase("p1", "phone-001");
      const e1 = repo.createAuditEvent("p1", "PURCHASE_CREATED", null, "DECIDED");
      const e2 = repo.createAuditEvent("p1", "PURCHASE_CONFIRMED", "DECIDED", "CONFIRMING");
      expect(e1.eventId).not.toBe(e2.eventId);
    });
  });

  // --- 5. Razorpay Order Event Logging ---

  describe("Razorpay order events", () => {
    it("logs RAZORPAY_ORDER_CREATED event", () => {
      repo.createPurchase("p1", "phone-001");
      repo.transitionPurchaseState("p1", "CONFIRMING");
      repo.approvePurchase("p1");
      repo.setRazorpayOrder("p1", "order_abc");

      repo.createAuditEvent(
        "p1",
        "RAZORPAY_ORDER_CREATED",
        "APPROVED",
        "ORDER_CREATED",
        { productId: "phone-001", category: "smartphone" }
      );

      const events = repo.listAuditEvents("p1");
      const orderEvent = events.find((e) => e.eventType === "RAZORPAY_ORDER_CREATED");
      expect(orderEvent).toBeDefined();
      expect(orderEvent!.previousState).toBe("APPROVED");
      expect(orderEvent!.resultingState).toBe("ORDER_CREATED");
      expect(orderEvent!.metadata.productId).toBe("phone-001");
    });

    it("logs RAZORPAY_ORDER_FAILED event", () => {
      repo.createPurchase("p1", "phone-001");
      repo.transitionPurchaseState("p1", "CONFIRMING");
      repo.approvePurchase("p1");
      repo.setRazorpayOrder("p1", "order_abc");
      repo.failPurchase("p1");

      repo.createAuditEvent(
        "p1",
        "RAZORPAY_ORDER_FAILED",
        "ORDER_CREATED",
        "FAILED",
        { reason: "razorpay_order_creation_failed" }
      );

      const events = repo.listAuditEvents("p1");
      const failEvent = events.find((e) => e.eventType === "RAZORPAY_ORDER_FAILED");
      expect(failEvent).toBeDefined();
      expect(failEvent!.previousState).toBe("ORDER_CREATED");
      expect(failEvent!.resultingState).toBe("FAILED");
    });
  });

  // --- 6. Payment Verification Events ---

  describe("payment verification events", () => {
    it("logs PAYMENT_VERIFIED and PURCHASE_COMPLETED events", () => {
      repo.createPurchase("p1", "phone-001");
      repo.transitionPurchaseState("p1", "CONFIRMING");
      repo.approvePurchase("p1");
      repo.setRazorpayOrder("p1", "order_abc");
      repo.setRazorpayPayment("p1", "pay_xyz");
      repo.createAuditEvent("p1", "PAYMENT_VERIFIED", "ORDER_CREATED", "PAID", {
        razorpayOrderId: "order_abc",
      });
      repo.completePurchase("p1");
      repo.createAuditEvent("p1", "PURCHASE_COMPLETED", "PAID", "DONE");

      const events = repo.listAuditEvents("p1");
      const payEvent = events.find((e) => e.eventType === "PAYMENT_VERIFIED");
      const completeEvent = events.find((e) => e.eventType === "PURCHASE_COMPLETED");

      expect(payEvent).toBeDefined();
      expect(payEvent!.resultingState).toBe("PAID");
      expect(completeEvent).toBeDefined();
      expect(completeEvent!.resultingState).toBe("DONE");
    });
  });

  // --- 7. Failed Purchase Events ---

  describe("failed purchase events", () => {
    it("logs PURCHASE_FAILED event on failure", () => {
      repo.createPurchase("p1", "phone-001");
      repo.transitionPurchaseState("p1", "CONFIRMING");
      repo.approvePurchase("p1");
      repo.setRazorpayOrder("p1", "order_abc");
      repo.failPurchase("p1");

      repo.createAuditEvent("p1", "PURCHASE_FAILED", "ORDER_CREATED", "FAILED", {
        reason: "razorpay_error",
      });

      const events = repo.listAuditEvents("p1");
      const failEvent = events.find((e) => e.eventType === "PURCHASE_FAILED");
      expect(failEvent).toBeDefined();
      expect(failEvent!.metadata.reason).toBe("razorpay_error");
    });

    it("logs PURCHASE_EXPIRED event on expiry", () => {
      repo.createPurchase("p1", "phone-001");
      repo.transitionPurchaseState("p1", "CONFIRMING");
      repo.approvePurchase("p1");
      repo.expirePurchase("p1");

      repo.createAuditEvent("p1", "PURCHASE_EXPIRED", "APPROVED", "EXPIRED", {
        reason: "approval_expired",
      });

      const events = repo.listAuditEvents("p1");
      const expireEvent = events.find((e) => e.eventType === "PURCHASE_EXPIRED");
      expect(expireEvent).toBeDefined();
      expect(expireEvent!.resultingState).toBe("EXPIRED");
    });
  });

  // --- 8. Receipt Compatibility ---

  describe("receipt compatibility", () => {
    it("receipt data can be retrieved after DONE state", () => {
      repo.createPurchase("p1", "phone-001");
      repo.transitionPurchaseState("p1", "CONFIRMING");
      repo.approvePurchase("p1");
      repo.setRazorpayOrder("p1", "order_abc");
      repo.setRazorpayPayment("p1", "pay_xyz");
      repo.completePurchase("p1");

      const purchase = repo.getPurchase("p1");
      expect(purchase!.state).toBe("DONE");
      expect(purchase!.razorpayOrderId).toBe("order_abc");
      expect(purchase!.razorpayPaymentId).toBe("pay_xyz");
    });
  });

  // --- 9. In-Memory Fallback ---

  describe("in-memory fallback", () => {
    it("clear removes all purchases and audit events", () => {
      repo.createPurchase("p1", "phone-001");
      repo.createAuditEvent("p1", "PURCHASE_CREATED", null, "DECIDED");

      repo.createPurchase("p2", "phone-002");
      repo.createAuditEvent("p2", "PURCHASE_CREATED", null, "DECIDED");

      repo.clear();

      expect(repo.getPurchase("p1")).toBeNull();
      expect(repo.getPurchase("p2")).toBeNull();
      expect(repo.listAuditEvents("p1")).toEqual([]);
      expect(repo.listAuditEvents("p2")).toEqual([]);
    });

    it("listAllPurchases returns all purchases", () => {
      repo.createPurchase("p1", "phone-001");
      repo.createPurchase("p2", "phone-002");

      const all = repo.listAllPurchases();
      expect(all).toHaveLength(2);
    });

    it("resetPurchaseRepository creates a fresh instance", () => {
      const repo1 = getPurchaseRepository();
      repo1.createPurchase("p1", "phone-001");

      resetPurchaseRepository();
      const repo2 = getPurchaseRepository();

      // Fresh instance should not have the old data
      // (but it shares the same purchaseStore singleton)
      expect(repo2).not.toBe(repo1);
    });
  });

  // --- 10. No Secrets Exposed ---

  describe("no secrets in audit events", () => {
    it("audit events contain only safe metadata", () => {
      repo.createPurchase("p1", "phone-001");
      const event = repo.createAuditEvent(
        "p1",
        "RAZORPAY_ORDER_CREATED",
        "APPROVED",
        "ORDER_CREATED",
        { productId: "phone-001", category: "smartphone" }
      );

      const eventString = JSON.stringify(event);
      expect(eventString).not.toContain("RAZORPAY_KEY_SECRET");
      expect(eventString).not.toContain("key_secret");
      expect(eventString).not.toContain("API_KEY");
      expect(eventString).not.toContain("password");
    });

    it("listAuditEvents results contain no secrets", () => {
      repo.createPurchase("p1", "phone-001");
      repo.createAuditEvent("p1", "PURCHASE_CREATED", null, "DECIDED");
      repo.createAuditEvent("p1", "PURCHASE_COMPLETED", "PAID", "DONE");

      const events = repo.listAuditEvents("p1");
      const eventsString = JSON.stringify(events);
      expect(eventsString).not.toContain("RAZORPAY_KEY_SECRET");
      expect(eventsString).not.toContain("secret");
      expect(eventsString).not.toContain("API_KEY");
    });
  });

  // --- 11. Cancel Purchase ---

  describe("cancel and expire", () => {
    it("cancels a purchase from CONFIRMING", () => {
      repo.createPurchase("p1", "phone-001");
      repo.transitionPurchaseState("p1", "CONFIRMING");
      const cancelled = repo.cancelPurchase("p1");
      expect(cancelled.state).toBe("CANCELLED");
    });

    it("expires an approved purchase", () => {
      repo.createPurchase("p1", "phone-001");
      repo.transitionPurchaseState("p1", "CONFIRMING");
      repo.approvePurchase("p1");
      const expired = repo.expirePurchase("p1");
      expect(expired.state).toBe("EXPIRED");
    });

    it("logs PURCHASE_CANCELLED event", () => {
      repo.createPurchase("p1", "phone-001");
      repo.transitionPurchaseState("p1", "CONFIRMING");
      repo.cancelPurchase("p1");
      repo.createAuditEvent("p1", "PURCHASE_CANCELLED", "CONFIRMING", "CANCELLED");

      const events = repo.listAuditEvents("p1");
      const cancelEvent = events.find((e) => e.eventType === "PURCHASE_CANCELLED");
      expect(cancelEvent).toBeDefined();
      expect(cancelEvent!.resultingState).toBe("CANCELLED");
    });
  });

  // --- 12. Audit Trail API Compatibility ---

  describe("audit trail data shape", () => {
    it("events have all required fields for API response", () => {
      repo.createPurchase("p1", "phone-001");
      repo.createAuditEvent("p1", "PURCHASE_CREATED", null, "DECIDED", {
        productId: "phone-001",
      });

      const events = repo.listAuditEvents("p1");
      const event = events[0];

      expect(event).toHaveProperty("eventId");
      expect(event).toHaveProperty("purchaseId");
      expect(event).toHaveProperty("eventType");
      expect(event).toHaveProperty("timestamp");
      expect(event).toHaveProperty("previousState");
      expect(event).toHaveProperty("resultingState");
      expect(event).toHaveProperty("metadata");
      expect(typeof event.eventId).toBe("string");
      expect(typeof event.timestamp).toBe("number");
      expect(typeof event.metadata).toBe("object");
    });
  });
});
