// ============================================================
// DecisionCart — Create Razorpay Order API Route
// Server-side only. Amount is always derived from the server
// catalog — never trusted from the client.
//
// V1 UPDATE: Requires an approved purchase record before creating
// an order. Validates approval state, expiry, and product match.
// Transitions APPROVED → ORDER_CREATED BEFORE creating the
// Razorpay order to prevent duplicate order creation, using the
// real state machine (no fake Razorpay IDs). After Razorpay
// succeeds, the real order ID is persisted.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getCatalog } from "@/catalog/demo-data";
import { isApprovalExpired } from "@/engine/purchase-state-machine";
import { getPurchaseRepository, isInMemoryForced } from "@/engine/purchase-repository";

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
    const repo = await getPurchaseRepository();
    const purchase = await repo.getPurchase(purchaseId.trim());

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
      const prev = purchase.state;
      await repo.expirePurchase(purchaseId.trim());
      await repo.createAuditEvent(
        purchaseId.trim(),
        "PURCHASE_EXPIRED",
        prev,
        "EXPIRED",
        { reason: "approval_expired" }
      );
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
    // Uses the real state machine — no fake Razorpay order ID.
    // If Razorpay fails later, we transition ORDER_CREATED → FAILED.
    try {
      await repo.transitionPurchaseState(purchaseId.trim(), "ORDER_CREATED");
      await repo.createAuditEvent(
        purchaseId.trim(),
        "RAZORPAY_ORDER_CREATED",
        "APPROVED",
        "ORDER_CREATED",
        { productId: productId.trim(), category: category.trim() }
      );
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
          purchaseId: purchaseId.trim(),
        },
      });

      // --- 12. Persist the real Razorpay order ID ---
      // No fake placeholder IDs — only the real Razorpay order ID is stored.
      try {
        await repo.updateRazorpayOrderId(purchaseId.trim(), order.id);
      } catch (updateError: unknown) {
        console.error("Failed to persist Razorpay order ID:", updateError);
        // Transition to FAILED since we can't track the order
        try {
          await repo.failPurchase(purchaseId.trim());
          await repo.createAuditEvent(
            purchaseId.trim(),
            "RAZORPAY_ORDER_FAILED",
            "ORDER_CREATED",
            "FAILED",
            { reason: "failed_to_persist_razorpay_order_id" }
          );
        } catch {
          console.error("Failed to transition purchase to FAILED state after order ID persistence failure");
        }
        return NextResponse.json(
          { success: false, error: "Payment order created but persistence failed. Please contact support." },
          { status: 500 }
        );
      }

      // --- 13. Persist payment record (only when Supabase is configured and active) ---
      const supabaseConfigured =
        !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
        !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
        !isInMemoryForced();

      if (supabaseConfigured) {
        try {
          const { upsertPaymentRecord } = await import(
            "@/engine/supabase-purchase-repository"
          );
          await upsertPaymentRecord({
            purchaseId: purchaseId.trim(),
            razorpayOrderId: order.id,
            status: "created",
            amount: amountInPaise,
            currency: "INR",
          });
        } catch (paymentError: unknown) {
          // Payment record persistence failed. The purchase state has already
          // transitioned to ORDER_CREATED and a real Razorpay order exists.
          // We cannot silently pretend persistence succeeded.
          console.error("Failed to persist payment record:", paymentError);
          return NextResponse.json(
            {
              success: false,
              error: "Payment order created but persistence failed. Please contact support.",
            },
            { status: 500 }
          );
        }
      }

      // --- 14. Return safe response (no secrets exposed) ---
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
        await repo.failPurchase(purchaseId.trim());
        await repo.createAuditEvent(
          purchaseId.trim(),
          "RAZORPAY_ORDER_FAILED",
          "ORDER_CREATED",
          "FAILED",
          { reason: "razorpay_order_creation_failed" }
        );
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
