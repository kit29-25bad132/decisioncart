// ============================================================
// DecisionCart — Purchase Repository Abstraction
// Provides a typed persistence layer for purchase records
// and audit events. The in-memory implementation wraps the
// existing PurchaseStore and adds audit trail capabilities.
//
// The existing purchaseStore singleton remains exported from
// purchase-state-machine.ts for backward compatibility.
//
// All methods are async to support database-backed
// implementations (Supabase). The in-memory implementation
// wraps synchronous operations in Promises.
// ============================================================

import {
  purchaseStore,
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
  |  "PAYMENT_AMOUNT_MISMATCH"
  | "PAYMENT_VERIFIED"
  | "PAYMENT_PERSISTENCE_SUCCESS"
  | "PAYMENT_PERSISTENCE_FAILED"
  | "PAYMENT_WEBHOOK_VERIFIED"
  | "PAYMENT_WEBHOOK_RECONCILED"
  | "PAYMENT_WEBHOOK_DUPLICATE"
  | "PAYMENT_WEBHOOK_FAILED"
  | "PURCHASE_COMPLETED"
  | "PURCHASE_FAILED"
  | "PURCHASE_EXPIRED"
  | "PURCHASE_CANCELLED"
  | "RECEIPT_GENERATED"
  | "OFFER_VERIFIED"
  | "OFFER_PRICE_CHANGED"
  | "MERCHANT_OFFER_SELECTED"
  | "MERCHANT_STALE_OFFER_BLOCKED";

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
 * All methods are async to support database-backed implementations.
 * Implementations must respect the existing state machine rules.
 */
export interface PurchaseRepository {
  /** Create a new purchase in DECIDED state. */
  createPurchase(purchaseId: string, productId: string, merchantOfferId?: string): Promise<PurchaseRecord>;

  /** Retrieve a purchase by ID. Returns null if not found. */
  getPurchase(purchaseId: string): Promise<PurchaseRecord | null>;

  /** Find a purchase by Razorpay order ID. Returns null if not found. */
  getPurchaseByRazorpayOrderId(orderId: string): Promise<PurchaseRecord | null>;

  /** Transition a purchase to a new state. Validates the transition. */
  transitionPurchaseState(
    purchaseId: string,
    newState: PurchaseState
  ): Promise<PurchaseRecord>;

  /** Set approval details on a purchase (CONFIRMING → APPROVED). */
  approvePurchase(purchaseId: string, now?: number): Promise<PurchaseRecord>;

  /** Set Razorpay order details (APPROVED → ORDER_CREATED). */
  setRazorpayOrder(
    purchaseId: string,
    orderId: string
  ): Promise<PurchaseRecord>;

  /** Update the Razorpay order ID on an ORDER_CREATED purchase (no state transition). */
  updateRazorpayOrderId(
    purchaseId: string,
    orderId: string
  ): Promise<PurchaseRecord>;

  /** Set Razorpay payment details (ORDER_CREATED → PAID). */
  setRazorpayPayment(
    purchaseId: string,
    paymentId: string
  ): Promise<PurchaseRecord>;

  /** Atomically persist a verified payment and complete the purchase. */
  finalizeVerifiedPayment(
    purchaseId: string,
    paymentId: string
  ): Promise<PurchaseRecord>;

  /** Mark purchase as completed (PAID → DONE). */
  completePurchase(purchaseId: string): Promise<PurchaseRecord>;

  /** Cancel a purchase. */
  cancelPurchase(purchaseId: string): Promise<PurchaseRecord>;

  /** Expire a purchase. */
  expirePurchase(purchaseId: string): Promise<PurchaseRecord>;

  /** Mark a purchase as failed. */
  failPurchase(purchaseId: string): Promise<PurchaseRecord>;

  /** Create an audit event for a lifecycle transition. */
  createAuditEvent(
    purchaseId: string,
    eventType: AuditEventType,
    previousState: PurchaseState | null,
    resultingState: PurchaseState,
    metadata?: Record<string, unknown>
  ): Promise<AuditEvent>;

  /** Get all audit events for a purchase, chronological order. */
  listAuditEvents(purchaseId: string): Promise<AuditEvent[]>;

  /** Get all purchases (for debugging). */
  listAllPurchases(): Promise<PurchaseRecord[]>;

  /** Clear all data (for testing). */
  clear(): Promise<void>;
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

  async createPurchase(purchaseId: string, productId: string, merchantOfferId?: string): Promise<PurchaseRecord> {
    return purchaseStore.create(purchaseId, productId, merchantOfferId);
  }

  async getPurchase(purchaseId: string): Promise<PurchaseRecord | null> {
    return purchaseStore.get(purchaseId);
  }

  async getPurchaseByRazorpayOrderId(orderId: string): Promise<PurchaseRecord | null> {
    const all = purchaseStore.all();
    return all.find((p) => p.razorpayOrderId === orderId) ?? null;
  }

  async transitionPurchaseState(
    purchaseId: string,
    newState: PurchaseState
  ): Promise<PurchaseRecord> {
    return purchaseStore.updateState(purchaseId, newState);
  }

  async approvePurchase(purchaseId: string, now: number = Date.now()): Promise<PurchaseRecord> {
    return purchaseStore.approve(purchaseId, now);
  }

  async setRazorpayOrder(purchaseId: string, orderId: string): Promise<PurchaseRecord> {
    return purchaseStore.setRazorpayOrder(purchaseId, orderId);
  }

  async updateRazorpayOrderId(purchaseId: string, orderId: string): Promise<PurchaseRecord> {
    const record = purchaseStore.get(purchaseId);
    if (!record) throw new Error(`Purchase ${purchaseId} not found.`);
    record.razorpayOrderId = orderId;
    record.updatedAt = Date.now();
    return record;
  }

  async setRazorpayPayment(purchaseId: string, paymentId: string): Promise<PurchaseRecord> {
    return purchaseStore.setRazorpayPayment(purchaseId, paymentId);
  }

  async finalizeVerifiedPayment(
    purchaseId: string,
    paymentId: string
  ): Promise<PurchaseRecord> {
    return purchaseStore.finalizeVerifiedPayment(purchaseId, paymentId);
  }

  async completePurchase(purchaseId: string): Promise<PurchaseRecord> {
    return purchaseStore.complete(purchaseId);
  }

  async cancelPurchase(purchaseId: string): Promise<PurchaseRecord> {
    return purchaseStore.cancel(purchaseId);
  }

  async expirePurchase(purchaseId: string): Promise<PurchaseRecord> {
    return purchaseStore.expire(purchaseId);
  }

  async failPurchase(purchaseId: string): Promise<PurchaseRecord> {
    return purchaseStore.fail(purchaseId);
  }

  // --- Audit Operations ---

  async createAuditEvent(
    purchaseId: string,
    eventType: AuditEventType,
    previousState: PurchaseState | null,
    resultingState: PurchaseState,
    metadata: Record<string, unknown> = {}
  ): Promise<AuditEvent> {
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

  async listAuditEvents(purchaseId: string): Promise<AuditEvent[]> {
    const events = this.auditEvents.get(purchaseId) ?? [];
    // Already chronological (push order), but sort explicitly for safety
    return [...events].sort((a, b) => a.timestamp - b.timestamp);
  }

  async listAllPurchases(): Promise<PurchaseRecord[]> {
    return purchaseStore.all();
  }

  async clear(): Promise<void> {
    purchaseStore.clear();
    this.auditEvents.clear();
    this.eventCounter = 0;
  }
}

// --- Singleton ---

let repositoryInstance: PurchaseRepository | null = null;

/**
 * When true, getPurchaseRepository always returns InMemoryPurchaseRepository.
 * Set this in test environments to prevent auto-selecting Supabase.
 */
let forceInMemory = false;

/**
 * Force all future getPurchaseRepository() calls to return
 * InMemoryPurchaseRepository. Used in test environments.
 */
export function forceInMemoryRepository(): void {
  forceInMemory = true;
}

/**
 * Check if InMemory repository is forced (test environment).
 * Used to skip Supabase-specific operations in tests.
 */
export function isInMemoryForced(): boolean {
  return forceInMemory;
}

/**
 * Get the singleton PurchaseRepository instance.
 * Returns the in-memory implementation by default.
 * When valid Supabase configuration exists (and not forced
 * to InMemory), returns the database-backed implementation.
 */
export async function getPurchaseRepository(): Promise<PurchaseRepository> {
  if (!repositoryInstance) {
    if (forceInMemory) {
      repositoryInstance = new InMemoryPurchaseRepository();
    } else {
      // Check if Supabase is configured
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (url && serviceKey) {
        // Dynamic import to avoid pulling Supabase into test environments
        // where it's not needed and may not have credentials
        const { SupabasePurchaseRepository } = await import(
          "./supabase-purchase-repository"
        );
        repositoryInstance = new SupabasePurchaseRepository();
      } else {
        repositoryInstance = new InMemoryPurchaseRepository();
      }
    }
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
