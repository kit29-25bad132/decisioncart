// ============================================================
// DecisionCart — Product Normalizer Tests
// Comprehensive tests covering value extraction, alias mapping,
// confidence assignment, evidence preservation, and category
// agnostic behavior across smartphone and laptop categories.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  normalizeProduct,
  normalizeProducts,
  extractNumericValue,
  extractBinaryValue,
  extractEnumValue,
  resolveAttributeKey,
  findRawValue,
  generateDeterministicId,
  normalizePrice,
  ProductNormalizationError,
  DEFAULT_SMARTPHONE_ALIASES,
  DEFAULT_LAPTOP_ALIASES,
} from "./product-normalizer";
import type { RawProduct, AttributeAliasMap } from "./product-normalizer";
import { SMARTPHONE_CONFIG, LAPTOP_CONFIG } from "./categories";

// --- Helper: make a minimal valid raw product ---

function makeRawSmartphone(overrides: Partial<RawProduct> = {}): RawProduct {
  return {
    id: "test-phone-001",
    name: "Test Phone",
    brand: "TestBrand",
    category: "smartphone",
    price: 29999,
    specifications: {
      ram: "8 GB",
      storage: "256GB",
      battery: "5000 mAh",
      display: "6.7 inches",
      network: "5G",
    },
    ...overrides,
  };
}

function makeRawLaptop(overrides: Partial<RawProduct> = {}): RawProduct {
  return {
    id: "test-laptop-001",
    name: "Test Laptop",
    brand: "TestBrand",
    category: "laptop",
    price: 59999,
    specifications: {
      processor: "85",
      memory: "16 GB",
      battery: "12 hours",
      screen_size: "14 inches",
      weight: "1.4 kg",
      storage: "512 GB",
    },
    ...overrides,
  };
}

// ============================================================
// 1. Numeric Value Extraction
// ============================================================

describe("extractNumericValue", () => {
  it("handles numeric number input", () => {
    expect(extractNumericValue(8)).toBe(8);
    expect(extractNumericValue(0)).toBe(0);
    expect(extractNumericValue(-5)).toBe(-5);
    expect(extractNumericValue(3.14)).toBe(3.14);
  });

  it("handles numeric strings", () => {
    expect(extractNumericValue("8")).toBe(8);
    expect(extractNumericValue("256")).toBe(256);
    expect(extractNumericValue("6.7")).toBe(6.7);
  });

  it("handles numeric strings with units", () => {
    expect(extractNumericValue("8 GB")).toBe(8);
    expect(extractNumericValue("8GB")).toBe(8);
    expect(extractNumericValue("256 GB")).toBe(256);
    expect(extractNumericValue("5000 mAh")).toBe(5000);
    expect(extractNumericValue("6.7 inches")).toBe(6.7);
    expect(extractNumericValue("1.4 kg")).toBe(1.4);
    expect(extractNumericValue("12 hours")).toBe(12);
  });

  it("handles invalid numeric strings", () => {
    expect(extractNumericValue("unknown")).toBeNull();
    expect(extractNumericValue("N/A")).toBeNull();
    expect(extractNumericValue("")).toBeNull();
    expect(extractNumericValue("   ")).toBeNull();
    expect(extractNumericValue("abc")).toBeNull();
  });

  it("handles null values", () => {
    expect(extractNumericValue(null)).toBeNull();
    expect(extractNumericValue(undefined)).toBeNull();
  });

  it("handles Infinity and NaN", () => {
    expect(extractNumericValue(Infinity)).toBeNull();
    expect(extractNumericValue(-Infinity)).toBeNull();
    expect(extractNumericValue(NaN)).toBeNull();
  });
});

// ============================================================
// 2. Binary Value Extraction
// ============================================================

describe("extractBinaryValue", () => {
  it("handles boolean true/false", () => {
    expect(extractBinaryValue(true)).toBe(true);
    expect(extractBinaryValue(false)).toBe(false);
  });

  it("handles string true/false", () => {
    expect(extractBinaryValue("true")).toBe(true);
    expect(extractBinaryValue("false")).toBe(false);
  });

  it("handles yes/no", () => {
    expect(extractBinaryValue("yes")).toBe(true);
    expect(extractBinaryValue("no")).toBe(false);
    expect(extractBinaryValue("Yes")).toBe(true);
    expect(extractBinaryValue("No")).toBe(false);
  });

  it("handles supported/not supported", () => {
    expect(extractBinaryValue("supported")).toBe(true);
    expect(extractBinaryValue("not supported")).toBe(false);
    expect(extractBinaryValue("Supported")).toBe(true);
    expect(extractBinaryValue("Not Supported")).toBe(false);
  });

  it("handles 5G representation", () => {
    expect(extractBinaryValue("5G")).toBe(true);
    expect(extractBinaryValue("5g")).toBe(true);
  });

  it("handles numeric 1/0", () => {
    expect(extractBinaryValue(1)).toBe(true);
    expect(extractBinaryValue(0)).toBe(false);
  });

  it("handles null/undefined", () => {
    expect(extractBinaryValue(null)).toBeNull();
    expect(extractBinaryValue(undefined)).toBeNull();
  });

  it("handles ambiguous values", () => {
    expect(extractBinaryValue("maybe")).toBeNull();
    expect(extractBinaryValue("unknown")).toBeNull();
    expect(extractBinaryValue("")).toBeNull();
  });
});

// ============================================================
// 3. Enum Value Extraction
// ============================================================

describe("extractEnumValue", () => {
  it("preserves string values", () => {
    expect(extractEnumValue("Black")).toBe("Black");
    expect(extractEnumValue("Red")).toBe("Red");
    expect(extractEnumValue("USB-C")).toBe("USB-C");
  });

  it("trims whitespace", () => {
    expect(extractEnumValue("  Black  ")).toBe("Black");
  });

  it("handles null/undefined", () => {
    expect(extractEnumValue(null)).toBeNull();
    expect(extractEnumValue(undefined)).toBeNull();
  });

  it("returns null for empty strings", () => {
    expect(extractEnumValue("")).toBeNull();
    expect(extractEnumValue("   ")).toBeNull();
  });

  it("returns null for non-string types", () => {
    expect(extractEnumValue(42)).toBeNull();
    expect(extractEnumValue(true)).toBeNull();
  });
});

// ============================================================
// 4. Alias Resolution
// ============================================================

describe("resolveAttributeKey", () => {
  it("resolves exact canonical key", () => {
    const result = resolveAttributeKey("ram_gb", DEFAULT_SMARTPHONE_ALIASES);
    expect(result).toBe("ram_gb");
  });

  it("resolves alias to canonical key", () => {
    expect(resolveAttributeKey("ram", DEFAULT_SMARTPHONE_ALIASES)).toBe("ram_gb");
    expect(resolveAttributeKey("memory", DEFAULT_SMARTPHONE_ALIASES)).toBe("ram_gb");
    expect(resolveAttributeKey("system_memory", DEFAULT_SMARTPHONE_ALIASES)).toBe("ram_gb");
  });

  it("resolves storage aliases", () => {
    expect(resolveAttributeKey("storage", DEFAULT_SMARTPHONE_ALIASES)).toBe("storage_gb");
    expect(resolveAttributeKey("internal_storage", DEFAULT_SMARTPHONE_ALIASES)).toBe("storage_gb");
    expect(resolveAttributeKey("capacity", DEFAULT_SMARTPHONE_ALIASES)).toBe("storage_gb");
  });

  it("resolves 5G aliases", () => {
    expect(resolveAttributeKey("5g", DEFAULT_SMARTPHONE_ALIASES)).toBe("five_g");
    expect(resolveAttributeKey("five_g", DEFAULT_SMARTPHONE_ALIASES)).toBe("five_g");
    expect(resolveAttributeKey("network_5g", DEFAULT_SMARTPHONE_ALIASES)).toBe("five_g");
    expect(resolveAttributeKey("network", DEFAULT_SMARTPHONE_ALIASES)).toBe("five_g");
  });

  it("resolves laptop aliases", () => {
    expect(resolveAttributeKey("processor", DEFAULT_LAPTOP_ALIASES)).toBe("processor_score");
    expect(resolveAttributeKey("cpu", DEFAULT_LAPTOP_ALIASES)).toBe("processor_score");
    expect(resolveAttributeKey("weight", DEFAULT_LAPTOP_ALIASES)).toBe("weight_kg");
    expect(resolveAttributeKey("ssd", DEFAULT_LAPTOP_ALIASES)).toBe("ssd_gb");
  });

  it("is case-insensitive", () => {
    expect(resolveAttributeKey("RAM", DEFAULT_SMARTPHONE_ALIASES)).toBe("ram_gb");
    expect(resolveAttributeKey("Ram", DEFAULT_SMARTPHONE_ALIASES)).toBe("ram_gb");
    expect(resolveAttributeKey("BATTERY", DEFAULT_SMARTPHONE_ALIASES)).toBe("battery_mah");
  });

  it("returns null for unknown keys", () => {
    expect(resolveAttributeKey("unknown_field", DEFAULT_SMARTPHONE_ALIASES)).toBeNull();
    expect(resolveAttributeKey("", DEFAULT_SMARTPHONE_ALIASES)).toBeNull();
  });
});

describe("findRawValue", () => {
  it("finds value by alias", () => {
    const specs = { ram: "8 GB", storage: "256GB" };
    const [value, key] = findRawValue("ram_gb", specs, DEFAULT_SMARTPHONE_ALIASES);
    expect(value).toBe("8 GB");
    expect(key).toBe("ram");
  });

  it("finds value by canonical key", () => {
    const specs = { ram_gb: "8 GB" };
    const [value, key] = findRawValue("ram_gb", specs, DEFAULT_SMARTPHONE_ALIASES);
    expect(value).toBe("8 GB");
    expect(key).toBe("ram_gb");
  });

  it("returns null when not found", () => {
    const specs = { display: "6.7 inches" };
    const [value, key] = findRawValue("ram_gb", specs, DEFAULT_SMARTPHONE_ALIASES);
    expect(value).toBeNull();
    expect(key).toBeNull();
  });

  it("handles empty specifications", () => {
    const [value, key] = findRawValue("ram_gb", {}, DEFAULT_SMARTPHONE_ALIASES);
    expect(value).toBeNull();
    expect(key).toBeNull();
  });
});

// ============================================================
// 5. Deterministic Fallback ID
// ============================================================

describe("generateDeterministicId", () => {
  it("generates consistent IDs", () => {
    const id1 = generateDeterministicId("Phone", "Brand", "smartphone");
    const id2 = generateDeterministicId("Phone", "Brand", "smartphone");
    expect(id1).toBe(id2);
  });

  it("generates different IDs for different products", () => {
    const id1 = generateDeterministicId("Phone A", "Brand", "smartphone");
    const id2 = generateDeterministicId("Phone B", "Brand", "smartphone");
    expect(id1).not.toBe(id2);
  });

  it("does not use random values", () => {
    // Run 10 times — all should produce the same ID
    const ids = Array.from({ length: 10 }, () =>
      generateDeterministicId("Phone", "Brand", "smartphone"),
    );
    expect(new Set(ids).size).toBe(1);
  });

  it("starts with normalized- prefix", () => {
    const id = generateDeterministicId("Phone", "Brand", "smartphone");
    expect(id).toMatch(/^normalized-/);
  });
});

// ============================================================
// 6. Price Normalization
// ============================================================

describe("normalizePrice", () => {
  it("handles numeric price", () => {
    expect(normalizePrice(29999)).toBe(29999);
    expect(normalizePrice(0)).toBe(0);
  });

  it("handles string price", () => {
    expect(normalizePrice("29999")).toBe(29999);
    expect(normalizePrice("29,999")).toBe(29999);
    expect(normalizePrice("₹29,999")).toBe(29999);
  });

  it("handles null/undefined", () => {
    expect(normalizePrice(null)).toBeNull();
    expect(normalizePrice(undefined)).toBeNull();
  });

  it("rejects negative prices", () => {
    expect(normalizePrice(-100)).toBeNull();
  });

  it("rejects invalid strings", () => {
    expect(normalizePrice("unknown")).toBeNull();
    expect(normalizePrice("abc")).toBeNull();
    expect(normalizePrice("")).toBeNull();
  });
});

// ============================================================
// 7. Smartphone Category Normalization
// ============================================================

describe("normalizeProduct — smartphone category", () => {
  it("normalizes a complete smartphone product", () => {
    const raw = makeRawSmartphone();
    const result = normalizeProduct(raw, SMARTPHONE_CONFIG);

    expect(result.product).not.toBeNull();
    expect(result.error).toBeUndefined();

    const product = result.product!;
    expect(product.id).toBe("test-phone-001");
    expect(product.name).toBe("Test Phone");
    expect(product.brand).toBe("TestBrand");
    expect(product.category).toBe("smartphone");
    expect(product.price).toBe(29999);

    // Check normalized attributes
    expect(product.attributes.ram_gb).toBe(8);
    expect(product.attributes.storage_gb).toBe(256);
    expect(product.attributes.battery_mah).toBe(5000);
    expect(product.attributes.display_inches).toBe(6.7);
    expect(product.attributes.five_g).toBe(true);

    // camera_score is missing — should be null with unknown confidence
    expect(product.attributes.camera_score).toBeNull();
    expect(product.confidence.camera_score).toBe("unknown");

    // Other attributes should have high confidence
    expect(product.confidence.ram_gb).toBe("high");
    expect(product.confidence.storage_gb).toBe("high");
    expect(product.confidence.battery_mah).toBe("high");
    expect(product.confidence.display_inches).toBe("high");
    expect(product.confidence.five_g).toBe("high");

    // Stats
    expect(result.normalizedCount).toBe(5);
    expect(result.unknownCount).toBe(1);
  });

  it("preserves evidence for normalized attributes", () => {
    const raw = makeRawSmartphone();
    const result = normalizeProduct(raw, SMARTPHONE_CONFIG);

    expect(result.product!.evidence).toBeDefined();
    expect(result.product!.evidence!.ram_gb).toContain("8 GB");
    expect(result.product!.evidence!.storage_gb).toContain("256GB");
    expect(result.product!.evidence!.battery_mah).toContain("5000 mAh");
    expect(result.product!.evidence!.display_inches).toContain("6.7 inches");
  });

  it("does not create evidence for missing attributes", () => {
    const raw = makeRawSmartphone();
    const result = normalizeProduct(raw, SMARTPHONE_CONFIG);

    // camera_score is missing — should not have evidence
    expect(result.product!.evidence?.camera_score).toBeUndefined();
  });

  it("handles price as string", () => {
    const raw = makeRawSmartphone({ price: "29999" });
    const result = normalizeProduct(raw, SMARTPHONE_CONFIG);
    expect(result.product!.price).toBe(29999);
  });

  it("handles 5G representation variants", () => {
    const raw = makeRawSmartphone({ specifications: { network: "5G" } });
    const result = normalizeProduct(raw, SMARTPHONE_CONFIG);
    expect(result.product!.attributes.five_g).toBe(true);
  });

  it("handles binary yes/no for five_g", () => {
    const raw = makeRawSmartphone({ specifications: { network: "yes" } });
    const result = normalizeProduct(raw, SMARTPHONE_CONFIG);
    expect(result.product!.attributes.five_g).toBe(true);

    const rawNo = makeRawSmartphone({ specifications: { network: "no" } });
    const resultNo = normalizeProduct(rawNo, SMARTPHONE_CONFIG);
    expect(resultNo.product!.attributes.five_g).toBe(false);
  });

  it("handles all missing specifications", () => {
    const raw = makeRawSmartphone({ specifications: {} });
    const result = normalizeProduct(raw, SMARTPHONE_CONFIG);

    expect(result.product).not.toBeNull();
    expect(result.normalizedCount).toBe(0);
    expect(result.unknownCount).toBe(6); // All 6 smartphone attributes unknown

    // All attributes should be null with unknown confidence
    for (const attr of SMARTPHONE_CONFIG.attributes) {
      expect(result.product!.attributes[attr.key]).toBeNull();
      expect(result.product!.confidence[attr.key]).toBe("unknown");
    }
  });
});

// ============================================================
// 8. Laptop Category Normalization
// ============================================================

describe("normalizeProduct — laptop category", () => {
  it("normalizes a complete laptop product", () => {
    const raw = makeRawLaptop();
    const result = normalizeProduct(raw, LAPTOP_CONFIG);

    expect(result.product).not.toBeNull();
    expect(result.error).toBeUndefined();

    const product = result.product!;
    expect(product.id).toBe("test-laptop-001");
    expect(product.name).toBe("Test Laptop");
    expect(product.brand).toBe("TestBrand");
    expect(product.category).toBe("laptop");
    expect(product.price).toBe(59999);

    // Check normalized attributes
    expect(product.attributes.processor_score).toBe(85);
    expect(product.attributes.ram_gb).toBe(16);
    expect(product.attributes.battery_hours).toBe(12);
    expect(product.attributes.display_inches).toBe(14);
    expect(product.attributes.weight_kg).toBe(1.4);
    expect(product.attributes.ssd_gb).toBe(512);

    // All should have high confidence
    expect(product.confidence.processor_score).toBe("high");
    expect(product.confidence.ram_gb).toBe("high");
    expect(product.confidence.battery_hours).toBe("high");
    expect(product.confidence.display_inches).toBe("high");
    expect(product.confidence.weight_kg).toBe("high");
    expect(product.confidence.ssd_gb).toBe("high");

    expect(result.normalizedCount).toBe(6);
    expect(result.unknownCount).toBe(0);
  });

  it("uses the same normalizer for laptop category", () => {
    // Proves the generic normalizer works across categories
    const raw = makeRawLaptop();
    const result = normalizeProduct(raw, LAPTOP_CONFIG);

    expect(result.product).not.toBeNull();
    expect(result.product!.category).toBe("laptop");
    expect(result.product!.attributes.weight_kg).toBe(1.4);
  });

  it("handles missing laptop attributes", () => {
    const raw = makeRawLaptop({ specifications: {} });
    const result = normalizeProduct(raw, LAPTOP_CONFIG);

    expect(result.product).not.toBeNull();
    expect(result.normalizedCount).toBe(0);
    expect(result.unknownCount).toBe(6);
  });

  it("handles partial laptop attributes", () => {
    const raw = makeRawLaptop({
      specifications: {
        memory: "16 GB",
        weight: "1.4 kg",
      },
    });
    const result = normalizeProduct(raw, LAPTOP_CONFIG);

    expect(result.product!.attributes.ram_gb).toBe(16);
    expect(result.product!.attributes.weight_kg).toBe(1.4);
    expect(result.product!.attributes.processor_score).toBeNull();
    expect(result.product!.attributes.battery_hours).toBeNull();
    expect(result.product!.attributes.display_inches).toBeNull();
    expect(result.product!.attributes.ssd_gb).toBeNull();
  });
});

// ============================================================
// 9. Error Handling
// ============================================================

describe("normalizeProduct — error handling", () => {
  it("fails on missing name", () => {
    const raw = makeRawSmartphone({ name: undefined });
    const result = normalizeProduct(raw, SMARTPHONE_CONFIG);

    expect(result.product).toBeNull();
    expect(result.error).toBeInstanceOf(ProductNormalizationError);
    expect(result.error!.code).toBe("missing_name");
  });

  it("fails on empty name", () => {
    const raw = makeRawSmartphone({ name: "" });
    const result = normalizeProduct(raw, SMARTPHONE_CONFIG);

    expect(result.product).toBeNull();
    expect(result.error!.code).toBe("missing_name");
  });

  it("fails on invalid price", () => {
    const raw = makeRawSmartphone({ price: undefined });
    const result = normalizeProduct(raw, SMARTPHONE_CONFIG);

    expect(result.product).toBeNull();
    expect(result.error).toBeInstanceOf(ProductNormalizationError);
    expect(result.error!.code).toBe("invalid_price");
  });

  it("fails on negative price", () => {
    const raw = makeRawSmartphone({ price: -100 });
    const result = normalizeProduct(raw, SMARTPHONE_CONFIG);

    expect(result.product).toBeNull();
    expect(result.error!.code).toBe("invalid_price");
  });

  it("fails on category mismatch", () => {
    const raw = makeRawSmartphone({ category: "laptop" });
    const result = normalizeProduct(raw, SMARTPHONE_CONFIG);

    expect(result.product).toBeNull();
    expect(result.error).toBeInstanceOf(ProductNormalizationError);
    expect(result.error!.code).toBe("category_mismatch");
  });

  it("does not fail when category is missing from raw product", () => {
    const raw = makeRawSmartphone({ category: undefined });
    const result = normalizeProduct(raw, SMARTPHONE_CONFIG);

    // Should succeed — category comes from config
    expect(result.product).not.toBeNull();
    expect(result.product!.category).toBe("smartphone");
  });
});

// ============================================================
// 10. Deterministic Fallback ID in Normalization
// ============================================================

describe("normalizeProduct — fallback ID", () => {
  it("generates deterministic fallback ID when id is missing", () => {
    const raw = makeRawSmartphone({ id: undefined });
    const result = normalizeProduct(raw, SMARTPHONE_CONFIG);

    expect(result.product).not.toBeNull();
    expect(result.product!.id).toMatch(/^normalized-/);

    // Running again should produce the same ID
    const raw2 = makeRawSmartphone({ id: undefined });
    const result2 = normalizeProduct(raw2, SMARTPHONE_CONFIG);
    expect(result2.product!.id).toBe(result.product!.id);
  });

  it("uses provided id when available", () => {
    const raw = makeRawSmartphone({ id: "external-123" });
    const result = normalizeProduct(raw, SMARTPHONE_CONFIG);
    expect(result.product!.id).toBe("external-123");
  });
});

// ============================================================
// 11. Immutability
// ============================================================

describe("normalizeProduct — immutability", () => {
  it("does not mutate raw product input", () => {
    const raw = makeRawSmartphone();
    const rawCopy = JSON.parse(JSON.stringify(raw));

    normalizeProduct(raw, SMARTPHONE_CONFIG);

    expect(raw).toEqual(rawCopy);
  });

  it("does not mutate raw specifications", () => {
    const specs = { ram: "8 GB", storage: "256GB" };
    const specsCopy = JSON.parse(JSON.stringify(specs));

    const raw = makeRawSmartphone({ specifications: specs });
    normalizeProduct(raw, SMARTPHONE_CONFIG);

    expect(specs).toEqual(specsCopy);
  });

  it("does not mutate category config", () => {
    const configCopy = JSON.parse(JSON.stringify(SMARTPHONE_CONFIG));
    const raw = makeRawSmartphone();

    normalizeProduct(raw, SMARTPHONE_CONFIG);

    expect(SMARTPHONE_CONFIG).toEqual(configCopy);
  });
});

// ============================================================
// 12. Options
// ============================================================

describe("normalizeProduct — options", () => {
  it("respects custom alias overrides", () => {
    const customAliases: AttributeAliasMap = {
      ram_gb: ["my_custom_ram_key"],
    };

    const raw = makeRawSmartphone({
      specifications: { my_custom_ram_key: "12 GB" },
    });

    const result = normalizeProduct(raw, SMARTPHONE_CONFIG, {
      aliases: customAliases,
    });

    expect(result.product!.attributes.ram_gb).toBe(12);
  });

  it("applies confidence overrides", () => {
    const raw = makeRawSmartphone();
    const result = normalizeProduct(raw, SMARTPHONE_CONFIG, {
      confidenceOverrides: { ram_gb: "low" },
    });

    expect(result.product!.confidence.ram_gb).toBe("low");
    // Other attributes should remain high
    expect(result.product!.confidence.storage_gb).toBe("high");
  });

  it("uses custom evidence prefix", () => {
    const raw = makeRawSmartphone();
    const result = normalizeProduct(raw, SMARTPHONE_CONFIG, {
      evidencePrefix: "Provider data",
    });

    expect(result.product!.evidence!.ram_gb).toContain("Provider data");
  });

  it("uses custom source name in evidence", () => {
    const raw = makeRawSmartphone();
    const result = normalizeProduct(raw, SMARTPHONE_CONFIG, {
      sourceName: "MyProvider",
    });

    // Source name doesn't appear in default evidence, but prefix does
    expect(result.product!.evidence!.ram_gb).toContain("Source specification");
  });
});

// ============================================================
// 13. Generic Normalizer Works Across Categories
// ============================================================

describe("normalizeProduct — generic across categories", () => {
  it("normalizes smartphone with SMARTPHONE_CONFIG", () => {
    const raw = makeRawSmartphone();
    const result = normalizeProduct(raw, SMARTPHONE_CONFIG);
    expect(result.product!.attributes.ram_gb).toBe(8);
    expect(result.product!.attributes.camera_score).toBeNull();
  });

  it("normalizes laptop with LAPTOP_CONFIG", () => {
    const raw = makeRawLaptop();
    const result = normalizeProduct(raw, LAPTOP_CONFIG);
    expect(result.product!.attributes.ram_gb).toBe(16);
    expect(result.product!.attributes.weight_kg).toBe(1.4);
  });

  it("same attribute keys work across categories", () => {
    // ram_gb and display_inches exist in both categories
    const smartphoneRaw = makeRawSmartphone();
    const laptopRaw = makeRawLaptop();

    const smartphoneResult = normalizeProduct(smartphoneRaw, SMARTPHONE_CONFIG);
    const laptopResult = normalizeProduct(laptopRaw, LAPTOP_CONFIG);

    // Both should normalize ram_gb and display_inches
    expect(smartphoneResult.product!.attributes.ram_gb).toBe(8);
    expect(laptopResult.product!.attributes.ram_gb).toBe(16);
    expect(smartphoneResult.product!.attributes.display_inches).toBe(6.7);
    expect(laptopResult.product!.attributes.display_inches).toBe(14);
  });
});

// ============================================================
// 14. Batch Normalization
// ============================================================

describe("normalizeProducts", () => {
  it("normalizes multiple products", () => {
    const rawProducts = [
      makeRawSmartphone({ id: "phone-1", name: "Phone 1" }),
      makeRawSmartphone({ id: "phone-2", name: "Phone 2" }),
      makeRawSmartphone({ id: "phone-3", name: "Phone 3" }),
    ];

    const result = normalizeProducts(rawProducts, SMARTPHONE_CONFIG);

    expect(result.products).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
    expect(result.stats.total).toBe(3);
    expect(result.stats.succeeded).toBe(3);
    expect(result.stats.failed).toBe(0);
  });

  it("reports errors for invalid products", () => {
    const rawProducts = [
      makeRawSmartphone({ id: "phone-1", name: "Phone 1" }),
      makeRawSmartphone({ id: "phone-2", name: "" }), // Missing name
      makeRawSmartphone({ id: "phone-3", name: "Phone 3" }),
    ];

    const result = normalizeProducts(rawProducts, SMARTPHONE_CONFIG);

    expect(result.products).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].index).toBe(1);
    expect(result.errors[0].error.code).toBe("missing_name");
    expect(result.stats.total).toBe(3);
    expect(result.stats.succeeded).toBe(2);
    expect(result.stats.failed).toBe(1);
  });

  it("handles empty input", () => {
    const result = normalizeProducts([], SMARTPHONE_CONFIG);
    expect(result.products).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.stats.total).toBe(0);
  });
});

// ============================================================
// 15. Evidence Preservation
// ============================================================

describe("evidence preservation", () => {
  it("creates evidence with raw source values", () => {
    const raw = makeRawSmartphone();
    const result = normalizeProduct(raw, SMARTPHONE_CONFIG);

    // Evidence should contain the original raw value
    expect(result.product!.evidence!.ram_gb).toBe("Source specification: ram = 8 GB");
    expect(result.product!.evidence!.storage_gb).toBe("Source specification: storage = 256GB");
    expect(result.product!.evidence!.battery_mah).toBe("Source specification: battery = 5000 mAh");
  });

  it("uses config key when raw key is not available", () => {
    const raw = makeRawSmartphone({
      specifications: { ram_gb: "8 GB" }, // Uses canonical key directly
    });
    const result = normalizeProduct(raw, SMARTPHONE_CONFIG);

    expect(result.product!.evidence!.ram_gb).toBe("Source specification: ram_gb = 8 GB");
  });

  it("does not fabricate evidence for missing attributes", () => {
    const raw = makeRawSmartphone();
    const result = normalizeProduct(raw, SMARTPHONE_CONFIG);

    // camera_score is missing — no evidence
    expect(result.product!.evidence?.camera_score).toBeUndefined();
    expect(Object.keys(result.product!.evidence!)).not.toContain("camera_score");
  });
});

// ============================================================
// 16. Custom ProductNormalizationError
// ============================================================

describe("ProductNormalizationError", () => {
  it("has correct name and code", () => {
    const error = new ProductNormalizationError("test", "invalid_price");
    expect(error.name).toBe("ProductNormalizationError");
    expect(error.code).toBe("invalid_price");
    expect(error.message).toBe("test");
    expect(error instanceof Error).toBe(true);
  });

  it("supports all error codes", () => {
    const codes = [
      "invalid_product",
      "invalid_price",
      "missing_name",
      "category_mismatch",
    ] as const;

    for (const code of codes) {
      const error = new ProductNormalizationError(`Error: ${code}`, code);
      expect(error.code).toBe(code);
    }
  });
});
