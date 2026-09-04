// ============================================================
// DecisionCart — Hard Constraint Engine Tests
// Verifies generic category-agnostic constraint filtering.
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runDecision } from "./decision-engine";
import { getCatalog } from "@/catalog/demo-data";
import { getCategoryConfig } from "@/catalog/categories";
import { parseShoppingQuery } from "@/lib/ai/parse";
import { _resetProviderForTesting } from "@/lib/ai/provider";
import { CATEGORY_CONFIGS } from "@/catalog/categories";
import type { UserPreference, Product } from "@/types";
import type { ParserContext } from "@/lib/ai/types";

const originalEnv = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  AI_API_KEY: process.env.AI_API_KEY,
  AI_MODEL: process.env.AI_MODEL,
};

beforeEach(() => {
  _resetProviderForTesting();
});

afterEach(() => {
  process.env.AI_PROVIDER = originalEnv.AI_PROVIDER;
  process.env.AI_API_KEY = originalEnv.AI_API_KEY;
  process.env.AI_MODEL = originalEnv.AI_MODEL;
  _resetProviderForTesting();
});

// ============================================================
// TEST 1: RAM >= 8 excludes products with 4GB RAM
// ============================================================
describe("Hard constraints: RAM >= 8", () => {
  it("excludes products with 4GB RAM", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 8, operator: ">=" },
      ],
    };

    const result = runDecision(catalog, preference, categoryConfig);

    // All scored products must have RAM >= 8
    for (const scored of result.scoredProducts) {
      const ram = scored.product.attributes.ram_gb;
      if (typeof ram === "number") {
        expect(ram).toBeGreaterThanOrEqual(8);
      }
    }

    // iPhone SE (2022) has 4GB RAM — must be excluded
    const iphoneSE = result.scoredProducts.find((sp) => sp.product.id === "phone-006");
    expect(iphoneSE).toBeUndefined();
  });
});

// ============================================================
// TEST 2: Storage >= 256 excludes products with 128GB storage
// ============================================================
describe("Hard constraints: Storage >= 256", () => {
  it("excludes products with 128GB storage", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "storage_gb", value: 256, operator: ">=" },
      ],
    };

    const result = runDecision(catalog, preference, categoryConfig);

    // All scored products must have storage >= 256
    for (const scored of result.scoredProducts) {
      const storage = scored.product.attributes.storage_gb;
      if (typeof storage === "number") {
        expect(storage).toBeGreaterThanOrEqual(256);
      }
    }

    // Samsung Galaxy S24 FE (128GB), Pixel 8a (128GB), iPhone SE (64GB) — all excluded
    const samsung = result.scoredProducts.find((sp) => sp.product.id === "phone-001");
    const pixel = result.scoredProducts.find((sp) => sp.product.id === "phone-002");
    const iphoneSE = result.scoredProducts.find((sp) => sp.product.id === "phone-006");
    expect(samsung).toBeUndefined();
    expect(pixel).toBeUndefined();
    expect(iphoneSE).toBeUndefined();
  });
});

// ============================================================
// TEST 3: 5G = true excludes products without 5G
// ============================================================
describe("Hard constraints: 5G required", () => {
  it("excludes products without 5G (required_attribute)", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [],
      constraints: [
        { type: "required_attribute", attributeKey: "five_g", value: true },
      ],
    };

    const result = runDecision(catalog, preference, categoryConfig);

    // All products in the demo catalog have 5G, so all should be included
    // (this tests that required_attribute works correctly for true values)
    expect(result.scoredProducts.length).toBe(catalog.length);
  });

  it("excludes products where five_g is false", () => {
    // Create a test catalog with some products lacking 5G
    const testCatalog: Product[] = [
      {
        id: "test-1",
        name: "5G Phone",
        brand: "Test",
        category: "smartphone",
        price: 25000,
        attributes: { five_g: true, ram_gb: 8, storage_gb: 128 },
        confidence: { five_g: "high", ram_gb: "high", storage_gb: "high" },
      },
      {
        id: "test-2",
        name: "4G Phone",
        brand: "Test",
        category: "smartphone",
        price: 15000,
        attributes: { five_g: false, ram_gb: 4, storage_gb: 64 },
        confidence: { five_g: "high", ram_gb: "high", storage_gb: "high" },
      },
      {
        id: "test-3",
        name: "Unknown 5G Phone",
        brand: "Test",
        category: "smartphone",
        price: 20000,
        attributes: { five_g: null, ram_gb: 6, storage_gb: 128 },
        confidence: { five_g: "low", ram_gb: "high", storage_gb: "high" },
      },
    ];

    const categoryConfig = getCategoryConfig("smartphone")!;
    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [],
      constraints: [
        { type: "required_attribute", attributeKey: "five_g", value: true },
      ],
    };

    const result = runDecision(testCatalog, preference, categoryConfig);

    // Only the 5G phone should be included
    expect(result.scoredProducts.length).toBe(1);
    expect(result.scoredProducts[0].product.id).toBe("test-1");
  });
});

// ============================================================
// TEST 4: Multiple constraints work together
// ============================================================
describe("Hard constraints: Multiple constraints combined", () => {
  it("Budget <= 30000 AND RAM >= 8 AND Storage >= 256", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 8, operator: ">=" },
        { type: "attribute_comparison", attributeKey: "storage_gb", value: 256, operator: ">=" },
      ],
    };

    const result = runDecision(catalog, preference, categoryConfig);

    // ALL conditions must be satisfied for each product
    for (const scored of result.scoredProducts) {
      expect(scored.product.price).toBeLessThanOrEqual(30000);
      const ram = scored.product.attributes.ram_gb;
      if (typeof ram === "number") {
        expect(ram).toBeGreaterThanOrEqual(8);
      }
      const storage = scored.product.attributes.storage_gb;
      if (typeof storage === "number") {
        expect(storage).toBeGreaterThanOrEqual(256);
      }
    }

    // Specific checks:
    // OnePlus Nord 4: ₹26,999, 12GB RAM, 256GB → included ✓
    const oneplus = result.scoredProducts.find((sp) => sp.product.id === "phone-003");
    expect(oneplus).toBeDefined();

    // Realme GT 6T: ₹21,999, 8GB RAM, 256GB → included ✓
    const realme = result.scoredProducts.find((sp) => sp.product.id === "phone-004");
    expect(realme).toBeDefined();

    // Nothing Phone (2a) Plus: ₹27,999, 8GB RAM, 256GB → included ✓
    const nothing = result.scoredProducts.find((sp) => sp.product.id === "phone-005");
    expect(nothing).toBeDefined();

    // Samsung S24 FE: ₹29,999, 8GB RAM, 128GB → excluded (storage < 256)
    const samsung = result.scoredProducts.find((sp) => sp.product.id === "phone-001");
    expect(samsung).toBeUndefined();

    // Pixel 8a: ₹37,999 → excluded (price > 30000)
    const pixel = result.scoredProducts.find((sp) => sp.product.id === "phone-002");
    expect(pixel).toBeUndefined();

    // iPhone SE: ₹49,900 → excluded (price > 30000)
    const iphoneSE = result.scoredProducts.find((sp) => sp.product.id === "phone-006");
    expect(iphoneSE).toBeUndefined();
  });
});

// ============================================================
// TEST 5: Priority changes never reintroduce excluded products
// ============================================================
describe("Hard constraints: Priority changes don't reintroduce excluded products", () => {
  it("changing priorities does not bring back RAM-excluded products", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    // First run: RAM >= 8 with camera priority
    const pref1: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [
        { attributeKey: "camera_score", importance: 3 },
        { attributeKey: "battery_mah", importance: 1 },
      ],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 8, operator: ">=" },
      ],
    };

    const result1 = runDecision(catalog, pref1, categoryConfig);

    // iPhone SE (4GB RAM) must not appear
    const iphoneInResult1 = result1.scoredProducts.find((sp) => sp.product.id === "phone-006");
    expect(iphoneInResult1).toBeUndefined();

    // Second run: change priorities heavily, keep same constraint
    const pref2: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [
        { attributeKey: "camera_score", importance: 1 }, // demote camera
        { attributeKey: "battery_mah", importance: 3 }, // promote battery
        { attributeKey: "display_inches", importance: 3 }, // promote display
      ],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 8, operator: ">=" },
      ],
    };

    const result2 = runDecision(catalog, pref2, categoryConfig);

    // iPhone SE (4GB RAM) STILL must not appear
    const iphoneInResult2 = result2.scoredProducts.find((sp) => sp.product.id === "phone-006");
    expect(iphoneInResult2).toBeUndefined();

    // All products in result2 must have RAM >= 8
    for (const scored of result2.scoredProducts) {
      const ram = scored.product.attributes.ram_gb;
      if (typeof ram === "number") {
        expect(ram).toBeGreaterThanOrEqual(8);
      }
    }
  });
});

// ============================================================
// TEST 6: Conversational refinement preserves hard constraints
// ============================================================
describe("Hard constraints: Conversational refinement preserves constraints", () => {
  it("Initial: 'Phone under ₹30,000 with at least 8GB RAM and minimum 256GB storage', Follow-up: 'Actually I care more about camera'", async () => {
    const allCategories = Object.values(CATEGORY_CONFIGS);

    // Step 1: Initial query with constraints
    const step1Context: ParserContext = {
      categories: allCategories,
      currentCategory: undefined,
      currentPreferences: undefined,
    };

    const step1Result = await parseShoppingQuery(
      "Phone under ₹30,000 with at least 8GB RAM and minimum 256GB storage",
      step1Context
    );
    expect(step1Result.success).toBe(true);
    expect(step1Result.intent?.budget?.max).toBe(30000);

    // Verify constraints were extracted
    const constraints = step1Result.intent?.constraints ?? [];
    const ramConstraint = constraints.find(
      (c) => c.attributeKey === "ram_gb" && c.type === "attribute_comparison"
    );
    const storageConstraint = constraints.find(
      (c) => c.attributeKey === "storage_gb" && c.type === "attribute_comparison"
    );
    expect(ramConstraint).toBeDefined();
    expect(ramConstraint?.operator).toBe(">=");
    expect(ramConstraint?.value).toBe(8);
    expect(storageConstraint).toBeDefined();
    expect(storageConstraint?.operator).toBe(">=");
    expect(storageConstraint?.value).toBe(256);

    // Step 2: Refinement — change priority, not constraints
    const step2Context: ParserContext = {
      categories: allCategories,
      currentCategory: "smartphone",
      currentPreferences: {
        category: "smartphone",
        budget: step1Result.intent?.budget,
        priorities: step1Result.intent?.priorities ?? [],
        constraints: step1Result.intent?.constraints ?? [],
      },
    };

    const step2Result = await parseShoppingQuery(
      "Actually I care more about camera",
      step2Context
    );
    expect(step2Result.success).toBe(true);

    // Budget should be preserved
    expect(step2Result.intent?.budget?.max).toBe(30000);

    // Constraints should be preserved
    const mergedConstraints = step2Result.intent?.constraints ?? [];
    const mergedRam = mergedConstraints.find(
      (c) => c.attributeKey === "ram_gb" && c.type === "attribute_comparison"
    );
    const mergedStorage = mergedConstraints.find(
      (c) => c.attributeKey === "storage_gb" && c.type === "attribute_comparison"
    );
    expect(mergedRam).toBeDefined();
    expect(mergedRam?.operator).toBe(">=");
    expect(mergedRam?.value).toBe(8);
    expect(mergedStorage).toBeDefined();
    expect(mergedStorage?.operator).toBe(">=");
    expect(mergedStorage?.value).toBe(256);
  });
});

// ============================================================
// TEST 7: Numeric strings with units are compared correctly
// ============================================================
describe("Hard constraints: Numeric string extraction", () => {
  it("extractNumericValue handles '8 GB' >= 8 correctly in decision engine", () => {
    const categoryConfig = getCategoryConfig("smartphone")!;

    // Create products where attribute values are strings with units
    const testCatalog: Product[] = [
      {
        id: "str-1",
        name: "Phone with string RAM",
        brand: "Test",
        category: "smartphone",
        price: 25000,
        attributes: {
          ram_gb: "8 GB" as unknown as number,
          storage_gb: 128,
        },
        confidence: { ram_gb: "high", storage_gb: "high" },
      },
      {
        id: "str-2",
        name: "Phone with low string RAM",
        brand: "Test",
        category: "smartphone",
        price: 20000,
        attributes: {
          ram_gb: "4GB" as unknown as number,
          storage_gb: 64,
        },
        confidence: { ram_gb: "high", storage_gb: "high" },
      },
      {
        id: "str-3",
        name: "Phone with high string RAM",
        brand: "Test",
        category: "smartphone",
        price: 30000,
        attributes: {
          ram_gb: "12 GB" as unknown as number,
          storage_gb: 256,
        },
        confidence: { ram_gb: "high", storage_gb: "high" },
      },
    ];

    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 8, operator: ">=" },
      ],
    };

    const result = runDecision(testCatalog, preference, categoryConfig);

    // str-2 (4GB) should be excluded, str-1 (8GB) and str-3 (12GB) should be included
    const str1 = result.scoredProducts.find((sp) => sp.product.id === "str-1");
    const str2 = result.scoredProducts.find((sp) => sp.product.id === "str-2");
    const str3 = result.scoredProducts.find((sp) => sp.product.id === "str-3");

    expect(str1).toBeDefined(); // 8 GB >= 8 ✓
    expect(str2).toBeUndefined(); // 4GB < 8 ✗
    expect(str3).toBeDefined(); // 12 GB >= 8 ✓
  });
});

// ============================================================
// TEST 8: Boolean representations work correctly
// ============================================================
describe("Hard constraints: Boolean representations", () => {
  it("handles true, 'Yes', and false correctly", () => {
    const categoryConfig = getCategoryConfig("smartphone")!;

    const testCatalog: Product[] = [
      {
        id: "bool-1",
        name: "5G Phone (boolean true)",
        brand: "Test",
        category: "smartphone",
        price: 25000,
        attributes: { five_g: true, ram_gb: 8 },
        confidence: { five_g: "high", ram_gb: "high" },
      },
      {
        id: "bool-2",
        name: "5G Phone (string Yes)",
        brand: "Test",
        category: "smartphone",
        price: 25000,
        attributes: { five_g: "Yes" as unknown as boolean, ram_gb: 8 },
        confidence: { five_g: "high", ram_gb: "high" },
      },
      {
        id: "bool-3",
        name: "4G Phone (boolean false)",
        brand: "Test",
        category: "smartphone",
        price: 20000,
        attributes: { five_g: false, ram_gb: 8 },
        confidence: { five_g: "high", ram_gb: "high" },
      },
    ];

    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [],
      constraints: [
        { type: "required_attribute", attributeKey: "five_g", value: true },
      ],
    };

    const result = runDecision(testCatalog, preference, categoryConfig);

    // bool-1 (true) and bool-2 ("Yes") should be included
    // bool-3 (false) should be excluded
    const bool1 = result.scoredProducts.find((sp) => sp.product.id === "bool-1");
    const bool2 = result.scoredProducts.find((sp) => sp.product.id === "bool-2");
    const bool3 = result.scoredProducts.find((sp) => sp.product.id === "bool-3");

    expect(bool1).toBeDefined();
    expect(bool2).toBeDefined();
    expect(bool3).toBeUndefined();
  });
});

// ============================================================
// TEST 9: No matching products produces safe empty result
// ============================================================
describe("Hard constraints: No matching products", () => {
  it("never recommends ineligible products when no products match", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    // Impossible constraint: RAM >= 100 (no product has this)
    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [
        { attributeKey: "camera_score", importance: 3 },
      ],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 100, operator: ">=" },
      ],
    };

    const result = runDecision(catalog, preference, categoryConfig);

    // Must return empty results — never recommend ineligible products
    expect(result.scoredProducts.length).toBe(0);
    expect(result.tradeOffs.length).toBe(0);
  });

  it("impossible budget + constraint returns empty", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 10000 }, // no products this cheap
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 16, operator: ">=" },
      ],
    };

    const result = runDecision(catalog, preference, categoryConfig);
    expect(result.scoredProducts.length).toBe(0);
  });
});

// ============================================================
// TEST 10: Missing attribute data — product passes constraint
// ============================================================
describe("Hard constraints: Missing attribute data", () => {
  it("products with missing attribute data are not excluded", () => {
    const categoryConfig = getCategoryConfig("smartphone")!;

    const testCatalog: Product[] = [
      {
        id: "missing-1",
        name: "Phone with unknown RAM",
        brand: "Test",
        category: "smartphone",
        price: 25000,
        attributes: { ram_gb: null, storage_gb: 128 },
        confidence: { ram_gb: "low", storage_gb: "high" },
      },
      {
        id: "missing-2",
        name: "Phone with known RAM",
        brand: "Test",
        category: "smartphone",
        price: 25000,
        attributes: { ram_gb: 8, storage_gb: 128 },
        confidence: { ram_gb: "high", storage_storage: "high" },
      },
    ];

    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 8, operator: ">=" },
      ],
    };

    const result = runDecision(testCatalog, preference, categoryConfig);

    // Both products should be included — missing data = eligible
    const missing1 = result.scoredProducts.find((sp) => sp.product.id === "missing-1");
    const missing2 = result.scoredProducts.find((sp) => sp.product.id === "missing-2");

    expect(missing1).toBeDefined(); // null RAM → passes (missing data = eligible)
    expect(missing2).toBeDefined(); // 8 RAM >= 8 → passes
  });
});

// ============================================================
// TEST 11: Laptop constraints work category-agnostically
// ============================================================
describe("Hard constraints: Laptop category", () => {
  it("laptop RAM >= 16 and SSD >= 512 filters correctly", () => {
    const catalog = getCatalog("laptop");
    const categoryConfig = getCategoryConfig("laptop")!;

    const preference: UserPreference = {
      category: "laptop",
      budget: {},
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 16, operator: ">=" },
        { type: "attribute_comparison", attributeKey: "ssd_gb", value: 512, operator: ">=" },
      ],
    };

    const result = runDecision(catalog, preference, categoryConfig);

    // All results must satisfy both constraints
    for (const scored of result.scoredProducts) {
      const ram = scored.product.attributes.ram_gb;
      if (typeof ram === "number") {
        expect(ram).toBeGreaterThanOrEqual(16);
      }
      const ssd = scored.product.attributes.ssd_gb;
      if (typeof ssd === "number") {
        expect(ssd).toBeGreaterThanOrEqual(512);
      }
    }

    // MacBook Air M3: 16GB RAM, 256GB SSD → excluded (SSD < 512)
    const macbook = result.scoredProducts.find((sp) => sp.product.id === "laptop-001");
    expect(macbook).toBeUndefined();

    // ASUS VivoBook 15: 8GB RAM → excluded (RAM < 16)
    const asus = result.scoredProducts.find((sp) => sp.product.id === "laptop-003");
    expect(asus).toBeUndefined();

    // Acer Aspire 5: 8GB RAM → excluded (RAM < 16)
    const acer = result.scoredProducts.find((sp) => sp.product.id === "laptop-005");
    expect(acer).toBeUndefined();

    // Lenovo IdeaPad Slim 5: 16GB RAM, 512GB SSD → included ✓
    const lenovo = result.scoredProducts.find((sp) => sp.product.id === "laptop-002");
    expect(lenovo).toBeDefined();

    // HP Pavilion 14: 16GB RAM, 512GB SSD → included ✓
    const hp = result.scoredProducts.find((sp) => sp.product.id === "laptop-004");
    expect(hp).toBeDefined();
  });
});

// ============================================================
// TEST 12: Fallback parser extracts constraints from natural language
// ============================================================
describe("Hard constraints: Fallback parser extraction", () => {
  it("extracts 'at least 8GB RAM' as ram_gb >= 8", async () => {
    const allCategories = Object.values(CATEGORY_CONFIGS);
    const context: ParserContext = {
      categories: allCategories,
      currentCategory: undefined,
      currentPreferences: undefined,
    };

    const result = await parseShoppingQuery(
      "Phone with at least 8GB RAM",
      context
    );

    expect(result.success).toBe(true);
    const constraints = result.intent?.constraints ?? [];
    const ramConstraint = constraints.find(
      (c) => c.attributeKey === "ram_gb" && c.type === "attribute_comparison"
    );
    expect(ramConstraint).toBeDefined();
    expect(ramConstraint?.operator).toBe(">=");
    expect(ramConstraint?.value).toBe(8);
  });

  it("extracts 'minimum 256GB storage' as storage_gb >= 256", async () => {
    const allCategories = Object.values(CATEGORY_CONFIGS);
    const context: ParserContext = {
      categories: allCategories,
      currentCategory: undefined,
      currentPreferences: undefined,
    };

    const result = await parseShoppingQuery(
      "Phone with minimum 256GB storage",
      context
    );

    expect(result.success).toBe(true);
    const constraints = result.intent?.constraints ?? [];
    const storageConstraint = constraints.find(
      (c) => c.attributeKey === "storage_gb" && c.type === "attribute_comparison"
    );
    expect(storageConstraint).toBeDefined();
    expect(storageConstraint?.operator).toBe(">=");
    expect(storageConstraint?.value).toBe(256);
  });

  it("extracts 'must have 5G' as five_g required_attribute", async () => {
    const allCategories = Object.values(CATEGORY_CONFIGS);
    const context: ParserContext = {
      categories: allCategories,
      currentCategory: undefined,
      currentPreferences: undefined,
    };

    const result = await parseShoppingQuery(
      "Phone must have 5G",
      context
    );

    expect(result.success).toBe(true);
    const constraints = result.intent?.constraints ?? [];
    const fiveGConstraint = constraints.find(
      (c) => c.attributeKey === "five_g" && c.type === "required_attribute"
    );
    expect(fiveGConstraint).toBeDefined();
    expect(fiveGConstraint?.value).toBe(true);
  });

  it("extracts multiple constraints from a single query", async () => {
    const allCategories = Object.values(CATEGORY_CONFIGS);
    const context: ParserContext = {
      categories: allCategories,
      currentCategory: undefined,
      currentPreferences: undefined,
    };

    const result = await parseShoppingQuery(
      "Phone under 30000 with at least 8GB RAM and minimum 256GB storage",
      context
    );

    expect(result.success).toBe(true);
    expect(result.intent?.budget?.max).toBe(30000);

    const constraints = result.intent?.constraints ?? [];
    const ramConstraint = constraints.find(
      (c) => c.attributeKey === "ram_gb" && c.type === "attribute_comparison"
    );
    const storageConstraint = constraints.find(
      (c) => c.attributeKey === "storage_gb" && c.type === "attribute_comparison"
    );

    expect(ramConstraint).toBeDefined();
    expect(ramConstraint?.operator).toBe(">=");
    expect(ramConstraint?.value).toBe(8);
    expect(storageConstraint).toBeDefined();
    expect(storageConstraint?.operator).toBe(">=");
    expect(storageConstraint?.value).toBe(256);
  });

  it("distinguishes 'I care about camera' (priority) from 'at least 8GB RAM' (constraint)", async () => {
    const allCategories = Object.values(CATEGORY_CONFIGS);
    const context: ParserContext = {
      categories: allCategories,
      currentCategory: undefined,
      currentPreferences: undefined,
    };

    const result = await parseShoppingQuery(
      "I care about camera and need at least 8GB RAM",
      context
    );

    expect(result.success).toBe(true);

    // camera should be a priority
    const cameraPriority = result.intent?.priorities.find(
      (p) => p.attributeKey === "camera_score"
    );
    expect(cameraPriority).toBeDefined();

    // RAM should be a constraint, not just a priority
    const ramConstraint = result.intent?.constraints.find(
      (c) => c.attributeKey === "ram_gb" && c.type === "attribute_comparison"
    );
    expect(ramConstraint).toBeDefined();
    expect(ramConstraint?.operator).toBe(">=");
    expect(ramConstraint?.value).toBe(8);
  });
});
