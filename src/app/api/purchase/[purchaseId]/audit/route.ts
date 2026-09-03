// ============================================================
// DecisionCart — Purchase Audit Trail API Route
// Server-side only. Returns the audit event history for a
// specific purchase. Events are safe operational metadata —
// no secrets, no credentials, no sensitive information.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getPurchaseRepository } from "@/engine/purchase-repository";

/**
 * GET /api/purchase/[purchaseId]/audit
 *
 * Returns the audit trail for a specific purchase.
 * Events are returned in chronological order.
 *
 * Response (success):
 *   { success: true, purchaseId, state, events: AuditEvent[] }
 *
 * Response (error):
 *   { success: false, error: string }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ purchaseId: string }> }
) {
  try {
    const { purchaseId } = await params;

    // --- 1. Validate purchaseId ---
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

    // --- 2. Find the purchase ---
    const repo = getPurchaseRepository();
    const purchase = repo.getPurchase(purchaseId.trim());

    if (!purchase) {
      return NextResponse.json(
        { success: false, error: "Purchase record not found." },
        { status: 404 }
      );
    }

    // --- 3. Get audit events ---
    const events = repo.listAuditEvents(purchaseId.trim());

    // --- 4. Return safe response ---
    return NextResponse.json({
      success: true,
      purchaseId: purchase.purchaseId,
      state: purchase.state,
      events,
    });
  } catch (error: unknown) {
    console.error("Failed to retrieve audit trail:", error);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve audit trail." },
      { status: 500 }
    );
  }
}
