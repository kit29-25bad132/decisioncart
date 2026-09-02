"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ScoredProduct, DecisionConfidence } from "@/types";
import type { PurchaseState } from "@/engine/purchase-state-machine";
import {
  approvalRemainingMs,
} from "@/engine/purchase-state-machine";

/** Safe payment details stored after successful verification. */
interface VerifiedPaymentDetails {
  orderId: string;
  paymentId: string;
}

/** Server purchase creation response */
interface PurchaseCreateResponse {
  success: boolean;
  purchaseId?: string;
  state?: PurchaseState;
  error?: string;
}

/** Server purchase confirmation response */
interface PurchaseConfirmResponse {
  success: boolean;
  purchaseId?: string;
  state?: PurchaseState;
  error?: string;
}

/** Server purchase approval response */
interface PurchaseApproveResponse {
  success: boolean;
  purchaseId?: string;
  state?: PurchaseState;
  expiresAt?: number;
  error?: string;
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
  purchaseId?: string;
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

type CheckoutStatus =
  | "idle"
  | "creating_purchase"
  | "confirming"
  | "approving"
  | "approved"
  | "creating"
  | "opening"
  | "verifying"
  | "success"
  | "error";

/**
 * Format remaining time as mm:ss display string.
 */
function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function CheckoutReadiness({
  scoredProduct,
  confidence,
  onProceedToCheckout,
}: CheckoutReadinessProps) {
  const [status, setStatus] = useState<CheckoutStatus>("idle");

  const [errorMessage, setErrorMessage] = useState("");
  const [paymentDetails, setPaymentDetails] =
    useState<VerifiedPaymentDetails | null>(null);

  // --- Approval Expiry Timer ---
  const [approvalTimeRemaining, setApprovalTimeRemaining] = useState<number | null>(null);
  const approvalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Purchase state from server ---
  const purchaseIdRef = useRef<string | null>(null);
  const approvalExpiresAtRef = useRef<number | null>(null);

  const { product } = scoredProduct;

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (approvalTimerRef.current) {
        clearInterval(approvalTimerRef.current);
      }
    };
  }, []);

  // Check expiry and auto-expire
  useEffect(() => {
    if (status !== "approved" || approvalExpiresAtRef.current === null) return;

    const checkExpiry = () => {
      const now = Date.now();
      if (now >= approvalExpiresAtRef.current!) {
        setStatus("error");
        setErrorMessage("Approval has expired. Please approve again.");
        setApprovalTimeRemaining(null);
        if (approvalTimerRef.current) {
          clearInterval(approvalTimerRef.current);
          approvalTimerRef.current = null;
        }
        return true;
      }
      setApprovalTimeRemaining(approvalExpiresAtRef.current! - now);
      return false;
    };

    if (checkExpiry()) return;

    approvalTimerRef.current = setInterval(() => {
      checkExpiry();
    }, 1000);

    return () => {
      if (approvalTimerRef.current) {
        clearInterval(approvalTimerRef.current);
        approvalTimerRef.current = null;
      }
    };
  }, [status]);

  function handleReturnToDecision() {
    setStatus("idle");
    setPaymentDetails(null);
    setErrorMessage("");
    setApprovalTimeRemaining(null);
    purchaseIdRef.current = null;
    approvalExpiresAtRef.current = null;
  }

  /**
   * Step 1: User clicks "Proceed to Purchase"
   * Server creates purchase (DECIDED), then confirms (CONFIRMING),
   * then the UI shows the confirmation dialog.
   */
  const handleProceedToConfirm = useCallback(async () => {
    try {
      setStatus("creating_purchase");
      setErrorMessage("");

      // Server creates purchase in DECIDED state
      const createRes = await fetch("/api/purchase/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          category: product.category,
        }),
      });

      const createData: PurchaseCreateResponse = await createRes.json();

      if (!createRes.ok || !createData.success || !createData.purchaseId) {
        throw new Error(createData.error || "Failed to create purchase.");
      }

      // Store server-generated purchaseId
      purchaseIdRef.current = createData.purchaseId;

      // Server transitions DECIDED → CONFIRMING
      const confirmRes = await fetch("/api/purchase/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseId: createData.purchaseId,
        }),
      });

      const confirmData: PurchaseConfirmResponse = await confirmRes.json();

      if (!confirmRes.ok || !confirmData.success) {
        throw new Error(confirmData.error || "Failed to confirm purchase.");
      }

      // Server confirmed → show confirmation UI
      setStatus("confirming");
      onProceedToCheckout();
    } catch (error: unknown) {
      console.error("Purchase creation failed:", error);
      setStatus("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to start purchase. Please try again."
      );
    }
  }, [product, onProceedToCheckout]);

  /**
   * Step 2: User clicks "Confirm Purchase"
   * Server approves (CONFIRMING → APPROVED), then we create order.
   */
  const handleConfirmPurchase = useCallback(async () => {
    try {
      setStatus("approving");
      setErrorMessage("");

      if (!purchaseIdRef.current) {
        throw new Error("No purchase ID available. Please start over.");
      }

      // Server transitions CONFIRMING → APPROVED with expiry
      const approveRes = await fetch("/api/purchase/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseId: purchaseIdRef.current,
        }),
      });

      const approveData: PurchaseApproveResponse = await approveRes.json();

      if (!approveRes.ok || !approveData.success || !approveData.expiresAt) {
        throw new Error(approveData.error || "Failed to approve purchase.");
      }

      // Server response is the source of truth for approval state
      approvalExpiresAtRef.current = approveData.expiresAt;
      setApprovalTimeRemaining(approveData.expiresAt - Date.now());
      setStatus("approved");

      // Load Razorpay SDK
      const razorpayLoaded = await loadRazorpayScript();

      if (!razorpayLoaded) {
        throw new Error(
          "Unable to load the payment service. Please check your internet connection."
        );
      }

      // Create Razorpay order (server validates purchase state + expiry)
      const orderResponse = await fetch("/api/payment/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          category: product.category,
          purchaseId: purchaseIdRef.current,
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
              headers: { "Content-Type": "application/json" },
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
              currentStatus === "opening" || currentStatus === "creating"
                ? "approved"
                : currentStatus
            );
          },
        },

        theme: {
          color: "#18181b",
        },
      };

      setStatus("creating");
      const razorpay = new window.Razorpay(options);
      setStatus("opening");
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
  }, [product]);

  function handleCancelConfirmation() {
    setStatus("idle");
    setErrorMessage("");
    setApprovalTimeRemaining(null);
    approvalExpiresAtRef.current = null;
  }

  // --- UI States ---

  // Payment verified successfully — post-payment confirmation card
  if (status === "success" && paymentDetails) {
    return (
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-50 mb-4 border border-emerald-100">
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
          <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-2">
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
          <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-2">
            Decision Summary
          </p>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-zinc-500">
              Decision Confidence
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700 border border-zinc-200">
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
          <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-2">
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
          <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-2">
            Payment References
          </p>
          <div className="space-y-2">
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
          <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-2">
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
          className="w-full px-6 py-3 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 active:bg-zinc-950 transition-all shadow-sm"
        >
          Make Another Decision
        </button>
      </div>
    );
  }

  // --- CONFIRMING: Show confirmation dialog ---
  if (status === "confirming") {
    return (
      <div className="bg-white rounded-2xl border-2 border-zinc-900 p-6 shadow-lg">
        {/* Confirmation Header */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 mb-3 border border-amber-100">
            <svg
              className="w-6 h-6 text-amber-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-zinc-900">
            Confirm Purchase
          </h3>
          <p className="text-sm text-zinc-500 mt-1">
            Please review your purchase details below.
          </p>
        </div>

        {/* Product Details */}
        <div className="bg-zinc-50 rounded-xl p-4 mb-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-900">
                {product.name}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {product.brand} · {product.category}
              </p>
            </div>
            <p className="text-lg font-bold text-zinc-900">
              ₹{product.price.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Decision Info */}
        <div className="bg-zinc-50 rounded-xl p-4 mb-5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-500">
              Decision Confidence
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700 border border-zinc-200">
              {confidence.score}%
            </span>
          </div>
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-5">
            <p className="text-xs text-red-600">{errorMessage}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleCancelConfirmation}
            className="flex-1 px-4 py-3 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 active:bg-zinc-100 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmPurchase}
            className="flex-1 px-4 py-3 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 active:bg-zinc-950 transition-all shadow-sm"
          >
            Confirm Purchase
          </button>
        </div>
      </div>
    );
  }

  // --- CREATING PURCHASE / APPROVING: Loading states ---
  if (status === "creating_purchase") {
    return (
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 mb-3 border border-blue-100">
            <svg
              className="animate-spin h-6 w-6 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-zinc-900">
            Creating purchase...
          </h3>
          <p className="text-xs text-zinc-500 mt-1">
            Setting up your purchase record on the server.
          </p>
        </div>
      </div>
    );
  }

  // --- APPROVED: Waiting for order creation / payment ---
  if (status === "approved" || status === "creating" || status === "opening") {
    return (
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 mb-3 border border-emerald-100">
            <svg
              className="animate-spin h-6 w-6 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-zinc-900">
            {status === "approved"
              ? "Creating secure payment order..."
              : status === "creating"
                ? "Creating secure payment order..."
                : "Opening checkout..."}
          </h3>
          <p className="text-xs text-zinc-500 mt-1">
            Please wait while we set up your secure checkout.
          </p>
          {approvalTimeRemaining !== null && approvalTimeRemaining > 0 && (
            <p className="text-[11px] text-zinc-400 mt-2">
              Approval expires in {formatRemaining(approvalTimeRemaining)}
            </p>
          )}
        </div>
      </div>
    );
  }

  // --- VERIFYING: Payment verification in progress ---
  if (status === "verifying") {
    return (
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 mb-3 border border-blue-100">
            <svg
              className="animate-spin h-6 w-6 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-zinc-900">
            Verifying payment...
          </h3>
          <p className="text-xs text-zinc-500 mt-1">
            Confirming your payment with Razorpay.
          </p>
        </div>
      </div>
    );
  }

  // --- ERROR state ---
  if (status === "error") {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-6 shadow-sm">
        <div className="flex flex-col items-center text-center mb-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-50 mb-3 border border-red-100">
            <svg
              className="w-6 h-6 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-zinc-900">
            {errorMessage || "Something went wrong"}
          </h3>
        </div>
        <button
          onClick={handleReturnToDecision}
          className="w-full px-6 py-3 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 active:bg-zinc-950 transition-all shadow-sm"
        >
          Try Again
        </button>
      </div>
    );
  }

  // --- IDLE: Default pre-purchase state with "Proceed to Purchase" ---
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
      {/* Pre-purchase decision summary */}
      <div className="mb-4 pb-4 border-b border-zinc-100">
        <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-2">
          Your Decision
        </p>
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-zinc-900 truncate">
              {product.name}
            </p>
            <p className="text-xs text-zinc-500">
              {product.brand} · ₹{product.price.toLocaleString()}
            </p>
          </div>
          <span className="text-xs font-mono font-semibold text-zinc-900 bg-zinc-50 px-2.5 py-1 rounded-full border border-zinc-100 shrink-0">
            {confidence.score}% confidence
          </span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-900">
            Ready to purchase?
          </p>
          <p className="text-xs text-zinc-400 mt-0.5">
            You&apos;ll confirm before any payment is created
          </p>
        </div>

        <button
          onClick={handleProceedToConfirm}
          className="px-6 py-3 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 active:bg-zinc-950 transition-all shadow-sm flex items-center justify-center gap-2 whitespace-nowrap"
        >
          Proceed to Purchase
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
        </button>
      </div>
    </div>
  );
}
