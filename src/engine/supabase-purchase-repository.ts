// ============================================================
// DecisionCart — Supabase Purchase Repository
// Production database-backed implementation of PurchaseRepository.
// Maps between database snake_case rows and camelCase domain types.
//
// Uses the server-side Supabase client (service role key).
// All operations are async and go through the Supabase client.
// ============================================================

import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  PurchaseRow,
  PurchaseEventRow,
} from "@/lib/supabase/types";
import {
  assertValidTransition,
  APPROVAL_EXPIRY_MS,
} from "./purchase-state-machine";
import type { PurchaseRecord, PurchaseState } from "./purchase-state-machine";
import type {
  PurchaseRepository,
  AuditEvent,
  AuditEventType,
} from "./purchase-repository";

// --- Mapping Helpers ---

/** Convert a database purchase row to a domain PurchaseRecord. */
function rowToPurchaseRecord(row: PurchaseRow): PurchaseRecord {
  return {
    purchaseId: row.id,
    productId: row.product_id,
    state: row.state as PurchaseState,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    approvedAt: row.approved_at
      ? new Date(row.approved_at).getTime()
      : null,
    expiresAt: row.expires_at
      ? new Date(row.expires_at).getTime()
      : null,
    razorpayOrderId: row.razorpay_order_id,
    razorpayPaymentId: row.razorpay_payment_id,
    merchantOfferId: row.merchant_offer_id ?? null,
  };
}

/** Convert a database event row to a domain AuditEvent. */
function eventRowToAuditEvent(row: PurchaseEventRow): AuditEvent {
  return {
    eventId: row.id,
    purchaseId: row.purchase_id,
    eventType: row.event_type as AuditEventType,
    timestamp: new Date(row.created_at).getTime(),
    previousState: row.previous_state as PurchaseState | null,
    resultingState: row.resulting_state as PurchaseState,
    metadata: row.metadata ?? {},
  };
}

// --- Supabase Implementation ---

/**
 * Production Supabase-backed PurchaseRepository.
 *
 * All operations are async and go through the Supabase client.
 * State transitions are validated before database updates.
 * Audit events are persisted to the purchase_events table.
 */
export class SupabasePurchaseRepository implements PurchaseRepository {
  private get client() {
    return getSupabaseServerClient();
  }

  // --- Purchase Operations ---

  async createPurchase(
    purchaseId: string,
    productId: string,
    merchantOfferId?: string
  ): Promise<PurchaseRecord> {
    const now = new Date().toISOString();

    const { data, error } = await this.client
      .from("purchases")
      .insert({
        id: purchaseId,
        product_id: productId,
        merchant_offer_id: merchantOfferId ?? null,
        state: "DECIDED",
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      throw new Error(
        `Failed to create purchase: ${error.message}`
      );
    }

    return rowToPurchaseRecord(data as PurchaseRow);
  }

  async getPurchase(purchaseId: string): Promise<PurchaseRecord | null> {
    const { data, error } = await this.client
      .from("purchases")
      .select("*")
      .eq("id", purchaseId)
      .single();

    if (error) {
      // PGRST116 = row not found
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to get purchase: ${error.message}`);
    }

    return rowToPurchaseRecord(data as PurchaseRow);
  }

  async getPurchaseByRazorpayOrderId(
    orderId: string
  ): Promise<PurchaseRecord | null> {
    const { data, error } = await this.client
      .from("purchases")
      .select("*")
      .eq("razorpay_order_id", orderId)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(
        `Failed to get purchase by Razorpay order: ${error.message}`
      );
    }

    return rowToPurchaseRecord(data as PurchaseRow);
  }

  async transitionPurchaseState(
    purchaseId: string,
    newState: PurchaseState
  ): Promise<PurchaseRecord> {
    // 1. Retrieve current state
    const current = await this.getPurchase(purchaseId);
    if (!current) {
      throw new Error(`Purchase ${purchaseId} not found.`);
    }

    // 2. Validate transition
    assertValidTransition(current.state, newState);

    // 3. Perform update
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("purchases")
      .update({ state: newState, updated_at: now })
      .eq("id", purchaseId)
      .select()
      .single();

    if (error) {
      throw new Error(
        `Failed to transition purchase: ${error.message}`
      );
    }

    return rowToPurchaseRecord(data as PurchaseRow);
  }

  async approvePurchase(
    purchaseId: string,
    now: number = Date.now()
  ): Promise<PurchaseRecord> {
    // 1. Retrieve current state
    const current = await this.getPurchase(purchaseId);
    if (!current) {
      throw new Error(`Purchase ${purchaseId} not found.`);
    }

    // 2. Validate transition
    assertValidTransition(current.state, "APPROVED");

    // 3. Perform update with timestamps
    const nowIso = new Date(now).toISOString();
    const expiresAt = new Date(now + APPROVAL_EXPIRY_MS).toISOString();

    const { data, error } = await this.client
      .from("purchases")
      .update({
        state: "APPROVED",
        approved_at: nowIso,
        expires_at: expiresAt,
        updated_at: nowIso,
      })
      .eq("id", purchaseId)
      .select()
      .single();

    if (error) {
      throw new Error(
        `Failed to approve purchase: ${error.message}`
      );
    }

    return rowToPurchaseRecord(data as PurchaseRow);
  }

  async setRazorpayOrder(
    purchaseId: string,
    orderId: string
  ): Promise<PurchaseRecord> {
    // 1. Retrieve current state
    const current = await this.getPurchase(purchaseId);
    if (!current) {
      throw new Error(`Purchase ${purchaseId} not found.`);
    }

    // 2. Validate transition
    assertValidTransition(current.state, "ORDER_CREATED");

    // 3. Perform update
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("purchases")
      .update({
        state: "ORDER_CREATED",
        razorpay_order_id: orderId,
        updated_at: now,
      })
      .eq("id", purchaseId)
      .select()
      .single();

    if (error) {
      throw new Error(
        `Failed to set Razorpay order: ${error.message}`
      );
    }

    return rowToPurchaseRecord(data as PurchaseRow);
  }

  async updateRazorpayOrderId(
    purchaseId: string,
    orderId: string
  ): Promise<PurchaseRecord> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("purchases")
      .update({
        razorpay_order_id: orderId,
        updated_at: now,
      })
      .eq("id", purchaseId)
      .select()
      .single();

    if (error) {
      throw new Error(
        `Failed to update Razorpay order ID: ${error.message}`
      );
    }

    return rowToPurchaseRecord(data as PurchaseRow);
  }

  async setRazorpayPayment(
    purchaseId: string,
    paymentId: string
  ): Promise<PurchaseRecord> {
    // 1. Retrieve current state
    const current = await this.getPurchase(purchaseId);
    if (!current) {
      throw new Error(`Purchase ${purchaseId} not found.`);
    }

    // 2. Validate transition
    assertValidTransition(current.state, "PAID");

    // 3. Perform update
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("purchases")
      .update({
        state: "PAID",
        razorpay_payment_id: paymentId,
        updated_at: now,
      })
      .eq("id", purchaseId)
      .select()
      .single();

    if (error) {
      throw new Error(
        `Failed to set Razorpay payment: ${error.message}`
      );
    }

    return rowToPurchaseRecord(data as PurchaseRow);
  }

  async completePurchase(purchaseId: string): Promise<PurchaseRecord> {
    return this.transitionPurchaseState(purchaseId, "DONE");
  }

  async cancelPurchase(purchaseId: string): Promise<PurchaseRecord> {
    return this.transitionPurchaseState(purchaseId, "CANCELLED");
  }

  async expirePurchase(purchaseId: string): Promise<PurchaseRecord> {
    return this.transitionPurchaseState(purchaseId, "EXPIRED");
  }

  async failPurchase(purchaseId: string): Promise<PurchaseRecord> {
    return this.transitionPurchaseState(purchaseId, "FAILED");
  }

  // --- Audit Operations ---

  async createAuditEvent(
    purchaseId: string,
    eventType: AuditEventType,
    previousState: PurchaseState | null,
    resultingState: PurchaseState,
    metadata: Record<string, unknown> = {}
  ): Promise<AuditEvent> {
    const now = new Date().toISOString();

    const { data, error } = await this.client
      .from("purchase_events")
      .insert({
        purchase_id: purchaseId,
        event_type: eventType,
        previous_state: previousState,
        resulting_state: resultingState,
        metadata,
        created_at: now,
      })
      .select()
      .single();

    if (error) {
      throw new Error(
        `Failed to create audit event: ${error.message}`
      );
    }

    return eventRowToAuditEvent(data as PurchaseEventRow);
  }

  async listAuditEvents(purchaseId: string): Promise<AuditEvent[]> {
    const { data, error } = await this.client
      .from("purchase_events")
      .select("*")
      .eq("purchase_id", purchaseId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(
        `Failed to list audit events: ${error.message}`
      );
    }

    return (data ?? []).map(eventRowToAuditEvent);
  }

  // --- Debug / Testing Operations ---

  async listAllPurchases(): Promise<PurchaseRecord[]> {
    const { data, error } = await this.client
      .from("purchases")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(
        `Failed to list purchases: ${error.message}`
      );
    }

    return (data ?? []).map(rowToPurchaseRecord);
  }

  async clear(): Promise<void> {
    // Delete events first (foreign key constraint)
    await this.client.from("purchase_events").delete().neq("id", "");
    await this.client.from("payments").delete().neq("id", "");
    await this.client.from("purchases").delete().neq("id", "");
  }
}

// --- Payment Record Support ---

/**
 * Create or update a payment record when a Razorpay order is created.
 * Stores server-verified data only — never trusts client input.
 */
export async function upsertPaymentRecord(params: {
  purchaseId: string;
  razorpayOrderId: string;
  status: string;
  amount?: number;
  currency?: string;
}): Promise<void> {
  const client = getSupabaseServerClient();
  const now = new Date().toISOString();

  // Check if a payment record already exists for this purchase
  const { data: existing } = await client
    .from("payments")
    .select("id")
    .eq("purchase_id", params.purchaseId)
    .limit(1)
    .single();

  if (existing) {
    // Update existing record
    const { error } = await client
      .from("payments")
      .update({
        razorpay_order_id: params.razorpayOrderId,
        status: params.status,
        amount: params.amount ?? null,
        currency: params.currency ?? null,
        updated_at: now,
      })
      .eq("id", existing.id);

    if (error) {
      throw new Error(
        `Failed to update payment record: ${error.message}`
      );
    }
  } else {
    // Insert new record
    const { error } = await client.from("payments").insert({
      purchase_id: params.purchaseId,
      razorpay_order_id: params.razorpayOrderId,
      status: params.status,
      amount: params.amount ?? null,
      currency: params.currency ?? null,
      created_at: now,
      updated_at: now,
    });

    if (error) {
      throw new Error(
        `Failed to create payment record: ${error.message}`
      );
    }
  }
}

/**
 * Update a payment record with Razorpay payment ID after verification.
 * Uses server-side verified values only.
 */
export async function updatePaymentRecord(params: {
  purchaseId: string;
  razorpayPaymentId: string;
  status: string;
}): Promise<void> {
  const client = getSupabaseServerClient();
  const now = new Date().toISOString();

  const { error } = await client
    .from("payments")
    .update({
      razorpay_payment_id: params.razorpayPaymentId,
      status: params.status,
      updated_at: now,
    })
    .eq("purchase_id", params.purchaseId);

  if (error) {
    throw new Error(
      `Failed to update payment record: ${error.message}`
    );
  }
}
