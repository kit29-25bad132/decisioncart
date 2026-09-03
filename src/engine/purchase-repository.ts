// ============================================================
// DecisionCart — Purchase Repository Abstraction
// Provides a typed persistence layer for purchase records
// and audit events. The in-memory implementation wraps the
// existing PurchaseStore and adds audit trail capabilities.
//
// The existing purchaseStore singleton remains exported from
// purchase-state-machine.ts for backward compatibility.
// ============================================================

import {
  purchaseStore,
  assertValidTransition,
  APPROVAL_EXPIRY_MS,
} from "./purchase-state-machine";
import type { PurchaseRecord, PurchaseState } from "./purchase-state-machine";

// --- Audit Event Types ---

/** All tracked purchase lifecycle event types. */
export type AuditEventType =
  | "PURCHASE_CREATED"
  | "PURCHASE_CONFIRMED"
  | "PURCHASE_APPROVED"
  | "PRICE_VERIFIED"
  | "RAZORPAY_ORDER_CREATED"
  | "RAZORPAY_ORDER_FAILED"
  | "PAYMENT_VERIFIED"
  | "PURCHASE_COMPLETED"
  | "PURCHASE_FAILED"
  | "PURCHASE_EXPIRED"
  | "PURCHASE_CANCELLED"
  | "RECEIPT_GENERATED";

/** A single audit event in the purchase lifecycle. */
export interface AuditEvent {
  /** Unique event identifier. */
  eventId: string;
  /** The purchase this event belongs to. */
  purchaseId: string;
  /** The type of lifecycle event. */
  eventType: AuditEventType;
  /** When this event occurred (epoch ms). */
  timestamp: number;
  /** Purchase state before this event (null for creation). */
  previousState: PurchaseState | null;
  /** Purchase state after this event. */
  resultingState: PurchaseState;
  /** Safe operational metadata (no secrets). */
  metadata: Record<string, unknown>;
}

// --- Repository Interface ---

/**
 * Typed abstraction for purchase persistence and audit logging.
 * Implementations must respect the existing state machine rules.
 */
export interface PurchaseRepository {
  /** Create a new purchase in DECIDED state. */
  createPurchase(purchaseId: string, productId: string): PurchaseRecord;

  /** Retrieve a purchase by ID. Returns null if not found. */
  getPurchase(purchaseId: string): PurchaseRecord | null;

  /** Find a purchase by Razorpay order ID. Returns null if not found. */
  getPurchaseByRazorpayOrderId(orderId: string): PurchaseRecord | null;

  /** Transition a purchase to a new state. Validates the transition. */
  transitionPurchaseState(
    purchaseId: string,
    newState: PurchaseState
  ): PurchaseRecord;

  /** Set approval details on a purchase (CONFIRMING → APPROVED). */
  approvePurchase(purchaseId: string, now?: number): PurchaseRecord;

  /** Set Razorpay order details (APPROVED → ORDER_CREATED). */
  setRazorpayOrder(
    purchaseId: string,
    orderId: string
  ): PurchaseRecord;

  /** Set Razorpay payment details (ORDER_CREATED → PAID). */
  setRazorpayPayment(
    purchaseId: string,
    paymentId: string
  ): PurchaseRecord;

  /** Mark purchase as completed (PAID → DONE). */
  completePurchase(purchaseId: string): PurchaseRecord;

  /** Cancel a purchase. */
  cancelPurchase(purchaseId: string): PurchaseRecord;

  /** Expire a purchase. */
  expirePurchase(purchaseId: string): PurchaseRecord;

  /** Mark a purchase as failed. */
  failPurchase(purchaseId: string): PurchaseRecord;

  /** Create an audit event for a lifecycle transition. */
  createAuditEvent(
    purchaseId: string,
    eventType: AuditEventType,
    previousState: PurchaseState | null,
    resultingState: PurchaseState,
    metadata?: Record<string, unknown>
  ): AuditEvent;

  /** Get all audit events for a purchase, chronological order. */
  listAuditEvents(purchaseId: string): AuditEvent[];

  /** Get all purchases (for debugging). */
  listAllPurchases(): PurchaseRecord[];

  /** Clear all data (for testing). */
  clear(): void;
}

// --- In-Memory Implementation ---

/**
 * In-memory implementation of PurchaseRepository.
 *
 * LIMITATION: Not production-persistent. Lost on server restart.
 * Use a database-backed implementation for production use.
 *
 * Wraps the existing PurchaseStore for purchase state management
 * and adds an in-memory audit event log.
 */
class InMemoryPurchaseRepository implements PurchaseRepository {
  private auditEvents: Map<string, AuditEvent[]> = new Map();
  private eventCounter = 0;

  // --- Purchase Operations ---

  createPurchase(purchaseId: string, productId: string): PurchaseRecord {
    return purchaseStore.create(purchaseId, productId);
  }

  getPurchase(purchaseId: string): PurchaseRecord | null {
    return purchaseStore.get(purchaseId);
  }

  getPurchaseByRazorpayOrderId(orderId: string): PurchaseRecord | null {
    const all = purchaseStore.all();
    return all.find((p) => p.razorpayOrderId === orderId) ?? null;
  }

  transitionPurchaseState(
    purchaseId: string,
    newState: PurchaseState
  ): PurchaseRecord {
    return purchaseStore.updateState(purchaseId, newState);
  }

  approvePurchase(purchaseId: string, now: number = Date.now()): PurchaseRecord {
    return purchaseStore.approve(purchaseId, now);
  }

  setRazorpayOrder(purchaseId: string, orderId: string): PurchaseRecord {
    return purchaseStore.setRazorpayOrder(purchaseId, orderId);
  }

  setRazorpayPayment(purchaseId: string, paymentId: string): PurchaseRecord {
    return purchaseStore.setRazorpayPayment(purchaseId, paymentId);
  }

  completePurchase(purchaseId: string): PurchaseRecord {
    return purchaseStore.complete(purchaseId);
  }

  cancelPurchase(purchaseId: string): PurchaseRecord {
    return purchaseStore.cancel(purchaseId);
  }

  expirePurchase(purchaseId: string): PurchaseRecord {
    return purchaseStore.expire(purchaseId);
  }

  failPurchase(purchaseId: string): PurchaseRecord {
    return purchaseStore.fail(purchaseId);
  }

  // --- Audit Operations ---

  createAuditEvent(
    purchaseId: string,
    eventType: AuditEventType,
    previousState: PurchaseState | null,
    resultingState: PurchaseState,
    metadata: Record<string, unknown> = {}
  ): AuditEvent {
    this.eventCounter += 1;
    const event: AuditEvent = {
      eventId: `evt-${this.eventCounter}-${Date.now()}`,
      purchaseId,
      eventType,
      timestamp: Date.now(),
      previousState,
      resultingState,
      metadata,
    };

    const events = this.auditEvents.get(purchaseId) ?? [];
    events.push(event);
    this.auditEvents.set(purchaseId, events);

    return event;
  }

  listAuditEvents(purchaseId: string): AuditEvent[] {
    const events = this.auditEvents.get(purchaseId) ?? [];
    // Already chronological (push order), but sort explicitly for safety
    return [...events].sort((a, b) => a.timestamp - b.timestamp);
  }

  listAllPurchases(): PurchaseRecord[] {
    return purchaseStore.all();
  }

  clear(): void {
    purchaseStore.clear();
    this.auditEvents.clear();
    this.eventCounter = 0;
  }
}

// --- Singleton ---

let repositoryInstance: PurchaseRepository | null = null;

/**
 * Get the singleton PurchaseRepository instance.
 * Returns the in-memory implementation by default.
 * Can be swapped for a database-backed implementation
 * when a persistence provider is configured.
 */
export function getPurchaseRepository(): PurchaseRepository {
  if (!repositoryInstance) {
    repositoryInstance = new InMemoryPurchaseRepository();
  }
  return repositoryInstance;
}

/**
 * Replace the repository instance (for testing or
 * when configuring a database-backed implementation).
 */
export function setPurchaseRepository(repo: PurchaseRepository): void {
  repositoryInstance = repo;
}

/**
 * Reset the repository to the default in-memory implementation.
 * Primarily for testing.
 */
export function resetPurchaseRepository(): void {
  repositoryInstance = null;
}
