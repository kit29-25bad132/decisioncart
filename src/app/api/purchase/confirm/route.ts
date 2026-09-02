// ============================================================
// DecisionCart — Purchase Confirmation API Route
// Server-side only. Transitions a purchase from DECIDED → CONFIRMING.
// The client may request the transition, but the server validates
// and performs it.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { purchaseStore } from "@/engine/purchase-state-machine";

/**
 * POST /api/purchase/confirm
 *
 * Transitions a purchase from DECIDED to CONFIRMING.
 * Validates the transition is legal before performing it.
 *
 * Request:
 *   { purchaseId: "..." }
 *
 * Response:
 *   { success: true, purchaseId: "...", state: "CONFIRMING" }
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

    // --- 4. Validate: DECIDED → CONFIRMING ---
    if (purchase.state !== "DECIDED") {
      return NextResponse.json(
        {
          success: false,
          error: `Purchase must be in DECIDED state to confirm. Current state: ${purchase.state}`,
        },
        { status: 409 }
      );
    }

    // --- 5. Perform the transition ---
    const updated = purchaseStore.updateState(purchaseId.trim(), "CONFIRMING");

    // --- 6. Return updated state ---
    return NextResponse.json({
      success: true,
      purchaseId: updated.purchaseId,
      state: updated.state,
    });
  } catch (error: unknown) {
    console.error("Failed to confirm purchase:", error);
    return NextResponse.json(
      { success: false, error: "Failed to confirm purchase. Please try again." },
      { status: 500 }
    );
  }
}
