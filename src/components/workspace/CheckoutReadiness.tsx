"use client";

import { useState } from "react";
import type { ScoredProduct, DecisionConfidence } from "@/types";

/** Safe payment details stored after successful verification. */
interface VerifiedPaymentDetails {
  orderId: string;
  paymentId: string;
}

interface CheckoutReadinessProps {
  scoredProduct: ScoredProduct;
  confidence: DecisionConfidence;
  onProceedToCheckout: () => void;
}

interface CreateOrderResponse {
  success: boolean;
  error?: string;
  keyId?: string;
  order?: {
    id: string;
    amount: number;
    currency: string;
    productId: string;
    productName: string;
  };
}

interface VerifyPaymentResponse {
  success: boolean;
  error?: string;
  message?: string;
}

interface RazorpayPaymentResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayPaymentResponse) => void;
  modal?: {
    ondismiss?: () => void;
  };
  theme?: {
    color?: string;
  };
}

interface RazorpayInstance {
  open: () => void;
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

/**
 * Loads the Razorpay Checkout SDK dynamically.
 *
 * The Razorpay secret never reaches the browser.
 * Only the public Key ID returned by the server is used here.
 */
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";

    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);

    document.body.appendChild(script);
  });
}

export function CheckoutReadiness({
  scoredProduct,
  confidence,
  onProceedToCheckout,
}: CheckoutReadinessProps) {
  const [status, setStatus] = useState<
    "idle" | "creating" | "verifying" | "success" | "error"
  >("idle");

  const [errorMessage, setErrorMessage] = useState("");
  const [paymentDetails, setPaymentDetails] =
    useState<VerifiedPaymentDetails | null>(null);

  const { product } = scoredProduct;

  function handleReturnToDecision() {
    setStatus("idle");
    setPaymentDetails(null);
    setErrorMessage("");
  }

  async function handleProceed() {
    try {
      setStatus("creating");
      setErrorMessage("");

      onProceedToCheckout();

      // Load Razorpay Checkout SDK
      const razorpayLoaded = await loadRazorpayScript();

      if (!razorpayLoaded) {
        throw new Error(
          "Unable to load the payment service. Please check your internet connection."
        );
      }

      // Create order securely on our server
      const orderResponse = await fetch("/api/payment/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId: product.id,
          category: product.category,
        }),
      });

      const orderData: CreateOrderResponse = await orderResponse.json();

      if (
        !orderResponse.ok ||
        !orderData.success ||
        !orderData.order ||
        !orderData.keyId
      ) {
        throw new Error(
          orderData.error || "Unable to create the payment order."
        );
      }

      const options: RazorpayOptions = {
        key: orderData.keyId,
        amount: orderData.order.amount,
        currency: orderData.order.currency,
        name: "DecisionCart",
        description: `Purchase of ${product.name}`,
        order_id: orderData.order.id,

        handler: async (response: RazorpayPaymentResponse) => {
          try {
            setStatus("verifying");

            // Verify payment securely on our server
            const verifyResponse = await fetch("/api/payment/verify", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(response),
            });

            const verifyData: VerifyPaymentResponse =
              await verifyResponse.json();

            if (!verifyResponse.ok || !verifyData.success) {
              throw new Error(
                verifyData.error ||
                  verifyData.message ||
                  "Payment verification failed."
              );
            }

            // Save safe payment details before showing success
            setPaymentDetails({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
            });
            setStatus("success");
          } catch (error: unknown) {
            console.error("Payment verification failed:", error);

            setStatus("error");

            setErrorMessage(
              error instanceof Error
                ? error.message
                : "Payment verification failed."
            );
          }
        },

        modal: {
          ondismiss: () => {
            setStatus((currentStatus) =>
              currentStatus === "creating" ? "idle" : currentStatus
            );
          },
        },

        theme: {
          color: "#18181b",
        },
      };

      const razorpay = new window.Razorpay(options);

      setStatus("idle");

      razorpay.open();
    } catch (error: unknown) {
      console.error("Checkout failed:", error);

      setStatus("error");

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to start checkout. Please try again."
      );
    }
  }

  // Payment verified successfully — post-payment confirmation card
  if (status === "success" && paymentDetails) {
    return (
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-50 mb-4">
            <svg
              className="w-7 h-7 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-zinc-900">
            Purchase Confirmed
          </h3>
          <p className="text-sm text-zinc-500 mt-1 max-w-sm">
            Your payment has been securely verified and the DecisionCart
            purchase decision is complete.
          </p>
        </div>

        {/* Product Summary */}
        <div className="bg-zinc-50 rounded-xl p-4 mb-4">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
            Product Summary
          </p>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-900">
                {product.name}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {product.brand} · {product.category}
              </p>
            </div>
            <p className="text-sm font-semibold text-zinc-900">
              ₹{product.price.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Decision Summary */}
        <div className="bg-zinc-50 rounded-xl p-4 mb-4">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
            Decision Summary
          </p>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-zinc-500">
              Decision Confidence
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700">
              {confidence.score}%
            </span>
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed">
            This product was selected through your personalized priorities and
            transparent scoring.
          </p>
        </div>

        {/* Payment Status */}
        <div className="bg-zinc-50 rounded-xl p-4 mb-4">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
            Payment Status
          </p>
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span className="text-sm font-medium text-emerald-700">
              Verified
            </span>
          </div>
        </div>

        {/* Payment References */}
        <div className="bg-zinc-50 rounded-xl p-4 mb-5">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
            Payment References
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 w-16 shrink-0">
                Order ID
              </span>
              <code className="text-xs font-mono text-zinc-700 bg-white px-2 py-0.5 rounded border border-zinc-100 break-all">
                {paymentDetails.orderId}
              </code>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 w-16 shrink-0">
                Payment ID
              </span>
              <code className="text-xs font-mono text-zinc-700 bg-white px-2 py-0.5 rounded border border-zinc-100 break-all">
                {paymentDetails.paymentId}
              </code>
            </div>
          </div>
        </div>

        {/* Why This Decision Was Completed */}
        <div className="mb-5">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
            Why This Decision Was Completed
          </p>
          <ul className="space-y-2">
            <li className="flex items-start gap-2">
              <svg
                className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="text-xs text-zinc-600">
                Personalized to your priorities
              </span>
            </li>
            <li className="flex items-start gap-2">
              <svg
                className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="text-xs text-zinc-600">
                Ranked using transparent decision scoring
              </span>
            </li>
            <li className="flex items-start gap-2">
              <svg
                className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="text-xs text-zinc-600">
                Payment securely verified
              </span>
            </li>
          </ul>
        </div>

        {/* Return Button */}
        <button
          onClick={handleReturnToDecision}
          className="w-full px-6 py-3 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 transition-all shadow-sm"
        >
          Make Another Decision
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-900">
            Ready to purchase?
          </p>

          <p className="text-xs text-zinc-400 mt-0.5">
            {product.name} · ₹{product.price.toLocaleString()} ·{" "}
            {confidence.score}% confidence
          </p>

          {status === "error" && (
            <p className="text-xs text-red-500 mt-2">
              {errorMessage}
            </p>
          )}
        </div>

        <button
          onClick={handleProceed}
          disabled={status === "creating" || status === "verifying"}
          className="px-6 py-3 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center gap-2"
        >
          {status === "creating"
            ? "Preparing Checkout..."
            : status === "verifying"
              ? "Verifying Payment..."
              : "Proceed to Checkout"}

          {status !== "creating" && status !== "verifying" && (
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
