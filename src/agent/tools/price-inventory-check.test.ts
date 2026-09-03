// ============================================================
// DecisionCart — Price & Inventory Check Tool Tests
// Tests for the bounded verify_purchase tool.
// ============================================================

import { describe, it, expect } from "vitest";
import { executePriceInventoryCheck } from "./price-inventory-check";

// --- Tests ---

describe("executePriceInventoryCheck", () => {
  // --- Valid product verification ---

  it("returns success for a valid product", async () => {
    const result = await executePriceInventoryCheck({
      productId: "phone-001",
      category: "smartphone",
    });

    expect(result.success).toBe(true);
    expect(result.productId).toBe("phone-001");
    expect(result.verifiedPrice).toBe(29999);
    expect(result.currency).toBe("INR");
    expect(result.available).toBe(true);
    expect(result.availabilitySource).toBe("demo-catalog");
    expect(result.source).toBe("DecisionCart demo catalog");
    expect(result.checkedAt).toBeDefined();
    expect(new Date(result.checkedAt).toISOString()).toBe(result.checkedAt);
  });

  it("returns verified price for a valid laptop", async () => {
    const result = await executePriceInventoryCheck({
      productId: "laptop-001",
      category: "laptop",
    });

    expect(result.success).toBe(true);
    expect(result.productId).toBe("laptop-001");
    expect(result.verifiedPrice).toBe(99900);
    expect(result.currency).toBe("INR");
  });

  // --- Invalid product ID ---

  it("returns failure for non-existent product ID", async () => {
    const result = await executePriceInventoryCheck({
      productId: "nonexistent-999",
      category: "smartphone",
    });

    expect(result.success).toBe(false);
    expect(result.productId).toBe("nonexistent-999");
    expect(result.error).toContain("not found");
    expect(result.verifiedPrice).toBeUndefined();
    expect(result.available).toBeUndefined();
  });

  it("returns failure for empty product ID", async () => {
    const result = await executePriceInventoryCheck({
      productId: "",
      category: "smartphone",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("required");
  });

  it("returns failure for whitespace-only product ID", async () => {
    const result = await executePriceInventoryCheck({
      productId: "   ",
      category: "smartphone",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("required");
  });

  // --- Category mismatch ---

  it("returns failure when product is not in the requested category", async () => {
    // phone-001 exists in smartphone, not laptop
    const result = await executePriceInventoryCheck({
      productId: "phone-001",
      category: "laptop",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns failure for empty category", async () => {
    const result = await executePriceInventoryCheck({
      productId: "phone-001",
      category: "",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("required");
  });

  it("returns failure for unsupported category", async () => {
    const result = await executePriceInventoryCheck({
      productId: "phone-001",
      category: "television",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  // --- Server-side price is returned ---

  it("returns the trusted server-side price, not a client-provided price", async () => {
    const result = await executePriceInventoryCheck({
      productId: "phone-001",
      category: "smartphone",
      clientPrice: 1, // Client tries to say price is ₹1
    });

    expect(result.success).toBe(true);
    expect(result.verifiedPrice).toBe(29999); // Trusted price, not client price
    expect(result.priceMismatch).toBeDefined();
    expect(result.priceMismatch!.clientPrice).toBe(1);
    expect(result.priceMismatch!.trustedPrice).toBe(29999);
    expect(result.priceMismatch!.difference).toBe(29998);
  });

  // --- Client price cannot override trusted price ---

  it("reports price mismatch when client price differs", async () => {
    const result = await executePriceInventoryCheck({
      productId: "phone-002",
      category: "smartphone",
      clientPrice: 30000,
    });

    expect(result.success).toBe(true);
    expect(result.verifiedPrice).toBe(37999);
    expect(result.priceMismatch).toBeDefined();
    expect(result.priceMismatch!.clientPrice).toBe(30000);
    expect(result.priceMismatch!.trustedPrice).toBe(37999);
    expect(result.priceMismatch!.difference).toBe(7999);
  });

  it("does not report mismatch when client price matches trusted price", async () => {
    const result = await executePriceInventoryCheck({
      productId: "phone-001",
      category: "smartphone",
      clientPrice: 29999,
    });

    expect(result.success).toBe(true);
    expect(result.verifiedPrice).toBe(29999);
    expect(result.priceMismatch).toBeUndefined();
  });

  it("does not report mismatch when no client price is provided", async () => {
    const result = await executePriceInventoryCheck({
      productId: "phone-001",
      category: "smartphone",
    });

    expect(result.success).toBe(true);
    expect(result.priceMismatch).toBeUndefined();
  });

  // --- Availability ---

  it("reports availability as true for demo catalog products", async () => {
    const result = await executePriceInventoryCheck({
      productId: "phone-003",
      category: "smartphone",
    });

    expect(result.success).toBe(true);
    expect(result.available).toBe(true);
    expect(result.availabilitySource).toBe("demo-catalog");
  });

  // --- No secrets exposed ---

  it("does not expose any server secrets in the result", async () => {
    const result = await executePriceInventoryCheck({
      productId: "phone-001",
      category: "smartphone",
    });

    const resultString = JSON.stringify(result);
    // Should not contain environment variable names or secrets
    expect(resultString).not.toContain("RAZORPAY");
    expect(resultString).not.toContain("API_KEY");
    expect(resultString).not.toContain("SECRET");
    expect(resultString).not.toContain("TOKEN");
    expect(resultString).not.toContain("PASSWORD");
  });

  it("error results also do not expose secrets", async () => {
    const result = await executePriceInventoryCheck({
      productId: "nonexistent",
      category: "smartphone",
    });

    const resultString = JSON.stringify(result);
    expect(resultString).not.toContain("RAZORPAY");
    expect(resultString).not.toContain("API_KEY");
    expect(resultString).not.toContain("SECRET");
  });

  // --- Timestamp ---

  it("always returns checkedAt as ISO string", async () => {
    const result = await executePriceInventoryCheck({
      productId: "phone-001",
      category: "smartphone",
    });

    expect(result.checkedAt).toBeDefined();
    expect(new Date(result.checkedAt).toISOString()).toBe(result.checkedAt);
  });

  // --- Trimming ---

  it("trims whitespace from productId and category", async () => {
    const result = await executePriceInventoryCheck({
      productId: "  phone-001  ",
      category: "  smartphone  ",
    });

    expect(result.success).toBe(true);
    expect(result.productId).toBe("phone-001");
    expect(result.verifiedPrice).toBe(29999);
  });
});
