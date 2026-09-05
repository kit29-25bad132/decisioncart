// ============================================================
// DecisionCart - Razorpay Webhook Reconciliation
// Server-side only. The raw request body is authenticated before
// any payload field is used for purchase reconciliation.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getCatalog } from "@/catalog/demo-data";
import { getMerchantRepository } from "@/merchant/merchant-repository";
import {
  getPurchaseRepository,
  isInMemoryForced,
} from "@/engine/purchase-repository";
import type { PurchaseRecord } from "@/engine/purchase-state-machine";

const SUPPORTED_EVENT = "payment.captured";

interface CapturedPayment {
  id?: unknown;
  order_id?: unknown;
  amount?: unknown;
  status?: unknown;
}

interface WebhookPayload {
  event?: unknown;
  payload?: {
    payment?: {
      entity?: CapturedPayment;
    };
  };
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("Razorpay webhook secret is not configured.");
    return NextResponse.json(
      { success: false, error: "Payment webhook is not configured." },
      { status: 500 }
    );
  }

  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) {
    return NextResponse.json(
      { success: false, error: "Webhook signature is required." },
      { status: 400 }
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid webhook body." },
      { status: 400 }
    );
  }

  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");
  const receivedBuffer = Buffer.from(signature.trim(), "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return NextResponse.json(
      { success: false, error: "Invalid webhook signature." },
      { status: 400 }
    );
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid webhook body." },
      { status: 400 }
    );
  }

  if (payload.event !== SUPPORTED_EVENT) {
    return NextResponse.json({ success: true, acknowledged: true });
  }

  const payment = payload.payload?.payment?.entity;
  const paymentId = typeof payment?.id === "string" ? payment.id : null;
  const orderId = typeof payment?.order_id === "string" ? payment.order_id : null;
  const amount = typeof payment?.amount === "number" ? payment.amount : null;

  if (!paymentId || !orderId || amount === null || payment?.status !== "captured") {
    return NextResponse.json(
      { success: false, error: "Webhook payment data is incomplete." },
      { status: 400 }
    );
  }

  const repo = await getPurchaseRepository();
  const purchase = await repo.getPurchaseByRazorpayOrderId(orderId);

  if (!purchase) {
    return NextResponse.json(
      { success: false, error: "Purchase record not found for this order." },
      { status: 404 }
    );
  }

  if (purchase.state === "DONE") {
    if (purchase.razorpayPaymentId !== paymentId) {
      return NextResponse.json(
        { success: false, error: "Payment conflicts with the completed purchase." },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: true, acknowledged: true, reconciled: false });
  }

  if (purchase.state === "PAID" && purchase.razorpayPaymentId === paymentId) {
    const completed = await repo.completePurchase(purchase.purchaseId);
    await repo.createAuditEvent(
      completed.purchaseId,
      "PAYMENT_WEBHOOK_RECONCILED",
      "PAID",
      "DONE",
      { razorpayOrderId: orderId, razorpayPaymentId: paymentId }
    );
    return NextResponse.json({ success: true, acknowledged: true, reconciled: true });
  }

  if (purchase.state !== "ORDER_CREATED") {
    return NextResponse.json(
      { success: false, error: "Purchase is not awaiting payment reconciliation." },
      { status: 409 }
    );
  }

  const expectedAmount = await resolveExpectedAmountInPaise(purchase);
  if (expectedAmount === null || expectedAmount !== amount) {
    await repo.createAuditEvent(
      purchase.purchaseId,
      "PAYMENT_WEBHOOK_FAILED",
      "ORDER_CREATED",
      "ORDER_CREATED",
      {
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        reason: "amount_mismatch",
      }
    );
    return NextResponse.json(
      { success: false, error: "Webhook payment amount could not be verified." },
      { status: 400 }
    );
  }

  await repo.createAuditEvent(
    purchase.purchaseId,
    "PAYMENT_WEBHOOK_VERIFIED",
    "ORDER_CREATED",
    "ORDER_CREATED",
    { razorpayOrderId: orderId, razorpayPaymentId: paymentId }
  );

  try {
    if (
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !isInMemoryForced()
    ) {
      const { updatePaymentRecord } = await import(
        "@/engine/supabase-purchase-repository"
      );
      await updatePaymentRecord({
        purchaseId: purchase.purchaseId,
        razorpayPaymentId: paymentId,
        status: "verified",
      });
    }

    const finalized = await repo.finalizeVerifiedPayment(
      purchase.purchaseId,
      paymentId
    );
    await repo.createAuditEvent(
      finalized.purchaseId,
      "PAYMENT_WEBHOOK_RECONCILED",
      "ORDER_CREATED",
      "DONE",
      { razorpayOrderId: orderId, razorpayPaymentId: paymentId }
    );
    return NextResponse.json({ success: true, acknowledged: true, reconciled: true });
  } catch (error: unknown) {
    console.error("Failed to reconcile Razorpay webhook payment:", error);
    try {
      await repo.createAuditEvent(
        purchase.purchaseId,
        "PAYMENT_WEBHOOK_FAILED",
        "ORDER_CREATED",
        "ORDER_CREATED",
        {
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          reason: "persistence_failure",
        }
      );
    } catch (auditError: unknown) {
      console.error("Failed to record webhook persistence failure:", auditError);
    }
    return NextResponse.json(
      {
        success: false,
        error: "Payment was verified but reconciliation failed. Please retry.",
      },
      { status: 500 }
    );
  }
}

async function resolveExpectedAmountInPaise(
  purchase: PurchaseRecord
): Promise<number | null> {
  if (purchase.merchantOfferId) {
    const merchantRepo = await getMerchantRepository();
    const offer = await merchantRepo.getOffer(purchase.merchantOfferId);
    return offer && offer.price > 0 ? Math.round(offer.price * 100) : null;
  }

  for (const category of ["smartphone", "laptop"]) {
    const product = getCatalog(category).find((item) => item.id === purchase.productId);
    if (product) return Math.round(product.price * 100);
  }
  return null;
}
