"use client";

import { useState } from "react";
import type { ScoredProduct, DecisionConfidence } from "@/types";

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

  const { product } = scoredProduct;

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

  // Payment verified successfully
  if (status === "success") {
    return (
      <div className="bg-zinc-50 rounded-2xl border border-zinc-200 p-6 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-100 mb-4">
          <svg
            className="w-6 h-6 text-zinc-700"
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

        <h3 className="text-base font-semibold text-zinc-900 mb-1">
          Payment Verified Successfully
        </h3>

        <p className="text-sm text-zinc-500">
          Your payment for{" "}
          <span className="font-medium text-zinc-700">
            {product.name}
          </span>{" "}
          has been securely verified.
        </p>
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