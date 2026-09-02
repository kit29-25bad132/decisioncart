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
import { purchaseStore } from "@/engine/purchase-state-machine";

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
    const allPurchases = purchaseStore.all();
    const purchase = allPurchases.find(
      (p) => p.razorpayOrderId === razorpay_order_id.trim()
    );

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

    // Transition ORDER_CREATED → PAID → DONE
    // Do NOT swallow transition errors — return failure if state update fails
    try {
      purchaseStore.setRazorpayPayment(
        purchase.purchaseId,
        razorpay_payment_id.trim()
      );
      purchaseStore.complete(purchase.purchaseId);
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
