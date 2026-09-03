// ============================================================
// DecisionCart — Purchase Verification API Route
// Server-side only. Verifies product price and availability
// against the trusted catalog before order creation.
//
// The client must NEVER be trusted for price, product identity,
// or availability. This endpoint resolves the product from the
// server-side catalog and returns the verified data.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getCatalog } from "@/catalog/demo-data";

/**
 * POST /api/purchase/verify
 *
 * Verifies a product against the server-side catalog.
 * Returns the trusted price, availability, and verification metadata.
 *
 * Request:
 *   { productId: string, category: string, clientPrice?: number }
 *
 * Response:
 *   { success, productId, verifiedPrice, currency, available,
 *     availabilitySource, checkedAt, source, priceMismatch?, error? }
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

    const { productId, category, clientPrice } = body as Record<string, unknown>;

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
          error: `Product "${productId.trim()}" not found in "${category.trim()}\" catalog.`,
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

    // --- 5. Check if client price differs from trusted price ---
    const hasMismatch =
      typeof clientPrice === "number" && clientPrice !== product.price;

    // --- 6. Build verification response ---
    // Demo catalog products are always "available" — represented honestly.
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
