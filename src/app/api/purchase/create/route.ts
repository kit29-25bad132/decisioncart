// ============================================================
// DecisionCart — Purchase Creation API Route
// Server-side only. Generates purchaseId and creates purchase
// record in DECIDED state. Client never supplies purchaseId.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getCatalog } from "@/catalog/demo-data";
import { getPurchaseRepository } from "@/engine/purchase-repository";

/**
 * POST /api/purchase/create
 *
 * Creates a new purchase record server-side.
 * The client provides only the productId and category.
 * The purchaseId is generated using crypto.randomUUID().
 *
 * Response:
 *   { success: true, purchaseId: "...", state: "DECIDED" }
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

    const { productId, category } = body as Record<string, unknown>;

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

    // --- 3. Look up the product from the server-side catalog ---
    const catalog = getCatalog(category.trim());
    const product = catalog.find((p) => p.id === productId.trim());

    if (!product) {
      return NextResponse.json(
        { success: false, error: "Product not found in the catalog." },
        { status: 404 }
      );
    }

    // --- 4. Generate cryptographically secure purchaseId ---
    const purchaseId = crypto.randomUUID();

    // --- 5. Create purchase via repository ---
    const repo = await getPurchaseRepository();
    const record = await repo.createPurchase(purchaseId, product.id);

    // --- 6. Log audit event ---
    await repo.createAuditEvent(
      record.purchaseId,
      "PURCHASE_CREATED",
      null,
      "DECIDED",
      { productId: product.id, category: product.category }
    );

    // --- 7. Return purchase info ---
    return NextResponse.json({
      success: true,
      purchaseId: record.purchaseId,
      state: record.state,
    });
  } catch (error: unknown) {
    console.error("Failed to create purchase:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create purchase. Please try again." },
      { status: 500 }
    );
  }
}
