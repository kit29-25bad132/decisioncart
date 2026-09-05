// ============================================================
// DecisionCart — Purchase State Machine
// Pure TypeScript. Deterministic state transitions for the
// purchase lifecycle with explicit human approval.
//
// Lifecycle:
//   DECIDED → CONFIRMING → APPROVED → ORDER_CREATED → PAID → DONE
//
// Terminal/error states:
//   CANCELLED, EXPIRED, FAILED
//
// INVARIANT: Only valid transitions are allowed.
// Invalid transitions throw immediately — never silently succeed.
// ============================================================

// --- Purchase State Type ---

export type PurchaseState =
  | "DECIDED"
  | "CONFIRMING"
  | "APPROVED"
  | "ORDER_CREATED"
  | "PAID"
  | "DONE"
  | "CANCELLED"
  | "EXPIRED"
  | "FAILED";

// --- Valid Transitions Map ---

/**
 * Deterministic transition map: for each state, lists all states
 * it may legally transition to. Any transition not in this map
 * is invalid and must be rejected.
 */
export const VALID_TRANSITIONS: Record<PurchaseState, readonly PurchaseState[]> = {
  DECIDED: ["CONFIRMING"],
  CONFIRMING: ["APPROVED", "CANCELLED"],
  APPROVED: ["ORDER_CREATED", "EXPIRED", "CANCELLED"],
  ORDER_CREATED: ["PAID", "FAILED", "CANCELLED"],
  PAID: ["DONE", "FAILED"],
  // Terminal states — no outgoing transitions allowed
  DONE: [],
  CANCELLED: [],
  EXPIRED: [],
  FAILED: [],
} as const;

// --- Approval Expiry ---

/** How long an approval remains valid (10 minutes). */
export const APPROVAL_EXPIRY_MS = 10 * 60 * 1000;

// --- Terminal States ---

/** Set of states that have no outgoing transitions. */
const TERMINAL_STATES = new Set<PurchaseState>(["DONE", "CANCELLED", "EXPIRED", "FAILED"]);

// --- Transition Validation ---

/**
 * Validate whether a transition from `from` to `to` is allowed.
 *
 * @returns `true` if the transition is valid, `false` otherwise.
 */
export function isValidTransition(from: PurchaseState, to: PurchaseState): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed.includes(to);
}

/**
 * Assert a transition is valid, throwing a descriptive error if not.
 *
 * @throws {Error} when the transition is not in VALID_TRANSITIONS.
 */
export function assertValidTransition(from: PurchaseState, to: PurchaseState): void {
  if (!isValidTransition(from, to)) {
    throw new Error(
      `Invalid purchase state transition: ${from} → ${to}. ` +
        `Allowed transitions from ${from}: [${VALID_TRANSITIONS[from].join(", ")}]`
    );
  }
}

// --- State Query Helpers ---

/**
 * Whether the given state is terminal (no further transitions possible).
 */
export function isTerminalState(state: PurchaseState): boolean {
  return TERMINAL_STATES.has(state);
}

/**
 * Whether the given state represents a successful purchase completion.
 */
export function isCompleted(state: PurchaseState): boolean {
  return state === "DONE";
}

/**
 * Whether the given state represents a failure or cancellation.
 */
export function isFailed(state: PurchaseState): boolean {
  return state === "CANCELLED" || state === "EXPIRED" || state === "FAILED";
}

// --- Approval Expiry Check ---

/**
 * Check whether an approval has expired.
 *
 * @param approvedAt - Timestamp when the approval was granted.
 * @param now - Current timestamp (injectable for testing).
 * @param expiryMs - How long approval is valid (default: APPROVAL_EXPIRY_MS).
 * @returns `true` if the approval has expired.
 */
export function isApprovalExpired(
  approvedAt: number,
  now: number = Date.now(),
  expiryMs: number = APPROVAL_EXPIRY_MS
): boolean {
  return now - approvedAt >= expiryMs;
}

/**
 * Calculate remaining time until approval expires.
 *
 * @returns Milliseconds remaining, or 0 if already expired.
 */
export function approvalRemainingMs(
  approvedAt: number,
  now: number = Date.now(),
  expiryMs: number = APPROVAL_EXPIRY_MS
): number {
  const remaining = expiryMs - (now - approvedAt);
  return remaining > 0 ? remaining : 0;
}

// --- Purchase Record Type ---

/**
 * Server-side purchase record. Tracks the full lifecycle.
 *
 * V1 LIMITATION: Stored in-memory only. Not persisted to disk or database.
 * All purchase state is lost on server restart.
 */
export interface PurchaseRecord {
  /** Unique purchase identifier. */
  purchaseId: string;
  /** Product ID from the catalog. */
  productId: string;
  /** Current state in the lifecycle. */
  state: PurchaseState;
  /** When the purchase was first created (DECIDED). */
  createdAt: number;
  /** When the last state transition occurred. */
  updatedAt: number;
  /** When approval was granted (APPROVED). Null if not yet approved. */
  approvedAt: number | null;
  /** When the approval expires. Null if not yet approved. */
  expiresAt: number | null;
  /** Razorpay order ID once created. Null before ORDER_CREATED. */
  razorpayOrderId: string | null;
  /** Razorpay payment ID once verified. Null before PAID. */
  razorpayPaymentId: string | null;
  /**
   * Trusted merchant offer reference bound at purchase creation.
   * Set when the purchase is merchant-aware; null for legacy product-only purchases.
   * The offer must be resolved server-side from MerchantRepository — never trusted from client.
   */
  merchantOfferId: string | null;
}

// --- Purchase Store (V1 In-Memory) ---

/**
 * V1 in-memory purchase store.
 *
 * LIMITATION: Not production-persistent. Lost on server restart.
 * Replace with database-backed store for production use.
 */
class PurchaseStore {
  private purchases = new Map<string, PurchaseRecord>();

  /** Create a new purchase record in DECIDED state. */
  create(purchaseId: string, productId: string, merchantOfferId?: string): PurchaseRecord {
    const now = Date.now();
    const record: PurchaseRecord = {
      purchaseId,
      productId,
      state: "DECIDED",
      createdAt: now,
      updatedAt: now,
      approvedAt: null,
      expiresAt: null,
      razorpayOrderId: null,
      razorpayPaymentId: null,
      merchantOfferId: merchantOfferId ?? null,
    };
    this.purchases.set(purchaseId, record);
    return record;
  }

  /** Retrieve a purchase by ID. */
  get(purchaseId: string): PurchaseRecord | null {
    return this.purchases.get(purchaseId) ?? null;
  }

  /** Update the state of a purchase. */
  updateState(purchaseId: string, newState: PurchaseState): PurchaseRecord {
    const record = this.purchases.get(purchaseId);
    if (!record) {
      throw new Error(`Purchase ${purchaseId} not found.`);
    }
    assertValidTransition(record.state, newState);
    record.state = newState;
    record.updatedAt = Date.now();
    return record;
  }

  /** Set approval details on a purchase. */
  approve(purchaseId: string, now: number = Date.now()): PurchaseRecord {
    const record = this.purchases.get(purchaseId);
    if (!record) {
      throw new Error(`Purchase ${purchaseId} not found.`);
    }
    assertValidTransition(record.state, "APPROVED");
    record.state = "APPROVED";
    record.approvedAt = now;
    record.expiresAt = now + APPROVAL_EXPIRY_MS;
    record.updatedAt = now;
    return record;
  }

  /** Set Razorpay order details after order creation. */
  setRazorpayOrder(purchaseId: string, orderId: string): PurchaseRecord {
    const record = this.purchases.get(purchaseId);
    if (!record) {
      throw new Error(`Purchase ${purchaseId} not found.`);
    }
    assertValidTransition(record.state, "ORDER_CREATED");
    record.state = "ORDER_CREATED";
    record.razorpayOrderId = orderId;
    record.updatedAt = Date.now();
    return record;
  }

  /** Set Razorpay payment details after verification. */
  setRazorpayPayment(purchaseId: string, paymentId: string): PurchaseRecord {
    const record = this.purchases.get(purchaseId);
    if (!record) {
      throw new Error(`Purchase ${purchaseId} not found.`);
    }
    assertValidTransition(record.state, "PAID");
    record.state = "PAID";
    record.razorpayPaymentId = paymentId;
    record.updatedAt = Date.now();
    return record;
  }

  /**
   * Atomically finalize a verified payment.
   *
   * The two legal transitions are validated before the record is changed so
   * callers never observe PAID/DONE unless both transitions can complete.
   */
  finalizeVerifiedPayment(purchaseId: string, paymentId: string): PurchaseRecord {
    const record = this.purchases.get(purchaseId);
    if (!record) {
      throw new Error(`Purchase ${purchaseId} not found.`);
    }

    assertValidTransition(record.state, "PAID");
    assertValidTransition("PAID", "DONE");

    const now = Date.now();
    record.razorpayPaymentId = paymentId;
    record.state = "DONE";
    record.updatedAt = now;
    return record;
  }

  /** Mark a purchase as completed. */
  complete(purchaseId: string): PurchaseRecord {
    return this.updateState(purchaseId, "DONE");
  }

  /** Cancel a purchase. */
  cancel(purchaseId: string): PurchaseRecord {
    return this.updateState(purchaseId, "CANCELLED");
  }

  /** Expire a purchase. */
  expire(purchaseId: string): PurchaseRecord {
    return this.updateState(purchaseId, "EXPIRED");
  }

  /** Mark a purchase as failed. */
  fail(purchaseId: string): PurchaseRecord {
    return this.updateState(purchaseId, "FAILED");
  }

  /** Get all purchases (for debugging). */
  all(): PurchaseRecord[] {
    return Array.from(this.purchases.values());
  }

  /** Clear the store (for testing). */
  clear(): void {
    this.purchases.clear();
  }
}

/** Singleton purchase store for V1 in-memory persistence. */
export const purchaseStore = new PurchaseStore();
