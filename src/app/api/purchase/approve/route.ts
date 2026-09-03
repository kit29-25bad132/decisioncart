// ============================================================
// DecisionCart — Purchase Approval API Route
// Server-side only. Transitions CONFIRMING → APPROVED with
// server-generated approval timestamps and expiry.
// The browser must NOT generate approval expiry timestamps.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { purchaseStore } from "@/engine/purchase-state-machine";
import { getPurchaseRepository } from "@/engine/purchase-repository";

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
    const purchase = purchaseStore.get(purchaseId.trim());

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

    // --- 5. Perform the approval (server generates timestamps + expiry) ---
    const previousState = purchase.state;
    const approved = purchaseStore.approve(purchaseId.trim());

    // --- 6. Log audit event ---
    getPurchaseRepository().createAuditEvent(
      approved.purchaseId,
      "PURCHASE_APPROVED",
      previousState,
      "APPROVED",
      { expiresAt: approved.expiresAt }
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
