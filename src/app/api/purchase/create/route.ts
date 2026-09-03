// ============================================================
// DecisionCart — Purchase Creation API Route
// Server-side only. Generates purchaseId and creates purchase
// record in DECIDED state. Client never supplies purchaseId.
//
// V2 UPDATE: Supports merchant-aware purchases. When an offerId
// is provided, the server resolves the offer from MerchantRepository,
// verifies availability, stock, price, and merchant, then binds
// the verified offer to the purchase.
//
// TRUST BOUNDARY: Client may only supply productId, category,
// and offerId. All price, merchant, and stock data is resolved
// server-side. Client-supplied merchant data is never trusted.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getCatalog } from "@/catalog/demo-data";
import { getPurchaseRepository } from "@/engine/purchase-repository";
import { getMerchantRepository } from "@/merchant/merchant-repository";

/**
 * POST /api/purchase/create
 *
 * Creates a new purchase record server-side.
 *
 * Legacy path (no offerId):
 *   { productId, category }
 *
 * Merchant-aware path (with offerId):
 *   { productId, category, offerId }
 *
 * The purchaseId is generated using crypto.randomUUID().
 * The offer is verified server-side against MerchantRepository.
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

    const { productId, category, offerId } = body as Record<string, unknown>;

    // --- 2. Validate required fields ---
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

    // --- 3. Validate optional offerId format ---
    if (offerId !== undefined && offerId !== null) {
      if (typeof offerId !== "string" || offerId.trim().length === 0) {
        return NextResponse.json(
          { success: false, error: "offerId must be a non-empty string when provided." },
          { status: 400 }
        );
      }
    }

    // --- 4. Look up the product from the server-side catalog ---
    const catalog = getCatalog(category.trim());
    const product = catalog.find((p) => p.id === productId.trim());

    if (!product) {
      return NextResponse.json(
        { success: false, error: "Product not found in the catalog." },
        { status: 404 }
      );
    }

    // --- 5. Merchant-aware path: resolve and verify offer ---
    let boundOfferId: string | null = null;

    if (offerId && typeof offerId === "string" && offerId.trim().length > 0) {
      const merchantRepo = await getMerchantRepository();
      const trimmedOfferId = offerId.trim();

      // 5a. Resolve offer from trusted server-side repository
      const offer = await merchantRepo.getOffer(trimmedOfferId);
      if (!offer) {
        return NextResponse.json(
          { success: false, error: "Merchant offer not found." },
          { status: 404 }
        );
      }

      // 5b. Verify offer belongs to the requested product
      if (offer.productId !== productId.trim()) {
        return NextResponse.json(
          { success: false, error: "Offer does not match the specified product." },
          { status: 400 }
        );
      }

      // 5c. Verify offer is available
      if (!offer.isAvailable) {
        return NextResponse.json(
          { success: false, error: "Merchant offer is no longer available." },
          { status: 409 }
        );
      }

      // 5d. Verify stock > 0
      if (offer.stock <= 0) {
        return NextResponse.json(
          { success: false, error: "Merchant offer is out of stock." },
          { status: 409 }
        );
      }

      // 5e. Verify price > 0
      if (offer.price <= 0) {
        return NextResponse.json(
          { success: false, error: "Merchant offer has an invalid price." },
          { status: 400 }
        );
      }

      // 5f. Verify merchant exists
      const merchant = await merchantRepo.getMerchant(offer.merchantId);
      if (!merchant) {
        return NextResponse.json(
          { success: false, error: "Merchant referenced by offer does not exist." },
          { status: 404 }
        );
      }

      boundOfferId = trimmedOfferId;
    }

    // --- 6. Generate cryptographically secure purchaseId ---
    const purchaseId = crypto.randomUUID();

    // --- 7. Create purchase via repository ---
    const repo = await getPurchaseRepository();
    const record = await repo.createPurchase(
      purchaseId,
      product.id,
      boundOfferId ?? undefined
    );

    // --- 8. Log audit event ---
    await repo.createAuditEvent(
      record.purchaseId,
      "PURCHASE_CREATED",
      null,
      "DECIDED",
      {
        productId: product.id,
        category: product.category,
        ...(boundOfferId ? { merchantOfferId: boundOfferId } : {}),
      }
    );

    // --- 9. Log merchant offer selection if applicable ---
    if (boundOfferId) {
      await repo.createAuditEvent(
        record.purchaseId,
        "MERCHANT_OFFER_SELECTED",
        null,
        "DECIDED",
        { offerId: boundOfferId }
      );
    }

    // --- 10. Return purchase info ---
    return NextResponse.json({
      success: true,
      purchaseId: record.purchaseId,
      state: record.state,
      ...(boundOfferId ? { offerId: boundOfferId } : {}),
    });
  } catch (error: unknown) {
    console.error("Failed to create purchase:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create purchase. Please try again." },
      { status: 500 }
    );
  }
}
