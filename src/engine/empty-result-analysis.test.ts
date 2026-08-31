// ============================================================
// DecisionCart — Empty Result Analysis Tests
// Verifies constraint relaxation intelligence and closest matches.
// ============================================================

import { describe, it, expect } from "vitest";
import { runDecision } from "./decision-engine";
import { getCatalog } from "@/catalog/demo-data";
import { getCategoryConfig } from "@/catalog/categories";
import type { UserPreference, Product } from "@/types";

// ============================================================
// TEST 1: Normal matching products — no empty analysis
// ============================================================
describe("Empty result analysis: Normal matching products", () => {
  it("does not produce emptyResultAnalysis when products match", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig);
    expect(result.scoredProducts.length).toBeGreaterThan(0);
    expect(result.emptyResultAnalysis).toBeUndefined();
  });
});

// ============================================================
// TEST 2: Zero products due to budget
// ============================================================
describe("Empty result analysis: Zero products due to budget", () => {
  it("produces analysis when budget excludes all products", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 10000 }, // no products this cheap
      priorities: [],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig);

    expect(result.scoredProducts.length).toBe(0);
    expect(result.emptyResultAnalysis).toBeDefined();
    expect(result.emptyResultAnalysis!.hasResults).toBe(false);
    expect(result.emptyResultAnalysis!.failedRequirements.length).toBeGreaterThan(0);

    // Should have at least one budget-related failed requirement
    const budgetReq = result.emptyResultAnalysis!.failedRequirements.find(
      (r) => r.type === "budget"
    );
    expect(budgetReq).toBeDefined();
  });

  it("suggests budget increase based on real product prices", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 10000 },
      priorities: [],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig);
    const suggestions = result.emptyResultAnalysis!.suggestions;

    expect(suggestions.length).toBeGreaterThan(0);

    // The cheapest smartphone is ₹21,999 (Realme GT 6T)
    const budgetSuggestion = suggestions.find((s) => s.type === "budget");
    expect(budgetSuggestion).toBeDefined();
    expect(budgetSuggestion!.suggestedValue).toBe(21999);
    expect(budgetSuggestion!.matchingProductCount).toBeGreaterThan(0);
  });
});

// ============================================================
// TEST 3: Zero products due to RAM constraint
// ============================================================
describe("Empty result analysis: Zero products due to RAM constraint", () => {
  it("produces analysis when RAM requirement is too high", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 100, operator: ">=" },
      ],
    };

    const result = runDecision(catalog, preference, categoryConfig);

    expect(result.scoredProducts.length).toBe(0);
    expect(result.emptyResultAnalysis).toBeDefined();

    // RAM should be the most restrictive requirement
    const ramReq = result.emptyResultAnalysis!.failedRequirements.find(
      (r) => r.attributeKey === "ram_gb"
    );
    expect(ramReq).toBeDefined();
    expect(ramReq!.excludedProductCount).toBe(catalog.length);
  });

  it("suggests RAM relaxation to nearest real value", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    // All smartphones have 4, 8, or 12 GB RAM
    // Require >= 16 to get zero results
    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 16, operator: ">=" },
      ],
    };

    const result = runDecision(catalog, preference, categoryConfig);
    const suggestions = result.emptyResultAnalysis!.suggestions;

    // Should suggest RAM >= 12 (the highest value below 16)
    const ramSuggestion = suggestions.find(
      (s) => s.attributeKey === "ram_gb"
    );
    expect(ramSuggestion).toBeDefined();
    expect(ramSuggestion!.suggestedValue).toBe(12);
    expect(ramSuggestion!.matchingProductCount).toBeGreaterThan(0);
  });
});

// ============================================================
// TEST 4: Zero products due to storage constraint
// ============================================================
describe("Empty result analysis: Zero products due to storage constraint", () => {
  it("suggests storage relaxation to nearest real value", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    // Smartphones have 64, 128, or 256 GB storage
    // Require >= 512 to get zero results
    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "storage_gb", value: 512, operator: ">=" },
      ],
    };

    const result = runDecision(catalog, preference, categoryConfig);
    const suggestions = result.emptyResultAnalysis!.suggestions;

    // Should suggest storage >= 256 (the highest value below 512)
    const storageSuggestion = suggestions.find(
      (s) => s.attributeKey === "storage_gb"
    );
    expect(storageSuggestion).toBeDefined();
    expect(storageSuggestion!.suggestedValue).toBe(256);
    expect(storageSuggestion!.matchingProductCount).toBeGreaterThan(0);
  });
});

// ============================================================
// TEST 5: Multiple constraints producing zero products
// ============================================================
describe("Empty result analysis: Multiple constraints", () => {
  it("analyzes all constraints and provides suggestions for each", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    // Budget ₹30,000 allows some phones, but RAM >= 16 excludes all
    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 16, operator: ">=" },
      ],
    };

    const result = runDecision(catalog, preference, categoryConfig);

    expect(result.scoredProducts.length).toBe(0);
    expect(result.emptyResultAnalysis).toBeDefined();

    // Should have failed requirements
    const failed = result.emptyResultAnalysis!.failedRequirements;
    expect(failed.length).toBeGreaterThanOrEqual(1);

    // Should have suggestions
    const suggestions = result.emptyResultAnalysis!.suggestions;
    expect(suggestions.length).toBeGreaterThan(0);

    // RAM suggestion should exist and use real product value
    const ramSuggestion = suggestions.find((s) => s.attributeKey === "ram_gb");
    expect(ramSuggestion).toBeDefined();
    expect(ramSuggestion!.suggestedValue).toBe(12); // highest RAM below 16
    expect(ramSuggestion!.matchingProductCount).toBeGreaterThan(0);
  });
});

// ============================================================
// TEST 6: Minimal budget relaxation uses real product price
// ============================================================
describe("Empty result analysis: Budget relaxation", () => {
  it("suggests the nearest product price, not an arbitrary number", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    // Budget just below the cheapest phone
    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 21998 }, // just below Realme GT 6T at ₹21,999
      priorities: [],
      constraints: [],
    };

    const result = runDecision(catalog, preference, categoryConfig);
    const suggestions = result.emptyResultAnalysis!.suggestions;

    const budgetSuggestion = suggestions.find((s) => s.type === "budget");
    expect(budgetSuggestion).toBeDefined();
    expect(budgetSuggestion!.suggestedValue).toBe(21999); // exact product price
    expect(budgetSuggestion!.matchingProductCount).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// TEST 7: >= constraint relaxation chooses nearest lower real value
// ============================================================
describe("Empty result analysis: >= constraint relaxation", () => {
  it("finds the nearest lower value from actual products", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    // RAM values: 4, 8, 8, 8, 8, 12
    // Require >= 10 → only 12GB phone passes → require >= 13 → zero results
    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 13, operator: ">=" },
      ],
    };

    const result = runDecision(catalog, preference, categoryConfig);
    const suggestions = result.emptyResultAnalysis!.suggestions;

    const ramSuggestion = suggestions.find(
      (s) => s.attributeKey === "ram_gb"
    );
    expect(ramSuggestion).toBeDefined();
    // Should suggest 12 (nearest value below 13)
    expect(ramSuggestion!.suggestedValue).toBe(12);
  });
});

// ============================================================
// TEST 8: <= constraint relaxation chooses nearest higher real value
// ============================================================
describe("Empty result analysis: <= constraint relaxation", () => {
  it("finds the nearest higher value from actual products", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    // Display sizes: 4.7, 6.1, 6.7, 6.7, 6.74, 6.78
    // Require display <= 4.5 → zero results (all displays are larger)
    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "display_inches", value: 4.5, operator: "<=" },
      ],
    };

    const result = runDecision(catalog, preference, categoryConfig);
    const suggestions = result.emptyResultAnalysis!.suggestions;

    const displaySuggestion = suggestions.find(
      (s) => s.attributeKey === "display_inches"
    );
    expect(displaySuggestion).toBeDefined();
    // Should suggest 4.7 (nearest value above 4.5)
    expect(displaySuggestion!.suggestedValue).toBe(4.7);
  });
});

// ============================================================
// TEST 9: Closest match calculation
// ============================================================
describe("Empty result analysis: Closest matches", () => {
  it("identifies products closest to satisfying all requirements", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    // Budget under ₹25,000, RAM >= 12
    // OnePlus Nord 4 (₹26,999, 12GB) — fails budget, meets RAM
    // Samsung S24 FE (₹29,999, 8GB) — fails both
    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 25000 },
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 12, operator: ">=" },
      ],
    };

    const result = runDecision(catalog, preference, categoryConfig);
    const matches = result.emptyResultAnalysis!.closestMatches;

    expect(matches.length).toBeGreaterThan(0);

    // OnePlus Nord 4 should be the closest (meets RAM, fails only budget)
    const oneplus = matches.find((m) => m.product.id === "phone-003");
    expect(oneplus).toBeDefined();
    expect(oneplus!.metRequirements).toBe(1); // RAM met
    expect(oneplus!.unmetCount).toBe(1); // budget unmet
  });

  it("sorts by fewest unmet requirements first", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 25000 },
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 12, operator: ">=" },
      ],
    };

    const result = runDecision(catalog, preference, categoryConfig);
    const matches = result.emptyResultAnalysis!.closestMatches;

    if (matches.length > 1) {
      // First match should have fewer or equal unmet requirements
      expect(matches[0].unmetCount).toBeLessThanOrEqual(matches[1].unmetCount);
    }
  });
});

// ============================================================
// TEST 10: Missing attribute values do not crash
// ============================================================
describe("Empty result analysis: Missing attribute values", () => {
  it("handles products with null attributes gracefully", () => {
    const categoryConfig = getCategoryConfig("smartphone")!;

    const testCatalog: Product[] = [
      {
        id: "test-1",
        name: "Phone A",
        brand: "Test",
        category: "smartphone",
        price: 15000,
        attributes: { ram_gb: null, storage_gb: 128, five_g: true, camera_score: 70, battery_mah: 4000, display_inches: 6.0 },
        confidence: { ram_gb: "low", storage_gb: "high", five_g: "high", camera_score: "medium", battery_mah: "high", display_inches: "high" },
      },
      {
        id: "test-2",
        name: "Phone B",
        brand: "Test",
        category: "smartphone",
        price: 20000,
        attributes: { ram_gb: 8, storage_gb: 256, five_g: true, camera_score: 80, battery_mah: 5000, display_inches: 6.5 },
        confidence: { ram_gb: "high", storage_gb: "high", five_g: "high", camera_score: "high", battery_mah: "high", display_inches: "high" },
      },
    ];

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 10000 },
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 16, operator: ">=" },
      ],
    };

    // Should not crash
    const result = runDecision(testCatalog, preference, categoryConfig);
    expect(result.scoredProducts.length).toBe(0);
    expect(result.emptyResultAnalysis).toBeDefined();
    expect(result.emptyResultAnalysis!.closestMatches.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// TEST 11: Boolean constraints
// ============================================================
describe("Empty result analysis: Boolean constraints", () => {
  it("analyzes required_attribute failures", () => {
    const categoryConfig = getCategoryConfig("smartphone")!;

    const testCatalog: Product[] = [
      {
        id: "test-1",
        name: "5G Phone",
        brand: "Test",
        category: "smartphone",
        price: 25000,
        attributes: { five_g: true, ram_gb: 8, storage_gb: 128, camera_score: 70, battery_mah: 4000, display_inches: 6.0 },
        confidence: { five_g: "high", ram_gb: "high", storage_gb: "high", camera_score: "medium", battery_mah: "high", display_inches: "high" },
      },
      {
        id: "test-2",
        name: "4G Phone",
        brand: "Test",
        category: "smartphone",
        price: 15000,
        attributes: { five_g: false, ram_gb: 8, storage_gb: 128, camera_score: 70, battery_mah: 4000, display_inches: 6.0 },
        confidence: { five_g: "high", ram_gb: "high", storage_gb: "high", camera_score: "medium", battery_mah: "high", display_inches: "high" },
      },
    ];

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 10000 },
      priorities: [],
      constraints: [
        { type: "required_attribute", attributeKey: "five_g", value: true },
      ],
    };

    const result = runDecision(testCatalog, preference, categoryConfig);
    expect(result.scoredProducts.length).toBe(0);
    expect(result.emptyResultAnalysis).toBeDefined();

    // Should identify both budget and 5G as failed requirements
    const failed = result.emptyResultAnalysis!.failedRequirements;
    expect(failed.length).toBeGreaterThanOrEqual(2);

    const fiveGReq = failed.find((r) => r.attributeKey === "five_g");
    expect(fiveGReq).toBeDefined();
    expect(fiveGReq!.excludedProductCount).toBe(1); // only test-2 fails 5G
  });
});

// ============================================================
// TEST 12: Category-agnostic behavior
// ============================================================
describe("Empty result analysis: Category-agnostic", () => {
  it("works for laptop category", () => {
    const catalog = getCatalog("laptop");
    const categoryConfig = getCategoryConfig("laptop")!;

    // Require RAM >= 20 — no laptop has more than 16GB, relaxing to 16 works
    // (laptops with 16GB RAM exist and pass if no other blocking constraint)
    const preference: UserPreference = {
      category: "laptop",
      budget: { max: 60000 },
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 20, operator: ">=" },
      ],
    };

    const result = runDecision(catalog, preference, categoryConfig);

    expect(result.scoredProducts.length).toBe(0);
    expect(result.emptyResultAnalysis).toBeDefined();

    // Should have a RAM suggestion
    const suggestions = result.emptyResultAnalysis!.suggestions;
    const ramSuggestion = suggestions.find((s) => s.attributeKey === "ram_gb");

    expect(ramSuggestion).toBeDefined();
    // RAM suggestion should be 16 (highest available below 20)
    expect(ramSuggestion!.suggestedValue).toBe(16);
    expect(ramSuggestion!.matchingProductCount).toBeGreaterThan(0);
  });
});

// ============================================================
// TEST 13: Suggestions do not modify original preferences
// ============================================================
describe("Empty result analysis: Preferences immutability", () => {
  it("original preferences are not modified by analysis", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 10000 },
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 16, operator: ">=" },
      ],
    };

    const budgetMax = preference.budget?.max;
    const ramValue = preference.constraints?.[0]?.value;

    runDecision(catalog, preference, categoryConfig);

    // Original preference values should be unchanged
    expect(preference.budget?.max).toBe(budgetMax);
    expect(preference.constraints?.[0]?.value).toBe(ramValue);
  });
});

// ============================================================
// TEST 14: User-selected relaxation can produce valid products
// ============================================================
describe("Empty result analysis: Applying suggestion produces results", () => {
  it("relaxing RAM constraint to suggested value yields products", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    // First: zero results with RAM >= 16
    const pref1: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 16, operator: ">=" },
      ],
    };

    const result1 = runDecision(catalog, pref1, categoryConfig);
    expect(result1.scoredProducts.length).toBe(0);
    expect(result1.emptyResultAnalysis).toBeDefined();

    // Get the suggestion
    const ramSuggestion = result1.emptyResultAnalysis!.suggestions.find(
      (s) => s.attributeKey === "ram_gb"
    );
    expect(ramSuggestion).toBeDefined();
    expect(ramSuggestion!.suggestedValue).toBe(12);

    // Apply the suggestion manually
    const pref2: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: ramSuggestion!.suggestedValue!, operator: ">=" },
      ],
    };

    const result2 = runDecision(catalog, pref2, categoryConfig);
    expect(result2.scoredProducts.length).toBeGreaterThan(0);
    expect(result2.emptyResultAnalysis).toBeUndefined();
  });

  it("relaxing budget to suggested value yields products", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    // First: zero results with budget max ₹10,000
    const pref1: UserPreference = {
      category: "smartphone",
      budget: { max: 10000 },
      priorities: [],
      constraints: [],
    };

    const result1 = runDecision(catalog, pref1, categoryConfig);
    expect(result1.scoredProducts.length).toBe(0);

    const budgetSuggestion = result1.emptyResultAnalysis!.suggestions.find(
      (s) => s.type === "budget"
    );
    expect(budgetSuggestion).toBeDefined();

    // Apply the suggestion
    const pref2: UserPreference = {
      category: "smartphone",
      budget: { max: budgetSuggestion!.suggestedValue! },
      priorities: [],
      constraints: [],
    };

    const result2 = runDecision(catalog, pref2, categoryConfig);
    expect(result2.scoredProducts.length).toBeGreaterThan(0);
  });
});

// ============================================================
// TEST 15: Reason string is descriptive
// ============================================================
describe("Empty result analysis: Reason strings", () => {
  it("provides a descriptive reason for zero results", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 10000 },
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 16, operator: ">=" },
      ],
    };

    const result = runDecision(catalog, preference, categoryConfig);
    const analysis = result.emptyResultAnalysis!;

    expect(analysis.reason).toContain("available products");
    expect(analysis.reason).toContain("satisfy");
  });
});

// ============================================================
// TEST 16: Suggestions have positive matchingProductCount
// ============================================================
describe("Empty result analysis: Suggestion validity", () => {
  it("all suggestions have matchingProductCount > 0", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 15000 },
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 16, operator: ">=" },
        { type: "attribute_comparison", attributeKey: "storage_gb", value: 256, operator: ">=" },
      ],
    };

    const result = runDecision(catalog, preference, categoryConfig);
    const suggestions = result.emptyResultAnalysis!.suggestions;

    for (const suggestion of suggestions) {
      expect(suggestion.matchingProductCount).toBeGreaterThan(0);
      expect(suggestion.title).toBeTruthy();
      expect(suggestion.explanation).toBeTruthy();
    }
  });
});
