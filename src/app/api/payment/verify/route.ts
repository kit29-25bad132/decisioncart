// ============================================================
// DecisionCart — Payment Verification API Route
// Server-side only. Verifies Razorpay payment signatures
// using HMAC SHA256.
//
// V1 UPDATE: Updates purchase state to PAID on successful
// verification, then completes the purchase (DONE).
// Does NOT return success if purchase state update fails.
// Handles repeated verification after DONE safely.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import Razorpay from "razorpay";
import { getPurchaseRepository, isInMemoryForced } from "@/engine/purchase-repository";
import { getCatalog } from "@/catalog/demo-data";
import { getMerchantRepository } from "@/merchant/merchant-repository";
import type { PurchaseRecord } from "@/engine/purchase-state-machine";

/**
 * POST /api/payment/verify
 *
 * Verifies a Razorpay payment signature to confirm authenticity.
 * Uses HMAC SHA256 with the server-side secret key.
 * Updates purchase state on success.
 *
 * After signature validation:
 * - Finds purchase by razorpay_order_id
 * - Verifies purchase is in ORDER_CREATED state
 * - Transitions ORDER_CREATED → PAID → DONE
 * - Returns failure if state update fails
 */
export async function POST(request: NextRequest) {
  try {
    // --- 1. Validate environment variables ---
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keySecret) {
      console.error("Razorpay secret key is not configured.");
      return NextResponse.json(
        { success: false, error: "Payment verification service is not configured." },
        { status: 500 }
      );
    }

    // --- 2. Parse and validate request body ---
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON in request body." },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Request body must be a JSON object." },
        { status: 400 }
      );
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      body as Record<string, unknown>;

    // --- 3. Validate all required fields ---
    if (
      !razorpay_order_id ||
      typeof razorpay_order_id !== "string" ||
      razorpay_order_id.trim().length === 0
    ) {
      return NextResponse.json(
        { success: false, error: "razorpay_order_id is required." },
        { status: 400 }
      );
    }

    if (
      !razorpay_payment_id ||
      typeof razorpay_payment_id !== "string" ||
      razorpay_payment_id.trim().length === 0
    ) {
      return NextResponse.json(
        { success: false, error: "razorpay_payment_id is required." },
        { status: 400 }
      );
    }

    if (
      !razorpay_signature ||
      typeof razorpay_signature !== "string" ||
      razorpay_signature.trim().length === 0
    ) {
      return NextResponse.json(
        { success: false, error: "razorpay_signature is required." },
        { status: 400 }
      );
    }

    // --- 4. Compute expected HMAC SHA256 signature ---
    const payload = `${razorpay_order_id.trim()}|${razorpay_payment_id.trim()}`;
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(payload)
      .digest("hex");

    // --- 5. Compare signatures using timing-safe comparison ---
    const receivedBuf = Buffer.from(razorpay_signature.trim(), "utf8");
    const expectedBuf = Buffer.from(expectedSignature, "utf8");

    // Ensure buffer lengths match before timingSafeEqual
    if (receivedBuf.length !== expectedBuf.length) {
      return NextResponse.json(
        { success: false, message: "Payment verification failed." },
        { status: 400 }
      );
    }

    const isValid = crypto.timingSafeEqual(receivedBuf, expectedBuf);

    if (!isValid) {
      return NextResponse.json(
        { success: false, message: "Payment verification failed." },
        { status: 400 }
      );
    }

    // --- 6. Signature valid — update purchase state ---

    // Find purchase by razorpay_order_id
    const repo = await getPurchaseRepository();
    const purchase = await repo.getPurchaseByRazorpayOrderId(razorpay_order_id.trim());

    if (!purchase) {
      return NextResponse.json(
        { success: false, message: "Payment verified but no purchase record found for this order." },
        { status: 404 }
      );
    }

    // Handle repeated verification after DONE — safe, return success
    if (purchase.state === "DONE") {
      return NextResponse.json({
        success: true,
        message: "Payment verified successfully.",
      });
    }

    // Verify purchase is in ORDER_CREATED state
    if (purchase.state !== "ORDER_CREATED") {
      return NextResponse.json(
        {
          success: false,
          message: `Payment verified but purchase is in an unexpected state: ${purchase.state}`,
        },
        { status: 409 }
      );
    }

    // --- 7. Amount verification (server-authoritative) ---
    // TRUST BOUNDARY: the paid amount is retrieved server-side from
    // Razorpay. Any amount supplied by the client is ignored entirely.
    const expectedAmountInPaise = await resolveExpectedAmountInPaise(purchase);

    if (expectedAmountInPaise === null) {
      // The authoritative amount cannot be established — fail closed.
      // The purchase is NOT marked PAID or DONE.
      console.error(
        "Cannot resolve authoritative purchase amount for payment verification."
      );
      return NextResponse.json(
        { success: false, message: "Payment verification failed." },
        { status: 500 }
      );
    }

    // The Razorpay key ID is required to fetch the payment server-side.
    const keyId = process.env.RAZORPAY_KEY_ID;
    if (!keyId) {
      console.error("Razorpay key ID is not configured.");
      return NextResponse.json(
        { success: false, message: "Payment verification service is not configured." },
        { status: 500 }
      );
    }

    let paidAmountInPaise: number | null = null;
    let paidOrderId: string | null = null;
    try {
      const razorpay = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });
      const payment = await razorpay.payments.fetch(razorpay_payment_id.trim());
      paidAmountInPaise =
        payment && typeof payment.amount === "number" ? payment.amount : null;
      paidOrderId =
        payment && typeof payment.order_id === "string" ? payment.order_id : null;
    } catch (fetchError: unknown) {
      // Payment could not be retrieved from Razorpay — fail closed.
      console.error(
        "Failed to fetch Razorpay payment for amount verification:",
        fetchError
      );
      return NextResponse.json(
        { success: false, message: "Payment verification failed." },
        { status: 500 }
      );
    }

    // The fetched payment must belong to the signed Razorpay order.
    if (
      paidAmountInPaise === null ||
      paidOrderId !== razorpay_order_id.trim()
    ) {
      return NextResponse.json(
        { success: false, message: "Payment verification failed." },
        { status: 400 }
      );
    }

    // The paid amount must exactly match the authoritative server-side amount.
    if (paidAmountInPaise !== expectedAmountInPaise) {
      // Amount mismatch — reject. The purchase remains in ORDER_CREATED:
      // it is NOT marked PAID or DONE, and no receipt can be issued.
      try {
        await repo.createAuditEvent(
          purchase.purchaseId,
          "PAYMENT_AMOUNT_MISMATCH",
          "ORDER_CREATED",
          "ORDER_CREATED",
          {
            razorpayOrderId: razorpay_order_id.trim(),
            expectedAmount: expectedAmountInPaise,
            paidAmount: paidAmountInPaise,
          }
        );
      } catch (auditError: unknown) {
        console.error(
          "Failed to record payment amount mismatch audit event:",
          auditError
        );
      }
      return NextResponse.json(
        { success: false, message: "Payment verification failed." },
        { status: 400 }
      );
    }

    // Transition ORDER_CREATED → PAID → DONE
    // Do NOT swallow transition errors — return failure if state update fails
    try {
      await repo.setRazorpayPayment(
        purchase.purchaseId,
        razorpay_payment_id.trim()
      );
      await repo.createAuditEvent(
        purchase.purchaseId,
        "PAYMENT_VERIFIED",
        "ORDER_CREATED",
        "PAID",
        { razorpayOrderId: razorpay_order_id.trim() }
      );

      // Update payment record with verified payment ID (only when Supabase is configured and active)
      const supabaseConfigured =
        !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
        !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
        !isInMemoryForced();

      if (supabaseConfigured) {
        try {
          const { updatePaymentRecord } = await import(
            "@/engine/supabase-purchase-repository"
          );
          await updatePaymentRecord({
            purchaseId: purchase.purchaseId,
            razorpayPaymentId: razorpay_payment_id.trim(),
            status: "verified",
          });
        } catch (paymentError: unknown) {
          // Payment record persistence failed. The purchase state has already
          // transitioned to PAID. We cannot silently pretend persistence succeeded.
          console.error("Failed to update payment record:", paymentError);
          return NextResponse.json(
            {
              success: false,
              message: "Payment verified but persistence failed. Please contact support.",
            },
            { status: 500 }
          );
        }
      }

      await repo.completePurchase(purchase.purchaseId);
      await repo.createAuditEvent(
        purchase.purchaseId,
        "PURCHASE_COMPLETED",
        "PAID",
        "DONE"
      );
    } catch (err) {
      console.error("Failed to update purchase state after payment verification:", err);
      return NextResponse.json(
        {
          success: false,
          message: "Payment verified but failed to update purchase state. Please contact support.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Payment verified successfully.",
    });
  } catch (error: unknown) {
    console.error("Payment verification error:", error);
    return NextResponse.json(
      { success: false, message: "Payment verification failed." },
      { status: 500 }
    );
  }
}

// --- Helpers ---

/**
 * Resolve the authoritative expected payment amount in paise from
 * server-side purchase state. The client is never consulted.
 *
 * Priority:
 *  1. Bound merchant offer price (merchant-aware purchases)
 *  2. Trusted server-side catalog price (catalog-only purchases)
 *
 * Returns null when the amount cannot be established — callers must
 * fail closed in that case.
 */
async function resolveExpectedAmountInPaise(
  purchase: PurchaseRecord
): Promise<number | null> {
  // Merchant-aware purchase: the bound offer price is authoritative.
  if (purchase.merchantOfferId) {
    const merchantRepo = await getMerchantRepository();
    const offer = await merchantRepo.getOffer(purchase.merchantOfferId);

    if (!offer || offer.price <= 0) {
      return null;
    }
    return Math.round(offer.price * 100);
  }

  // Catalog-only purchase: the trusted catalog price is authoritative.
  // Matches the receipt route's catalog resolution strategy.
  const allCatalogs = ["smartphone", "laptop"];
  for (const catalogCategory of allCatalogs) {
    const product = getCatalog(catalogCategory).find(
      (p) => p.id === purchase.productId
    );
    if (product) {
      return Math.round(product.price * 100);
    }
  }

  return null;
}
