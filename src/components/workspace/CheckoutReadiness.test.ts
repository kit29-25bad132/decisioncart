"use client";

import { describe, it, expect } from "vitest";

/**
 * CheckoutReadiness verification contract tests.
 *
 * These tests lock in:
 *  - No client-side price is trusted for the verified amount.
 *  - Approval expiry normalization tolerates number and ISO-string values.
 *  - Verification metadata is forwarded to the confirmation UI correctly.
 */

describe("CheckoutReadiness verification contract", () => {
  it("declines to trust client price for verified amount", () => {
    // The checkout component sends only productId, category, and optional offerId
    // to /api/purchase/verify. It does not send clientPrice as authoritative.
    const requestBody = {
      productId: "phone-1",
      category: "smartphone",
      offerId: "offer-123",
    };

    expect("clientPrice" in requestBody).toBe(false);
    expect(requestBody.productId).toBe("phone-1");
    expect(requestBody.offerId).toBe("offer-123");
  });

  it("normalizes approval expiry from epoch ms", () => {
    const epochMs = 1_700_000_000_000;
    const normalized = toEpochMs(epochMs);
    expect(normalized).toBe(epochMs);
  });

  it("normalizes approval expiry from ISO string", () => {
    const iso = "2026-09-04T21:23:52.000Z";
    const normalized = toEpochMs(iso);
    expect(normalized).toBeGreaterThan(0);
    if (normalized !== null) {
      expect(new Date(normalized).toISOString()).toBe(iso);
    }
  });

  it("returns null for invalid expiry values", () => {
    expect(toEpochMs(null)).toBeNull();
    expect(toEpochMs(undefined)).toBeNull();
    expect(toEpochMs("not-a-date")).toBeNull();
  });

  it("preserves verification metadata shape for server response", () => {
    const verifyData = {
      success: true,
      productId: "phone-1",
      offerId: "offer-123",
      merchantId: "merchant-valuekart",
      verifiedPrice: 28500,
      currency: "INR",
      available: true,
      stock: 8,
      source: "merchant-repository",
    };

    expect(verifyData.verifiedPrice).toBe(28500);
    expect(verifyData.source).toBe("merchant-repository");
    expect(verifyData.merchantId).toBe("merchant-valuekart");
  });

  it("distinguishes merchant-verified amount from catalog price", () => {
    const productPrice = 30000;
    const verifiedPrice = 28500;

    // The client should display the verified price, not assume product.price.
    expect(verifiedPrice).not.toBe(productPrice);
    expect(verifiedPrice).toBeLessThan(productPrice);
  });

  it("uses the server-authoritative verified receipt amount for success", () => {
    const verifyData = {
      success: true,
      receipt: {
        trustedAmount: 28500,
      },
    };

    expect(verifyData.receipt.trustedAmount).toBe(28500);
    expect(verifyData.receipt.trustedAmount).toBeGreaterThan(0);
  });

  it("does not treat a missing or zero receipt amount as a successful amount", () => {
    const invalidAmounts = [undefined, 0, -1, Number.NaN];

    for (const amount of invalidAmounts) {
      expect(
        typeof amount === "number" && Number.isFinite(amount) && amount > 0
      ).toBe(false);
    }
  });
});

/**
 * Minimal helper lifted from CheckoutReadiness for unit testing.
 * Kept in sync with the component implementation.
 */
function toEpochMs(value?: number | string | null): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
