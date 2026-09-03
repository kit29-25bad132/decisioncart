// ============================================================
// DecisionCart — Supabase Database Row Types
//
// Minimal types representing raw column shapes returned by
// the Supabase client. These use snake_case to match the
// database columns and are used for mapping to/from the
// existing camelCase domain types in the engine.
//
// These intentionally do NOT duplicate the full domain model.
// They exist solely to type Supabase query results.
// ============================================================

/** Raw row shape for the `purchases` table. */
export interface PurchaseRow {
  id: string;
  product_id: string;
  merchant_offer_id: string | null;
  state: string;
  approved_at: string | null;
  expires_at: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Raw row shape for the `purchase_events` table. */
export interface PurchaseEventRow {
  id: string;
  purchase_id: string;
  event_type: string;
  previous_state: string | null;
  resulting_state: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Raw row shape for the `payments` table. */
export interface PaymentRow {
  id: string;
  purchase_id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  status: string;
  amount: number | null;
  currency: string | null;
  created_at: string;
  updated_at: string;
}
