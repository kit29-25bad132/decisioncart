// ============================================================
// DecisionCart — Create Razorpay Order API Route
// Server-side only. Amount is always derived from the server
// catalog or verified merchant offer — never trusted from client.
//
// V2 UPDATE: Supports merchant-aware checkout. When an offerId
// is provided, the Razorpay amount is derived from the verified
// merchant offer price. The server re-verifies the offer
// immediately before Razorpay order creation because price and
// stock are mutable.
//
// TRUST BOUNDARY: The client only supplies offerId as a
// reference. The server resolves, verifies, and derives
// the payment amount from the merchant repository.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getCatalog } from "@/catalog/demo-data";
import { isApprovalExpired } from "@/engine/purchase-state-machine";
import { getPurchaseRepository, isInMemoryForced } from "@/engine/purchase-repository";
import { getMerchantRepository } from "@/merchant/merchant-repository";

/**
 * POST /api/payment/create-order
 *
 * Creates a Razorpay order for a given product.
 * Requires a valid purchase record in APPROVED state.
 *
 * Catalog-only path:
 *   { productId, category, purchaseId }
 *   → Amount from catalog price
 *
 * Merchant-aware path:
 *   { productId, category, purchaseId, offerId }
 *   → Amount from verified merchant offer price
 *
 * Duplicate prevention: transitions APPROVED → ORDER_CREATED
 * before creating the Razorpay order.
 *
 * Re-verification: immediately before Razorpay order creation,
 * the offer is re-fetched because price and stock are mutable.
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

    const { productId, category, purchaseId, offerId } = body as Record<string, unknown>;

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

    // --- 7. If purchase is merchant-aware, verify offer binding ---
    // TRUST BOUNDARY: If purchase was created with an offerId,
    // the offerId in this request must match the bound offer.
    if (purchase.merchantOfferId) {
      // Purchase has a bound offer — request must provide matching offerId
      if (!offerId || typeof offerId !== "string" || offerId.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: "This purchase requires a merchant offer. Please provide offerId." },
          { status: 400 }
        );
      }
      if (offerId.trim() !== purchase.merchantOfferId) {
        return NextResponse.json(
          { success: false, error: "Offer ID does not match the purchase's bound merchant offer." },
          { status: 400 }
        );
      }
    }

    // --- 8. Resolve trusted price from server-side source ---
    let amountInPaise: number;
    let verifiedOffer: {
      price: number;
      currency: string;
      stock: number;
      isAvailable: boolean;
      merchantId: string;
      id: string;
    } | null = null;

    if (offerId && typeof offerId === "string" && offerId.trim().length > 0) {
      // --- Merchant-aware path: resolve offer from repository ---
      const merchantRepo = await getMerchantRepository();
      const trimmedOfferId = offerId.trim();

      // 8a. Resolve offer from trusted repository
      const offer = await merchantRepo.getOffer(trimmedOfferId);

      if (!offer) {
        return NextResponse.json(
          { success: false, error: "Merchant offer not found." },
          { status: 404 }
        );
      }

      // 8b. Verify offer belongs to the product
      if (offer.productId !== productId.trim()) {
        return NextResponse.json(
          { success: false, error: "Offer does not match the specified product." },
          { status: 400 }
        );
      }

      // 8c. Verify offer is available
      if (!offer.isAvailable) {
        return NextResponse.json(
          { success: false, error: "Merchant offer is no longer available." },
          { status: 409 }
        );
      }

      // 8d. Verify stock > 0
      if (offer.stock <= 0) {
        return NextResponse.json(
          { success: false, error: "Merchant offer is out of stock." },
          { status: 409 }
        );
      }

      // 8e. Verify price > 0
      if (offer.price <= 0) {
        return NextResponse.json(
          { success: false, error: "Merchant offer has an invalid price." },
          { status: 400 }
        );
      }

      // 8f. Verify merchant exists
      const merchant = await merchantRepo.getMerchant(offer.merchantId);
      if (!merchant) {
        return NextResponse.json(
          { success: false, error: "Merchant referenced by offer does not exist." },
          { status: 404 }
        );
      }

      verifiedOffer = offer;

      // TRUST BOUNDARY: Amount derived from server-verified offer price
      // Client price is NEVER used
      amountInPaise = Math.round(offer.price * 100);
    } else {
      // --- Catalog-only path: resolve price from catalog ---
      const catalog = getCatalog(category.trim());
      const product = catalog.find((p) => p.id === productId.trim());

      if (!product) {
        return NextResponse.json(
          { success: false, error: "Product not found in the catalog." },
          { status: 404 }
        );
      }

      // TRUST BOUNDARY: Amount derived from server-side catalog price
      amountInPaise = Math.round(product.price * 100);
    }

    // --- 9. Transition APPROVED → ORDER_CREATED BEFORE Razorpay ---
    // This prevents duplicate order creation: only the first request
    // to successfully transition will proceed to create the Razorpay order.
    try {
      await repo.transitionPurchaseState(purchaseId.trim(), "ORDER_CREATED");
      await repo.createAuditEvent(
        purchaseId.trim(),
        "RAZORPAY_ORDER_CREATED",
        "APPROVED",
        "ORDER_CREATED",
        {
          productId: productId.trim(),
          category: category.trim(),
          ...(verifiedOffer
            ? {
                offerId: verifiedOffer.id,
                merchantId: verifiedOffer.merchantId,
                verifiedPrice: verifiedOffer.price,
                currency: verifiedOffer.currency,
              }
            : {}),
        }
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

    // --- 10. Audit: log offer verification ---
    if (verifiedOffer) {
      await repo.createAuditEvent(
        purchaseId.trim(),
        "OFFER_VERIFIED",
        "APPROVED",
        "ORDER_CREATED",
        {
          offerId: verifiedOffer.id,
          merchantId: verifiedOffer.merchantId,
          verifiedPrice: verifiedOffer.price,
          currency: verifiedOffer.currency,
          stock: verifiedOffer.stock,
        }
      );

      // Check if price changed since purchase creation
      if (
        purchase.merchantOfferId &&
        verifiedOffer.price !== amountInPaise / 100
      ) {
        await repo.createAuditEvent(
          purchaseId.trim(),
          "OFFER_PRICE_CHANGED",
          "APPROVED",
          "ORDER_CREATED",
          {
            offerId: verifiedOffer.id,
            verifiedPrice: verifiedOffer.price,
          }
        );
      }
    }

    // --- 11. Initialize Razorpay server-side ---
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    // --- 12. Create the Razorpay order ---
    // The purchase is already in ORDER_CREATED state (step 9).
    // If Razorpay fails, recover by transitioning to FAILED so the
    // purchase record does not remain permanently stuck.
    try {
      // Re-verify offer immediately before Razorpay call
      // (price and stock are mutable — stale data is dangerous)
      if (verifiedOffer) {
        const merchantRepo = await getMerchantRepository();
        const freshOffer = await merchantRepo.getOffer(verifiedOffer.id);

        if (!freshOffer) {
          // Offer was removed between verification and now — fail
          await repo.failPurchase(purchaseId.trim());
          await repo.createAuditEvent(
            purchaseId.trim(),
            "RAZORPAY_ORDER_FAILED",
            "ORDER_CREATED",
            "FAILED",
            { reason: "offer_removed_before_razorpay" }
          );
          return NextResponse.json(
            { success: false, error: "Merchant offer is no longer available." },
            { status: 409 }
          );
        }

        if (!freshOffer.isAvailable || freshOffer.stock <= 0) {
          await repo.failPurchase(purchaseId.trim());
          await repo.createAuditEvent(
            purchaseId.trim(),
            "RAZORPAY_ORDER_FAILED",
            "ORDER_CREATED",
            "FAILED",
            { reason: "offer_unavailable_before_razorpay" }
          );
          return NextResponse.json(
            { success: false, error: "Merchant offer is no longer available." },
            { status: 409 }
          );
        }

        // Recalculate amount from latest price (ignore any stale client price)
        if (freshOffer.price !== verifiedOffer.price) {
          amountInPaise = Math.round(freshOffer.price * 100);
          await repo.createAuditEvent(
            purchaseId.trim(),
            "OFFER_PRICE_CHANGED",
            "ORDER_CREATED",
            "ORDER_CREATED",
            {
              offerId: freshOffer.id,
              previousPrice: verifiedOffer.price,
              newPrice: freshOffer.price,
            }
          );
        }

        // Update the verified offer reference for the response
        verifiedOffer = freshOffer;
      }

      const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt: `rcpt_${productId.trim()}_${Date.now()}`,
        notes: {
          productId: productId.trim(),
          purchaseId: purchaseId.trim(),
          ...(verifiedOffer
            ? {
                offerId: verifiedOffer.id,
                merchantId: verifiedOffer.merchantId,
              }
            : {}),
        },
      });

      // --- 13. Persist the real Razorpay order ID ---
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

      // --- 14. Persist payment record (only when Supabase is configured and active) ---
      const supabaseConfigured =
        !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
        !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
        !isInMemoryForced();

      if (supabaseConfigured) {
        try {
          const { upsertPaymentRecord } = await import(
            "@/engine/supabase-purchase-repository"
          );
          // TRUST BOUNDARY: amount is derived from verified server-side offer/catalog price
          await upsertPaymentRecord({
            purchaseId: purchaseId.trim(),
            razorpayOrderId: order.id,
            status: "created",
            amount: amountInPaise,
            currency: "INR",
          });
        } catch (paymentError: unknown) {
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

      // --- 15. Return safe response (no secrets exposed) ---
      return NextResponse.json({
        success: true,
        order: {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
          productId: productId.trim(),
        },
        keyId,
        ...(verifiedOffer
          ? {
              offerId: verifiedOffer.id,
              verifiedPrice: verifiedOffer.price,
            }
          : {}),
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
