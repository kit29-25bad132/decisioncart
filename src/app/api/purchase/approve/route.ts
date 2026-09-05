// ============================================================
// DecisionCart — Purchase Approval API Route
// Server-side only. Transitions CONFIRMING → APPROVED with
// server-generated approval timestamps and expiry.
// The browser must NOT generate approval expiry timestamps.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getPurchaseRepository } from "@/engine/purchase-repository";
import { getMerchantRepository } from "@/merchant/merchant-repository";
import { getCatalog } from "@/catalog/demo-data";

/**
 * POST /api/purchase/approve
 *
 * Transitions a purchase from CONFIRMING to APPROVED.
 * Generates approval timestamps and expiry server-side.
 *
 * Request:
 *   { purchaseId: "..." }
 *
 * Response:
 *   { success: true, purchaseId: "...", state: "APPROVED", expiresAt: "..." }
 */
export async function POST(request: NextRequest) {
  try {
    // --- 1. Parse and validate request body ---
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

    const { purchaseId } = body as Record<string, unknown>;

    // --- 2. Validate required fields ---
    if (!purchaseId || typeof purchaseId !== "string" || purchaseId.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "purchaseId is required." },
        { status: 400 }
      );
    }

    // --- 3. Find the purchase ---
    const repo = await getPurchaseRepository();
    const purchase = await repo.getPurchase(purchaseId.trim());

    if (!purchase) {
      return NextResponse.json(
        { success: false, error: "Purchase record not found." },
        { status: 404 }
      );
    }

    // --- 4. Validate: CONFIRMING → APPROVED ---
    if (purchase.state !== "CONFIRMING") {
      return NextResponse.json(
        {
          success: false,
          error: `Purchase must be in CONFIRMING state to approve. Current state: ${purchase.state}`,
        },
        { status: 409 }
      );
    }

    // --- 4b. Snapshot approved material merchant facts (server-side) ---
    // The browser is never authoritative for price, availability, stock,
    // merchant identity, or offer validity. Current values are resolved
    // from the trusted repositories at approval time and snapshotted
    // into the PURCHASE_APPROVED audit event. The payment create-order
    // boundary compares current server-side facts against this snapshot
    // so a stale approval cannot proceed on changed material facts.
    let approvedOfferSnapshot: {
      offerId: string;
      merchantId: string;
      price: number;
      currency: string;
      stock: number;
    } | null = null;

    if (purchase.merchantOfferId) {
      const merchantRepo = await getMerchantRepository();
      const offer = await merchantRepo.getOffer(purchase.merchantOfferId);

      if (!offer) {
        // Offer vanished between purchase creation and approval.
        // Fail closed — do not grant an approval on an invalid offer.
        return NextResponse.json(
          {
            success: false,
            error: "Merchant offer is no longer available. Please review and confirm a fresh purchase summary.",
          },
          { status: 409 }
        );
      }

      if (!offer.isAvailable || offer.stock <= 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Merchant offer is no longer available. Please review and confirm a fresh purchase summary.",
          },
          { status: 409 }
        );
      }

      approvedOfferSnapshot = {
        offerId: offer.id,
        merchantId: offer.merchantId,
        price: offer.price,
        currency: offer.currency,
        stock: offer.stock,
      };
    } else {
      // Catalog-only purchase: snapshot the trusted catalog price.
      const allCatalogs = ["smartphone", "laptop"];
      let approvedPrice: number | null = null;
      for (const catalogCategory of allCatalogs) {
        const product = getCatalog(catalogCategory).find(
          (p) => p.id === purchase.productId
        );
        if (product) {
          approvedPrice = product.price;
          break;
        }
      }
      approvedOfferSnapshot = approvedPrice !== null
        ? { offerId: "", merchantId: "", price: approvedPrice, currency: "INR", stock: 0 }
        : null;
    }

    // --- 5. Perform the approval (server generates timestamps + expiry) ---
    const previousState = purchase.state;
    const approved = await repo.approvePurchase(purchaseId.trim());

    // --- 6. Log audit event with approved material facts snapshot ---
    await repo.createAuditEvent(
      approved.purchaseId,
      "PURCHASE_APPROVED",
      previousState,
      "APPROVED",
      {
        expiresAt: approved.expiresAt,
        ...(approvedOfferSnapshot
          ? {
              approvedPrice: approvedOfferSnapshot.price,
              approvedCurrency: approvedOfferSnapshot.currency,
              ...(approvedOfferSnapshot.offerId
                ? {
                    approvedOfferId: approvedOfferSnapshot.offerId,
                    approvedMerchantId: approvedOfferSnapshot.merchantId,
                    approvedStock: approvedOfferSnapshot.stock,
                  }
                : {}),
            }
          : {}),
      }
    );

    // --- 7. Return approval details ---
    return NextResponse.json({
      success: true,
      purchaseId: approved.purchaseId,
      state: approved.state,
      expiresAt: approved.expiresAt,
    });
  } catch (error: unknown) {
    console.error("Failed to approve purchase:", error);
    return NextResponse.json(
      { success: false, error: "Failed to approve purchase. Please try again." },
      { status: 500 }
    );
  }
}
