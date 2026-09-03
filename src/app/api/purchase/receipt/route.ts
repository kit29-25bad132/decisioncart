// ============================================================
// DecisionCart — Purchase Receipt API Route
// Server-side only. Generates trusted receipt data for
// successfully paid purchases.
//
// TRUST BOUNDARY: All receipt information is resolved from
// server-side purchase state and catalog data. The client
// may identify the purchase by purchaseId, but the server
// is the authoritative source for all receipt fields.
//
// Receipt is only available after successful payment (DONE state).
// Never available for DECIDED, CONFIRMING, APPROVED,
// ORDER_CREATED, FAILED, CANCELLED, or EXPIRED.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getCatalog } from "@/catalog/demo-data";
import { purchaseStore } from "@/engine/purchase-state-machine";

// --- Receipt Data Types ---

/** Trusted receipt data resolved entirely server-side. */
export interface ReceiptData {
  /** Server-generated purchase identifier. */
  purchaseId: string;
  /** Product ID from the catalog. */
  productId: string;
  /** Trusted product name from the catalog. */
  productName: string;
  /** Trusted brand from the catalog. */
  brand: string;
  /** Trusted category from the catalog. */
  category: string;
  /** Trusted amount in INR (from catalog, not client). */
  trustedAmount: number;
  /** Currency code. */
  currency: string;
  /** Razorpay order ID from verified purchase state. */
  razorpayOrderId: string;
  /** Razorpay payment ID from verified purchase state. */
  razorpayPaymentId: string;
  /** Payment status (verified). */
  paymentStatus: string;
  /** When the purchase was completed (ISO 8601). */
  purchasedAt: string;
  /** Data source label (honest about demo data). */
  dataSource: string;
}

/**
 * POST /api/purchase/receipt
 *
 * Generates trusted receipt data for a successfully paid purchase.
 *
 * Request:
 *   { purchaseId: string }
 *
 * Response (success):
 *   { success: true, receipt: ReceiptData }
 *
 * Response (error):
 *   { success: false, error: string }
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
    if (
      !purchaseId ||
      typeof purchaseId !== "string" ||
      purchaseId.trim().length === 0
    ) {
      return NextResponse.json(
        { success: false, error: "purchaseId is required." },
        { status: 400 }
      );
    }

    // --- 3. Find the purchase record ---
    const purchase = purchaseStore.get(purchaseId.trim());

    if (!purchase) {
      return NextResponse.json(
        { success: false, error: "Purchase record not found." },
        { status: 404 }
      );
    }

    // --- 4. Receipt only available for successfully paid purchases ---
    // After payment verification, the state transitions to DONE.
    // Receipt is not available for any other state.
    if (purchase.state !== "DONE") {
      return NextResponse.json(
        {
          success: false,
          error: `Receipt is only available for successfully paid purchases. Current state: ${purchase.state}.`,
        },
        { status: 403 }
      );
    }

    // --- 5. Verify Razorpay IDs exist ---
    if (!purchase.razorpayOrderId || !purchase.razorpayPaymentId) {
      return NextResponse.json(
        {
          success: false,
          error: "Payment information is incomplete. Please contact support.",
        },
        { status: 500 }
      );
    }

    // --- 6. Resolve the trusted product from the server-side catalog ---
    // We need to find the product across all categories to resolve
    // the authoritative product details (name, brand, category, price).
    const allCatalogs = ["smartphone", "laptop"];
    let trustedProduct = null;

    for (const catalogCategory of allCatalogs) {
      const catalog = getCatalog(catalogCategory);
      const found = catalog.find((p) => p.id === purchase.productId);
      if (found) {
        trustedProduct = found;
        break;
      }
    }

    if (!trustedProduct) {
      return NextResponse.json(
        {
          success: false,
          error: "Product not found in the catalog. Please contact support.",
        },
        { status: 404 }
      );
    }

    // --- 7. Build trusted receipt data ---
    const receipt: ReceiptData = {
      purchaseId: purchase.purchaseId,
      productId: trustedProduct.id,
      productName: trustedProduct.name,
      brand: trustedProduct.brand,
      category: trustedProduct.category,
      trustedAmount: trustedProduct.price,
      currency: "INR",
      razorpayOrderId: purchase.razorpayOrderId,
      razorpayPaymentId: purchase.razorpayPaymentId,
      paymentStatus: "Verified",
      purchasedAt: new Date(purchase.updatedAt).toISOString(),
      dataSource: "DecisionCart demo catalog",
    };

    // --- 8. Return receipt data (no secrets exposed) ---
    return NextResponse.json({
      success: true,
      receipt,
    });
  } catch (error: unknown) {
    console.error("Failed to generate receipt:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate receipt. Please try again." },
      { status: 500 }
    );
  }
}
