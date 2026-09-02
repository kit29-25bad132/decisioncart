// ============================================================
// DecisionCart — Category Resolver Tests
// Covers: registered resolution, dynamic validation, normalization,
// duplicate rejection, and integration with runDecision.
// ============================================================

import { describe, it, expect, afterEach } from "vitest";
import { runDecision } from "@/engine/decision-engine";
import { SMARTPHONE_CONFIG, LAPTOP_CONFIG } from "./categories";
import {
  resolveCategoryConfig,
  resolveCategoryConfigStrict,
  normalizeCategoryKey,
  validateDynamicCategoryConfig,
  registerDynamicCategory,
  unregisterDynamicCategory,
  clearDynamicCategories,
  getAllCategoryConfigs,
  categoryExists,
} from "./category-resolver";
import type { CategoryConfig, Product, UserPreference } from "@/types";

// --- Cleanup after each test ---
afterEach(() => {
  clearDynamicCategories();
});

// ============================================================
// 1. Registered smartphone category resolves correctly
// ============================================================
describe("resolveCategoryConfig — registered smartphone", () => {
  it("returns the smartphone config with source 'registered'", () => {
    const result = resolveCategoryConfig("smartphone");
    expect(result).toBeDefined();
    expect(result!.source).toBe("registered");
    expect(result!.config.category).toBe("smartphone");
    expect(result!.config.label).toBe("Smartphone");
    expect(result!.config.attributes.length).toBe(
      SMARTPHONE_CONFIG.attributes.length
    );
  });

  it("matches the original SMARTPHONE_CONFIG exactly", () => {
    const result = resolveCategoryConfig("smartphone");
    expect(result!.config).toBe(SMARTPHONE_CONFIG);
  });
});

// ============================================================
// 2. Registered laptop category resolves correctly
// ============================================================
describe("resolveCategoryConfig — registered laptop", () => {
  it("returns the laptop config with source 'registered'", () => {
    const result = resolveCategoryConfig("laptop");
    expect(result).toBeDefined();
    expect(result!.source).toBe("registered");
    expect(result!.config.category).toBe("laptop");
    expect(result!.config.label).toBe("Laptop");
    expect(result!.config.attributes.length).toBe(
      LAPTOP_CONFIG.attributes.length
    );
  });

  it("matches the original LAPTOP_CONFIG exactly", () => {
    const result = resolveCategoryConfig("laptop");
    expect(result!.config).toBe(LAPTOP_CONFIG);
  });
});

// ============================================================
// 3. Dynamic valid CategoryConfig is accepted
// ============================================================
describe("resolveCategoryConfig — dynamic categories", () => {
  const CAMERA_CONFIG: CategoryConfig = {
    category: "camera",
    label: "Camera",
    attributes: [
      {
        key: "megapixels",
        label: "Resolution",
        type: "numeric",
        comparisonDirection: "higher_is_better",
        description: "Camera sensor resolution in megapixels",
        defaultImportance: 3,
      },
      {
        key: "iso_range",
        label: "Low Light Performance",
        type: "numeric",
        comparisonDirection: "higher_is_better",
        description: "Maximum ISO sensitivity",
        defaultImportance: 2,
      },
      {
        key: "weight_grams",
        label: "Portability",
        type: "numeric",
        unit: "grams",
        comparisonDirection: "lower_is_better",
        description: "Body weight in grams",
        defaultImportance: 2,
      },
    ],
  };

  it("registers and resolves a valid dynamic category", () => {
    registerDynamicCategory(CAMERA_CONFIG);

    const result = resolveCategoryConfig("camera");
    expect(result).toBeDefined();
    expect(result!.source).toBe("dynamic");
    expect(result!.config.category).toBe("camera");
    expect(result!.config.label).toBe("Camera");
    expect(result!.config.attributes).toHaveLength(3);
  });

  it("registers with normalized key", () => {
    registerDynamicCategory({
      ...CAMERA_CONFIG,
      category: "Washing Machine",
    });

    const result = resolveCategoryConfig("washing_machine");
    expect(result).toBeDefined();
    expect(result!.source).toBe("dynamic");
    expect(result!.config.category).toBe("washing_machine");
  });

  it("registered dynamic config appears in getAllCategoryConfigs", () => {
    registerDynamicCategory(CAMERA_CONFIG);

    const all = getAllCategoryConfigs();
    const dynamicConfig = all.find((c) => c.category === "camera");
    expect(dynamicConfig).toBeDefined();
    expect(dynamicConfig!.label).toBe("Camera");
  });

  it("unregisterDynamicCategory removes the config", () => {
    registerDynamicCategory(CAMERA_CONFIG);
    expect(categoryExists("camera")).toBe(true);

    const removed = unregisterDynamicCategory("camera");
    expect(removed).toBe(true);
    expect(categoryExists("camera")).toBe(false);
    expect(resolveCategoryConfig("camera")).toBeUndefined();
  });
});

// ============================================================
// 4. Invalid attribute type is rejected
// ============================================================
describe("validateDynamicCategoryConfig — invalid type", () => {
  it("rejects an attribute with unsupported type 'string'", () => {
    const config: CategoryConfig = {
      category: "headphones",
      label: "Headphones",
      attributes: [
        {
          key: "driver_size",
          label: "Driver Size",
          // @ts-expect-error — testing invalid type
          type: "string",
          comparisonDirection: "higher_is_better",
          description: "Driver size in mm",
        },
      ],
    };

    const result = validateDynamicCategoryConfig(config);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      const typeError = result.errors.find((e) => e.field.includes("type"));
      expect(typeError).toBeDefined();
      expect(typeError!.message).toContain("Invalid type");
    }
  });

  it("rejects an attribute with unsupported type 'list'", () => {
    const config: CategoryConfig = {
      category: "shoes",
      label: "Shoes",
      attributes: [
        {
          key: "sizes",
          label: "Available Sizes",
          // @ts-expect-error — testing invalid type
          type: "list",
          comparisonDirection: "higher_is_better",
          description: "Available size options",
        },
      ],
    };

    const result = validateDynamicCategoryConfig(config);
    expect(result.valid).toBe(false);
  });

  it("accepts all valid types: numeric, binary, enum", () => {
    const config: CategoryConfig = {
      category: "television",
      label: "Television",
      attributes: [
        {
          key: "screen_size",
          label: "Screen Size",
          type: "numeric",
          comparisonDirection: "higher_is_better",
          description: "Display size",
        },
        {
          key: "smart_tv",
          label: "Smart TV",
          type: "binary",
          comparisonDirection: "higher_is_better",
          description: "Built-in smart features",
        },
        {
          key: "panel_type",
          label: "Panel Type",
          type: "enum",
          comparisonDirection: "higher_is_better",
          description: "Display panel technology",
        },
      ],
    };

    const result = validateDynamicCategoryConfig(config);
    expect(result.valid).toBe(true);
  });
});

// ============================================================
// 5. Invalid comparison direction is rejected
// ============================================================
describe("validateDynamicCategoryConfig — invalid comparison direction", () => {
  it("rejects 'maximize' as a comparison direction", () => {
    const config: CategoryConfig = {
      category: "shoes",
      label: "Shoes",
      attributes: [
        {
          key: "comfort_rating",
          label: "Comfort",
          type: "numeric",
          // @ts-expect-error — testing invalid direction
          comparisonDirection: "maximize",
          description: "Comfort rating out of 10",
        },
      ],
    };

    const result = validateDynamicCategoryConfig(config);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      const dirError = result.errors.find((e) =>
        e.field.includes("comparisonDirection")
      );
      expect(dirError).toBeDefined();
      expect(dirError!.message).toContain("Invalid comparison direction");
    }
  });

  it("accepts both valid directions: higher_is_better, lower_is_better", () => {
    const config: CategoryConfig = {
      category: "headphones",
      label: "Headphones",
      attributes: [
        {
          key: "sound_quality",
          label: "Sound Quality",
          type: "numeric",
          comparisonDirection: "higher_is_better",
          description: "Sound quality score",
        },
        {
          key: "weight_grams",
          label: "Weight",
          type: "numeric",
          comparisonDirection: "lower_is_better",
          description: "Weight in grams",
        },
      ],
    };

    const result = validateDynamicCategoryConfig(config);
    expect(result.valid).toBe(true);
  });
});

// ============================================================
// 6. Duplicate attribute keys are rejected
// ============================================================
describe("validateDynamicCategoryConfig — duplicate keys", () => {
  it("rejects config with duplicate attribute keys", () => {
    const config: CategoryConfig = {
      category: "camera",
      label: "Camera",
      attributes: [
        {
          key: "megapixels",
          label: "Resolution",
          type: "numeric",
          comparisonDirection: "higher_is_better",
          description: "Camera resolution",
        },
        {
          key: "Megapixels",
          label: "Another Resolution",
          type: "numeric",
          comparisonDirection: "higher_is_better",
          description: "Duplicate camera resolution",
        },
      ],
    };

    const result = validateDynamicCategoryConfig(config);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      const dupeError = result.errors.find((e) => e.message.includes("Duplicate"));
      expect(dupeError).toBeDefined();
    }
  });

  it("rejects config with exact duplicate keys (same case)", () => {
    const config: CategoryConfig = {
      category: "television",
      label: "Television",
      attributes: [
        {
          key: "price",
          label: "Price",
          type: "numeric",
          comparisonDirection: "lower_is_better",
          description: "Price in INR",
        },
        {
          key: "price",
          label: "Cost",
          type: "numeric",
          comparisonDirection: "lower_is_better",
          description: "Product cost",
        },
      ],
    };

    const result = validateDynamicCategoryConfig(config);
    expect(result.valid).toBe(false);
  });
});

// ============================================================
// 7. Category normalization works correctly
// ============================================================
describe("normalizeCategoryKey", () => {
  it("converts to lowercase", () => {
    expect(normalizeCategoryKey("SMARTPHONE")).toBe("smartphone");
  });

  it("replaces spaces with underscores", () => {
    expect(normalizeCategoryKey("Washing Machine")).toBe("washing_machine");
  });

  it("replaces hyphens with underscores", () => {
    expect(normalizeCategoryKey("smart-phone")).toBe("smart_phone");
  });

  it("handles multiple spaces", () => {
    expect(normalizeCategoryKey("Smart   Phone")).toBe("smart_phone");
  });

  it("trims whitespace", () => {
    expect(normalizeCategoryKey("  laptop  ")).toBe("laptop");
  });

  it("removes special characters", () => {
    expect(normalizeCategoryKey("TV 4K!")).toBe("tv_4k");
  });

  it("collapses multiple underscores", () => {
    expect(normalizeCategoryKey("a__b__c")).toBe("a_b_c");
  });

  it("removes leading/trailing underscores", () => {
    expect(normalizeCategoryKey("_phone_")).toBe("phone");
  });

  it("handles empty string", () => {
    expect(normalizeCategoryKey("")).toBe("");
  });

  it("handles already-normalized keys", () => {
    expect(normalizeCategoryKey("smartphone")).toBe("smartphone");
  });
});

// ============================================================
// 8. Existing registered category behavior remains unchanged
// ============================================================
describe("backward compatibility — existing categories", () => {
  it("resolveCategoryConfigStrict returns smartphone config", () => {
    const result = resolveCategoryConfigStrict("smartphone");
    expect(result.config).toBe(SMARTPHONE_CONFIG);
    expect(result.source).toBe("registered");
  });

  it("resolveCategoryConfigStrict returns laptop config", () => {
    const result = resolveCategoryConfigStrict("laptop");
    expect(result.config).toBe(LAPTOP_CONFIG);
    expect(result.source).toBe("registered");
  });

  it("throws for unknown category in strict mode", () => {
    expect(() => resolveCategoryConfigStrict("unknown_category")).toThrow(
      "No category config found for"
    );
  });

  it("returns undefined for unknown category in non-strict mode", () => {
    expect(resolveCategoryConfig("unknown_category")).toBeUndefined();
  });

  it("getAllCategoryConfigs includes registered categories", () => {
    const all = getAllCategoryConfigs();
    const keys = all.map((c) => c.category);
    expect(keys).toContain("smartphone");
    expect(keys).toContain("laptop");
  });

  it("categoryExists returns true for registered categories", () => {
    expect(categoryExists("smartphone")).toBe(true);
    expect(categoryExists("laptop")).toBe(true);
  });

  it("categoryExists returns false for unknown categories", () => {
    expect(categoryExists("unknown")).toBe(false);
  });
});

// ============================================================
// 9. Dynamic CategoryConfig can be used with runDecision()
// ============================================================
describe("integration — dynamic config with runDecision", () => {
  it("a dynamic camera config scores products correctly", () => {
    const cameraConfig: CategoryConfig = {
      category: "camera",
      label: "Camera",
      attributes: [
        {
          key: "megapixels",
          label: "Resolution",
          type: "numeric",
          comparisonDirection: "higher_is_better",
          description: "Camera sensor resolution",
          defaultImportance: 3,
        },
        {
          key: "weight_grams",
          label: "Portability",
          type: "numeric",
          unit: "grams",
          comparisonDirection: "lower_is_better",
          description: "Body weight",
          defaultImportance: 2,
        },
      ],
    };

    registerDynamicCategory(cameraConfig);
    const resolved = resolveCategoryConfigStrict("camera");

    const products: Product[] = [
      {
        id: "cam1",
        name: "Canon EOS",
        brand: "Canon",
        category: "camera",
        price: 65000,
        attributes: { megapixels: 24.2, weight_grams: 675 },
        confidence: { megapixels: "high", weight_grams: "high" },
      },
      {
        id: "cam2",
        name: "Nikon D3500",
        brand: "Nikon",
        category: "camera",
        price: 35000,
        attributes: { megapixels: 24.1, weight_grams: 365 },
        confidence: { megapixels: "high", weight_grams: "high" },
      },
    ];

    const preference: UserPreference = {
      category: "camera",
      priorities: [
        { attributeKey: "megapixels", importance: 3 },
        { attributeKey: "weight_grams", importance: 2 },
      ],
    };

    const result = runDecision(products, preference, resolved.config);

    expect(result.scoredProducts).toHaveLength(2);
    expect(result.categoryLabel).toBe("Camera");
    expect(result.scoredProducts[0].rank).toBe(1);

    // Both products should have scores
    for (const sp of result.scoredProducts) {
      expect(sp.totalScore).toBeGreaterThanOrEqual(0);
      expect(sp.totalScore).toBeLessThanOrEqual(100);
    }
  });

  it("a dynamic television config scores products correctly", () => {
    const tvConfig: CategoryConfig = {
      category: "television",
      label: "Television",
      attributes: [
        {
          key: "screen_size",
          label: "Screen Size",
          type: "numeric",
          unit: "inches",
          comparisonDirection: "higher_is_better",
          description: "Display diagonal size",
          defaultImportance: 3,
        },
        {
          key: "smart_tv",
          label: "Smart TV",
          type: "binary",
          comparisonDirection: "higher_is_better",
          description: "Built-in smart platform",
          defaultImportance: 2,
        },
      ],
    };

    registerDynamicCategory(tvConfig);
    const resolved = resolveCategoryConfigStrict("television");

    const products: Product[] = [
      {
        id: "tv1",
        name: "Samsung 55\" QLED",
        brand: "Samsung",
        category: "television",
        price: 55000,
        attributes: { screen_size: 55, smart_tv: true },
        confidence: { screen_size: "high", smart_tv: "high" },
      },
      {
        id: "tv2",
        name: "LG 43\" LED",
        brand: "LG",
        category: "television",
        price: 32000,
        attributes: { screen_size: 43, smart_tv: false },
        confidence: { screen_size: "high", smart_tv: "high" },
      },
    ];

    const preference: UserPreference = {
      category: "television",
      priorities: [
        { attributeKey: "screen_size", importance: 3 },
        { attributeKey: "smart_tv", importance: 2 },
      ],
    };

    const result = runDecision(products, preference, resolved.config);

    expect(result.scoredProducts).toHaveLength(2);
    expect(result.categoryLabel).toBe("Television");

    // Samsung should rank higher (larger screen + smart TV)
    expect(result.scoredProducts[0].product.id).toBe("tv1");
  });
});

// ============================================================
// Additional edge-case tests
// ============================================================
describe("validateDynamicCategoryConfig — edge cases", () => {
  it("rejects config with empty attributes array", () => {
    const config: CategoryConfig = {
      category: "shoes",
      label: "Shoes",
      attributes: [],
    };

    const result = validateDynamicCategoryConfig(config);
    expect(result.valid).toBe(false);
  });

  it("rejects config with missing category", () => {
    const config = {
      category: "",
      label: "Shoes",
      attributes: [
        {
          key: "size",
          label: "Size",
          type: "numeric" as const,
          comparisonDirection: "higher_is_better" as const,
          description: "Shoe size",
        },
      ],
    } as CategoryConfig;

    const result = validateDynamicCategoryConfig(config);
    expect(result.valid).toBe(false);
  });

  it("rejects config with missing label", () => {
    const config = {
      category: "shoes",
      label: "",
      attributes: [
        {
          key: "size",
          label: "Size",
          type: "numeric" as const,
          comparisonDirection: "higher_is_better" as const,
          description: "Shoe size",
        },
      ],
    } as CategoryConfig;

    const result = validateDynamicCategoryConfig(config);
    expect(result.valid).toBe(false);
  });

  it("rejects attribute with missing description", () => {
    const config: CategoryConfig = {
      category: "shoes",
      label: "Shoes",
      attributes: [
        {
          key: "size",
          label: "Size",
          type: "numeric",
          comparisonDirection: "higher_is_better",
          description: "",
        },
      ],
    };

    const result = validateDynamicCategoryConfig(config);
    expect(result.valid).toBe(false);
  });
});

describe("registerDynamicCategory — error handling", () => {
  it("throws when registering an invalid config", () => {
    const config: CategoryConfig = {
      category: "bad",
      label: "Bad",
      attributes: [],
    };

    expect(() => registerDynamicCategory(config)).toThrow(
      "Invalid dynamic category config"
    );
  });

  it("throws when category key normalizes to empty", () => {
    const config: CategoryConfig = {
      category: "!!!",
      label: "Bad",
      attributes: [
        {
          key: "x",
          label: "X",
          type: "numeric",
          comparisonDirection: "higher_is_better",
          description: "test",
        },
      ],
    };

    expect(() => registerDynamicCategory(config)).toThrow(
      "Category key cannot be empty"
    );
  });
});

describe("dynamic category resolution order", () => {
  it("registered categories take precedence over dynamic", () => {
    // Register a dynamic config with the same key as a registered one
    registerDynamicCategory({
      category: "smartphone",
      label: "Custom Smartphone",
      attributes: [
        {
          key: "custom_attr",
          label: "Custom",
          type: "numeric",
          comparisonDirection: "higher_is_better",
          description: "Custom attribute",
        },
      ],
    });

    const result = resolveCategoryConfig("smartphone");
    expect(result!.source).toBe("registered");
    expect(result!.config.label).toBe("Smartphone"); // Original label, not "Custom Smartphone"
  });
});
