"use client";

import { useState } from "react";
import type { ScoredProduct, DecisionConfidence } from "@/types";

interface CheckoutReadinessProps {
  scoredProduct: ScoredProduct;
  confidence: DecisionConfidence;
  onProceedToCheckout: () => void;
}

/**
 * Checkout readiness boundary for Phase 5A.
 *
 * Displays the "Proceed to Checkout" action. When clicked,
 * transitions into a checkout-preparation state without
 * actually initiating any payment flow.
 *
 * Architecture boundary: This component is designed so that
 * Phase 5B/5C can attach Razorpay order creation without
 * redesigning this component.
 */
export function CheckoutReadiness({
  scoredProduct,
  confidence,
  onProceedToCheckout,
}: CheckoutReadinessProps) {
  const [checkoutInitiated, setCheckoutInitiated] = useState(false);

  const { product } = scoredProduct;

  function handleProceed() {
    setCheckoutInitiated(true);
    onProceedToCheckout();
  }

  if (checkoutInitiated) {
    return (
      <div className="bg-zinc-50 rounded-2xl border border-zinc-200 p-6 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-100 mb-4">
          <svg
            className="w-6 h-6 text-zinc-600"
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
          Checkout Ready
        </h3>
        <p className="text-sm text-zinc-500 mb-4">
          Your selection of <span className="font-medium text-zinc-700">{product.name}</span> is ready for checkout.
        </p>
        <div className="bg-white rounded-xl border border-zinc-200 p-4 mb-4 max-w-sm mx-auto">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Product</span>
            <span className="font-medium text-zinc-900">{product.name}</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-2">
            <span className="text-zinc-500">Price</span>
            <span className="font-medium text-zinc-900">
              ₹{product.price.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm mt-2">
            <span className="text-zinc-500">Confidence</span>
            <span className="font-medium text-zinc-900">{confidence.score}%</span>
          </div>
        </div>
        <p className="text-xs text-zinc-400">
          Payment integration will be available in a future phase.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-900">
            Ready to purchase?
          </p>
          <p className="text-xs text-zinc-400 mt-0.5">
            {product.name} · ₹{product.price.toLocaleString()} · {confidence.score}% confidence
          </p>
        </div>
        <button
          onClick={handleProceed}
          className="px-6 py-3 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 transition-all shadow-sm flex items-center gap-2"
        >
          Proceed to Checkout
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
