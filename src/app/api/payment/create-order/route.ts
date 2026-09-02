// ============================================================
// DecisionCart — Create Razorpay Order API Route
// Server-side only. Amount is always derived from the server
// catalog — never trusted from the client.
//
// V1 UPDATE: Requires an approved purchase record before creating
// an order. Validates approval state, expiry, and product match.
// Transitions APPROVED → ORDER_CREATED BEFORE creating the
// Razorpay order to prevent duplicate order creation.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getCatalog } from "@/catalog/demo-data";
import {
  purchaseStore,
  isApprovalExpired,
} from "@/engine/purchase-state-machine";

/**
 * POST /api/payment/create-order
 *
 * Creates a Razorpay order for a given product.
 * Requires a valid purchase record in APPROVED state.
 * The price is always read from the server-side catalog.
 *
 * Duplicate prevention: transitions APPROVED → ORDER_CREATED
 * before creating the Razorpay order. If two concurrent requests
 * try, only one will succeed on the transition.
 */
export async function POST(request: NextRequest) {
  try {
    // --- 1. Validate environment variables ---
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      console.error("Razorpay environment variables are not configured.");
      return NextResponse.json(
        { success: false, error: "Payment service is not configured." },
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

    const { productId, category, purchaseId } = body as Record<string, unknown>;

    // --- 3. Validate required fields ---
    if (!productId || typeof productId !== "string" || productId.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "productId is required and must be a non-empty string." },
        { status: 400 }
      );
    }

    if (!category || typeof category !== "string" || category.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "category is required and must be a non-empty string." },
        { status: 400 }
      );
    }

    if (!purchaseId || typeof purchaseId !== "string" || purchaseId.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "purchaseId is required. Approval must be granted before order creation." },
        { status: 400 }
      );
    }

    // --- 4. Validate purchase record and approval state ---
    const purchase = purchaseStore.get(purchaseId.trim());

    if (!purchase) {
      return NextResponse.json(
        { success: false, error: "Purchase record not found." },
        { status: 404 }
      );
    }

    if (purchase.state !== "APPROVED") {
      return NextResponse.json(
        {
          success: false,
          error: `Purchase must be approved before creating an order. Current state: ${purchase.state}`,
        },
        { status: 403 }
      );
    }

    // --- 5. Check approval expiry ---
    if (purchase.approvedAt === null || isApprovalExpired(purchase.approvedAt)) {
      // Expire the purchase record
      purchaseStore.expire(purchaseId.trim());
      return NextResponse.json(
        { success: false, error: "Purchase approval has expired. Please approve again." },
        { status: 410 }
      );
    }

    // --- 6. Verify product matches purchase record ---
    if (purchase.productId !== productId.trim()) {
      return NextResponse.json(
        { success: false, error: "Product ID does not match the approved purchase." },
        { status: 400 }
      );
    }

    // --- 7. Transition APPROVED → ORDER_CREATED BEFORE Razorpay ---
    // This prevents duplicate order creation: only the first request
    // to successfully transition will proceed to create the Razorpay order.
    let purchaseRecord;
    try {
      purchaseRecord = purchaseStore.setRazorpayOrder(purchaseId.trim(), "pending");
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: `Purchase cannot be transitioned to ORDER_CREATED. Current state: ${purchase.state}`,
        },
        { status: 409 }
      );
    }

    // --- 8. Look up the product from the server-side catalog ---
    const catalog = getCatalog(category.trim());
    const product = catalog.find((p) => p.id === productId.trim());

    if (!product) {
      return NextResponse.json(
        { success: false, error: "Product not found in the catalog." },
        { status: 404 }
      );
    }

    // --- 9. Convert INR price to paise ---
    // Razorpay expects amounts in the smallest currency unit (paise for INR).
    const amountInPaise = Math.round(product.price * 100);

    // --- 10. Initialize Razorpay server-side ---
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    // --- 11. Create the Razorpay order ---
    // The purchase is already in ORDER_CREATED state (step 7).
    // If Razorpay fails, recover by transitioning to FAILED so the
    // purchase record does not remain permanently stuck.
    try {
      const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt: `rcpt_${product.id}_${Date.now()}`,
        notes: {
          productId: product.id,
          productName: product.name,
          category: product.category,
          purchaseId: purchaseRecord.purchaseId,
        },
      });

      // --- 12. Update purchase record with actual Razorpay order ID ---
      purchaseRecord.razorpayOrderId = order.id;
      purchaseRecord.updatedAt = Date.now();

      // --- 13. Return safe response (no secrets exposed) ---
      return NextResponse.json({
        success: true,
        order: {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
          productId: product.id,
          productName: product.name,
        },
        keyId,
      });
    } catch (razorpayError: unknown) {
      // Razorpay order creation failed. Transition ORDER_CREATED → FAILED
      // so the purchase record does not remain permanently stuck.
      // VALID_TRANSITIONS[ORDER_CREATED] includes FAILED.
      try {
        purchaseStore.fail(purchaseId.trim());
      } catch (failError: unknown) {
        // If even the FAIL transition fails, log but still return error.
        console.error("Failed to transition purchase to FAILED state:", failError);
      }
      console.error("Failed to create Razorpay order:", razorpayError);
      return NextResponse.json(
        { success: false, error: "Failed to create payment order. Please try again." },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    console.error("Failed to create Razorpay order:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create payment order. Please try again." },
      { status: 500 }
    );
  }
}
