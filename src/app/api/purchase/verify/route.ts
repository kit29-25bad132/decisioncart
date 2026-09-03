// ============================================================
// DecisionCart — Purchase Verification API Route
// Server-side only. Verifies product price and availability
// against the trusted catalog and merchant repository.
//
// V2 UPDATE: When an offerId is provided, the verified price
// comes from the merchant offer, NOT the product catalog.
// This ensures the merchant-aware checkout trust boundary.
//
// TRUST BOUNDARY: The client must NEVER be trusted for price,
// product identity, or availability. This endpoint resolves
// data from server-side sources only.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getCatalog } from "@/catalog/demo-data";
import { getMerchantRepository } from "@/merchant/merchant-repository";

/**
 * POST /api/purchase/verify
 *
 * Verifies a product against the server-side catalog and
 * optionally against a merchant offer.
 *
 * Catalog-only path:
 *   { productId, category, clientPrice? }
 *
 * Merchant-aware path:
 *   { productId, category, offerId }
 *
 * When offerId is provided, the trusted price comes from
 * the merchant offer — NOT the product catalog.
 *
 * Response:
 *   { success, productId, offerId?, merchantId?, verifiedPrice,
 *     currency, available, stock?, checkedAt, source,
 *     priceMismatch?, error? }
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

    const { productId, category, offerId, clientPrice } = body as Record<string, unknown>;

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

    // --- 3. Resolve product from trusted server-side catalog ---
    const catalog = getCatalog(category.trim());
    const product = catalog.find((p) => p.id === productId.trim());

    if (!product) {
      return NextResponse.json(
        {
          success: false,
          productId: productId.trim(),
          checkedAt: new Date().toISOString(),
          source: "DecisionCart demo catalog",
          error: `Product "${productId.trim()}" not found in "${category.trim()}" catalog.`,
        },
        { status: 404 }
      );
    }

    // --- 4. Verify category matches (prevent cross-category spoofing) ---
    if (product.category !== category.trim()) {
      return NextResponse.json(
        {
          success: false,
          productId: productId.trim(),
          checkedAt: new Date().toISOString(),
          source: "DecisionCart demo catalog",
          error: `Category mismatch: product belongs to "${product.category}" but "${category.trim()}" was requested.`,
        },
        { status: 400 }
      );
    }

    // --- 5. Merchant-aware verification path ---
    if (offerId && typeof offerId === "string" && offerId.trim().length > 0) {
      const merchantRepo = await getMerchantRepository();
      const trimmedOfferId = offerId.trim();

      // 5a. Resolve offer from trusted server-side repository
      const offer = await merchantRepo.getOffer(trimmedOfferId);

      if (!offer) {
        return NextResponse.json(
          {
            success: false,
            productId: product.id,
            offerId: trimmedOfferId,
            checkedAt: new Date().toISOString(),
            source: "merchant-repository",
            error: "Merchant offer not found.",
          },
          { status: 404 }
        );
      }

      // 5b. Verify offer belongs to the product
      if (offer.productId !== product.id) {
        return NextResponse.json(
          {
            success: false,
            productId: product.id,
            offerId: trimmedOfferId,
            checkedAt: new Date().toISOString(),
            source: "merchant-repository",
            error: "Offer does not belong to the specified product.",
          },
          { status: 400 }
        );
      }

      // 5c. Verify merchant exists
      const merchant = await merchantRepo.getMerchant(offer.merchantId);
      if (!merchant) {
        return NextResponse.json(
          {
            success: false,
            productId: product.id,
            offerId: trimmedOfferId,
            checkedAt: new Date().toISOString(),
            source: "merchant-repository",
            error: "Merchant referenced by offer does not exist.",
          },
          { status: 404 }
        );
      }

      // 5d. Check if client price differs from verified offer price
      const hasMismatch =
        typeof clientPrice === "number" && clientPrice !== offer.price;

      // 5e. Build merchant-aware verification response
      // TRUST BOUNDARY: verifiedPrice comes from offer.price, NOT product.price
      return NextResponse.json({
        success: true,
        productId: product.id,
        offerId: trimmedOfferId,
        merchantId: offer.merchantId,
        verifiedPrice: offer.price,
        currency: offer.currency,
        available: offer.isAvailable,
        stock: offer.stock,
        checkedAt: new Date().toISOString(),
        source: "merchant-repository",
        priceMismatch: hasMismatch
          ? {
              clientPrice,
              trustedPrice: offer.price,
              difference: offer.price - clientPrice,
            }
          : undefined,
      });
    }

    // --- 6. Catalog-only verification path (no offerId) ---
    const hasMismatch =
      typeof clientPrice === "number" && clientPrice !== product.price;

    return NextResponse.json({
      success: true,
      productId: product.id,
      verifiedPrice: product.price,
      currency: "INR",
      available: true,
      availabilitySource: "demo-catalog",
      checkedAt: new Date().toISOString(),
      source: "DecisionCart demo catalog",
      priceMismatch: hasMismatch
        ? {
            clientPrice,
            trustedPrice: product.price,
            difference: product.price - clientPrice,
          }
        : undefined,
    });
  } catch (error: unknown) {
    console.error("Failed to verify purchase:", error);
    return NextResponse.json(
      { success: false, error: "Failed to verify product. Please try again." },
      { status: 500 }
    );
  }
}
