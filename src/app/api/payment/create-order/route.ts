// ============================================================
// DecisionCart — Create Razorpay Order API Route
// Server-side only. Amount is always derived from the server
// catalog — never trusted from the client.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getCatalog } from "@/catalog/demo-data";

/**
 * POST /api/payment/create-order
 *
 * Creates a Razorpay order for a given product.
 * The price is always read from the server-side catalog.
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

    const { productId, category } = body as Record<string, unknown>;

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

    // --- 4. Convert INR price to paise ---
    // Razorpay expects amounts in the smallest currency unit (paise for INR).
    const amountInPaise = Math.round(product.price * 100);

    // --- 5. Initialize Razorpay server-side ---
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    // --- 6. Create the Razorpay order ---
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `rcpt_${product.id}_${Date.now()}`,
      notes: {
        productId: product.id,
        productName: product.name,
        category: product.category,
      },
    });

    // --- 7. Return safe response (no secrets exposed) ---
    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        productId: product.id,
        productName: product.name,
      },
      keyId,
    });
  } catch (error: unknown) {
    console.error("Failed to create Razorpay order:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create payment order. Please try again." },
      { status: 500 }
    );
  }
}
