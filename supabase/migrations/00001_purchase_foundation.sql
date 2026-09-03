-- ============================================================
-- DecisionCart — Purchase Persistence Foundation
-- Migration: 00001_purchase_foundation
--
-- Establishes the persistent purchase lifecycle tables:
--   - purchases: core purchase records
--   - purchase_events: audit trail for lifecycle transitions
--   - payments: Razorpay payment records
--
-- Row Level Security is enabled on all tables.
-- Authenticated ownership policies will be added in the
-- authentication milestone. For now, only server-side
-- operations via the service-role client are expected.
-- ============================================================

-- --- Purchase States Enum ---
-- Matches the TypeScript PurchaseState type exactly.
CREATE TYPE purchase_state AS ENUM (
  'DECIDED',
  'CONFIRMING',
  'APPROVED',
  'ORDER_CREATED',
  'PAID',
  'DONE',
  'CANCELLED',
  'EXPIRED',
  'FAILED'
);

-- --- Audit Event Types Enum ---
-- Matches the TypeScript AuditEventType type exactly.
CREATE TYPE audit_event_type AS ENUM (
  'PURCHASE_CREATED',
  'PURCHASE_CONFIRMED',
  'PURCHASE_APPROVED',
  'PRICE_VERIFIED',
  'RAZORPAY_ORDER_CREATED',
  'RAZORPAY_ORDER_FAILED',
  'PAYMENT_VERIFIED',
  'PURCHASE_COMPLETED',
  'PURCHASE_FAILED',
  'PURCHASE_EXPIRED',
  'PURCHASE_CANCELLED',
  'RECEIPT_GENERATED'
);

-- --- Purchases Table ---
-- Core purchase record. Stores the full lifecycle state.
-- Timestamps stored as timestamptz (UTC). Epoch-ms values
-- in the TypeScript layer are converted to/from timestamptz.
CREATE TABLE purchases (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          TEXT NOT NULL,
  state               purchase_state NOT NULL DEFAULT 'DECIDED',
  approved_at         TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  razorpay_order_id   TEXT,
  razorpay_payment_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for Razorpay order lookups (e.g., getPurchaseByRazorpayOrderId).
CREATE INDEX idx_purchases_razorpay_order_id
  ON purchases (razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;

-- Index for state-based queries (e.g., finding expired purchases).
CREATE INDEX idx_purchases_state
  ON purchases (state);

-- --- Purchase Events Table ---
-- Audit trail for every lifecycle transition. Append-only.
CREATE TABLE purchase_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id     UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  event_type      audit_event_type NOT NULL,
  previous_state  purchase_state,
  resulting_state purchase_state NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fetching event timeline for a specific purchase.
CREATE INDEX idx_purchase_events_purchase_id
  ON purchase_events (purchase_id, created_at);

-- --- Payments Table ---
-- Razorpay payment records tied to purchases.
CREATE TABLE payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id       UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  razorpay_order_id TEXT NOT NULL,
  razorpay_payment_id TEXT,
  status            TEXT NOT NULL DEFAULT 'created',
  amount            BIGINT,
  currency          TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for looking up payments by Razorpay order ID.
CREATE INDEX idx_payments_razorpay_order_id
  ON payments (razorpay_order_id);

-- Index for looking up payments by purchase.
CREATE INDEX idx_payments_purchase_id
  ON payments (purchase_id);

-- --- Row Level Security ---
-- Enabled on all tables. No permissive public write policies.
-- The service-role client bypasses RLS, so server operations
-- continue to work. Authenticated user ownership policies will
-- be added in the authentication milestone.
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
