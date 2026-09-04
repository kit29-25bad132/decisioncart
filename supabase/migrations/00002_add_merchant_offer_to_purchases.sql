-- ============================================================
-- DecisionCart — Add Merchant Offer Support to Purchases
-- Migration: 00002_add_merchant_offer_to_purchases
--
-- Adds the merchant_offer_id column to the purchases table
-- to support merchant-aware checkout. This column is nullable
-- because catalog-only purchases (legacy path) do not have
-- an associated merchant offer.
--
-- Also adds missing audit event types for the merchant
-- offer lifecycle: OFFER_VERIFIED, OFFER_PRICE_CHANGED,
-- MERCHANT_OFFER_SELECTED.
-- ============================================================

-- --- Add merchant_offer_id column ---
-- Nullable TEXT column. No foreign key constraint because
-- the merchant offers table is in-memory (demo data) and
-- may not exist in the database. The application resolves
-- offers server-side via MerchantRepository regardless.
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS merchant_offer_id TEXT;

-- --- Add index for merchant offer lookups ---
-- Useful if future queries need to find purchases by merchant offer.
CREATE INDEX IF NOT EXISTS idx_purchases_merchant_offer_id
  ON purchases (merchant_offer_id)
  WHERE merchant_offer_id IS NOT NULL;

-- --- Extend audit_event_type enum ---
-- Add missing event types used by the merchant-aware checkout flow.
-- ALTER TYPE ... ADD VALUE does not support IF NOT EXISTS in
-- PostgreSQL < 12, so we use a DO block for idempotency.

DO $$
BEGIN
  -- OFFER_VERIFIED: logged when server re-verifies offer before Razorpay
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'audit_event_type'
      AND e.enumlabel = 'OFFER_VERIFIED'
  ) THEN
    ALTER TYPE audit_event_type ADD VALUE 'OFFER_VERIFIED';
  END IF;

  -- OFFER_PRICE_CHANGED: logged when offer price differs from cached price
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'audit_event_type'
      AND e.enumlabel = 'OFFER_PRICE_CHANGED'
  ) THEN
    ALTER TYPE audit_event_type ADD VALUE 'OFFER_PRICE_CHANGED';
  END IF;

  -- MERCHANT_OFFER_SELECTED: logged when a merchant offer is bound to a purchase
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'audit_event_type'
      AND e.enumlabel = 'MERCHANT_OFFER_SELECTED'
  ) THEN
    ALTER TYPE audit_event_type ADD VALUE 'MERCHANT_OFFER_SELECTED';
  END IF;
END $$;
