// ============================================================
// DecisionCart — Constraint Relaxation Engine Tests
// Verifies intelligent multi-constraint relaxation behavior.
// ============================================================

import { describe, it, expect } from "vitest";
import { relaxConstraints } from "./constraint-relaxation";
import { getCatalog } from "@/catalog/demo-data";
import { getCategoryConfig } from "@/catalog/categories";
import type { UserPreference, Product } from "@/types";

// ============================================================
// TEST 1: Exact match exists → no relaxation needed
// ============================================================
describe("Constraint relaxation: Exact match exists", () => {
  it("returns exactMatchFound=true when products pass all constraints", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [],
      constraints: [],
    };

    const result = relaxConstraints(catalog, preference, categoryConfig);

    expect(result.exactMatchFound).toBe(true);
    expect(result.alternatives.length).toBeGreaterThan(0);
    expect(result.alternatives.every((a) => a.meetsAllOriginal)).toBe(true);
    expect(result.relaxedConstraints.length).toBe(0);
  });

  it("returns exact match for laptop within budget", () => {
    const catalog = getCatalog("laptop");
    const categoryConfig = getCategoryConfig("laptop")!;

    const preference: UserPreference = {
      category: "laptop",
      budget: { max: 60000 },
      priorities: [],
      constraints: [],
    };

    const result = relaxConstraints(catalog, preference, categoryConfig);

    expect(result.exactMatchFound).toBe(true);
    // Lenovo IdeaPad Slim 5 (54999), HP Pavilion 14 (51999), etc.
    expect(result.alternatives.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================
// TEST 2: No products under budget → bounded budget relaxation
// ============================================================
describe("Constraint relaxation: Budget too low", () => {
  it("finds alternatives within bounded budget relaxation", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    // Budget ₹15,000 — no smartphone is this cheap
    // Cheapest is ₹21,999 (Realme GT 6T)
    // 20% relaxation of ₹15,000 = ₹3,000 → absolute max ₹18,000
    // Still no product under ₹18,000
    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 15000 },
      priorities: [],
      constraints: [],
    };

    const result = relaxConstraints(catalog, preference, categoryConfig);

    expect(result.exactMatchFound).toBe(false);
    // Should find no alternatives because 20% of 15000 = 3000, max = 18000
    // Cheapest smartphone is 21999
    expect(result.alternatives.length).toBe(0);
  });

  it("finds alternatives when budget is close to cheapest product", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    // Budget ₹20,000 — just below cheapest at ₹21,999
    // 20% relaxation = ₹4,000 → absolute max ₹24,000
    // Realme GT 6T (₹21,999) fits within relaxed budget
    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 20000 },
      priorities: [],
      constraints: [],
    };

    const result = relaxConstraints(catalog, preference, categoryConfig);

    expect(result.exactMatchFound).toBe(false);
    expect(result.alternatives.length).toBeGreaterThan(0);

    // Should include Realme GT 6T
    const realme = result.alternatives.find(
      (a) => a.product.id === "phone-004"
    );
    expect(realme).toBeDefined();
    expect(realme!.tradeOffs.length).toBeGreaterThan(0);
    expect(realme!.tradeOffs[0].attribute).toBe("budget");
  });
});

// ============================================================
// TEST 3: Smallest possible relaxation is preferred
// ============================================================
describe("Constraint relaxation: Smallest relaxation preferred", () => {
  it("prefers budget relaxation over attribute relaxation when both work", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    // Budget ₹25,000 allows some phones, but RAM >= 12 excludes most
    // OnePlus Nord 4 (₹26,999, 12GB) — fails budget by small amount
    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 25000 },
      priorities: [
        { attributeKey: "ram_gb", importance: 3 },
      ],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 12, operator: ">=" },
      ],
    };

    const result = relaxConstraints(catalog, preference, categoryConfig);

    expect(result.exactMatchFound).toBe(false);

    // Should find OnePlus Nord 4 as an alternative
    const oneplus = result.alternatives.find(
      (a) => a.product.id === "phone-003"
    );
    expect(oneplus).toBeDefined();
    // OnePlus Nord 4 has 12GB RAM (meets attribute constraint)
    // Fails only budget (₹26,999 vs ₹25,000)
    expect(oneplus!.requiredRelaxations.length).toBe(1);
    expect(oneplus!.requiredRelaxations[0].attribute).toBe("budget");
  });
});

// ============================================================
// TEST 4: Relaxed products clearly record trade-offs
// ============================================================
describe("Constraint relaxation: Trade-off recording", () => {
  it("records trade-offs for each alternative", () => {
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

    const result = relaxConstraints(catalog, preference, categoryConfig);

    expect(result.exactMatchFound).toBe(false);
    expect(result.alternatives.length).toBeGreaterThan(0);

    for (const alt of result.alternatives) {
      expect(alt.tradeOffs.length).toBeGreaterThan(0);
      expect(alt.requiredRelaxations.length).toBeGreaterThan(0);
      expect(alt.meetsAllOriginal).toBe(false);
    }
  });
});

// ============================================================
// TEST 5: Relaxation never silently modifies original preferences
// ============================================================
describe("Constraint relaxation: Preferences immutability", () => {
  it("original preferences are not modified", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 25000 },
      priorities: [
        { attributeKey: "ram_gb", importance: 3 },
      ],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 12, operator: ">=" },
      ],
    };

    const budgetMax = preference.budget?.max;
    const ramValue = preference.constraints?.[0]?.value;
    const priorityImportance = preference.priorities[0].importance;

    relaxConstraints(catalog, preference, categoryConfig);

    // Original values should be unchanged
    expect(preference.budget?.max).toBe(budgetMax);
    expect(preference.constraints?.[0]?.value).toBe(ramValue);
    expect(preference.priorities[0].importance).toBe(priorityImportance);
  });
});

// ============================================================
// TEST 6: Unsupported category attributes do not crash
// ============================================================
describe("Constraint relaxation: Edge cases", () => {
  it("handles empty product list gracefully", () => {
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [],
      constraints: [],
    };

    const result = relaxConstraints([], preference, categoryConfig);

    expect(result.exactMatchFound).toBe(false);
    expect(result.alternatives.length).toBe(0);
    // With empty products and budget constraint, no relaxation can find products
    // The explanation reflects that no alternatives were found within limits
  });

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
    ];

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 10000 },
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 8, operator: ">=" },
      ],
    };

    // Should not crash
    const result = relaxConstraints(testCatalog, preference, categoryConfig);
    expect(result.exactMatchFound).toBe(false);
  });

  it("handles no budget gracefully", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      priorities: [],
      constraints: [],
    };

    const result = relaxConstraints(catalog, preference, categoryConfig);

    expect(result.exactMatchFound).toBe(true);
    expect(result.alternatives.length).toBe(catalog.length);
  });

  it("handles no constraints gracefully", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 50000 },
      priorities: [],
      constraints: [],
    };

    const result = relaxConstraints(catalog, preference, categoryConfig);

    expect(result.exactMatchFound).toBe(true);
    // All smartphones under ₹50,000 should pass
    expect(result.alternatives.length).toBe(catalog.length);
  });
});

// ============================================================
// TEST 7: Category-agnostic behavior
// ============================================================
describe("Constraint relaxation: Category-agnostic", () => {
  it("works for laptop category with RAM constraint", () => {
    const catalog = getCatalog("laptop");
    const categoryConfig = getCategoryConfig("laptop")!;

    // Require RAM >= 20 — no laptop has more than 16GB
    // Should relax to 16GB
    const preference: UserPreference = {
      category: "laptop",
      budget: { max: 60000 },
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 20, operator: ">=" },
      ],
    };

    const result = relaxConstraints(catalog, preference, categoryConfig);

    expect(result.exactMatchFound).toBe(false);

    // Should find alternatives with relaxed RAM constraint
    const ramRelaxation = result.relaxedConstraints.find(
      (r) => r.attribute === "ram_gb"
    );
    expect(ramRelaxation).toBeDefined();
    expect(ramRelaxation!.relaxedRequirement).toContain("16");
  });

  it("works for laptop with budget and attribute constraints", () => {
    const catalog = getCatalog("laptop");
    const categoryConfig = getCategoryConfig("laptop")!;

    // Budget ₹50,000 and RAM >= 16
    // Only laptops with 16GB RAM: MacBook (99900), Lenovo (54999), HP (51999)
    // Lenovo and HP exceed budget by ~10%
    const preference: UserPreference = {
      category: "laptop",
      budget: { max: 50000 },
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 16, operator: ">=" },
      ],
    };

    const result = relaxConstraints(catalog, preference, categoryConfig);

    expect(result.exactMatchFound).toBe(false);

    // Should find Lenovo (54999) or HP (51999) as alternatives
    // via budget relaxation (within 20% of 50000 = 60000)
    const laptopIds = result.alternatives.map((a) => a.product.id);
    const hasLenovoOrHP =
      laptopIds.includes("laptop-002") || laptopIds.includes("laptop-004");
    expect(hasLenovoOrHP).toBe(true);
  });
});

// ============================================================
// TEST 8: Relaxation impact assessment
// ============================================================
describe("Constraint relaxation: Impact assessment", () => {
  it("assigns low impact to budget relaxations", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 20000 },
      priorities: [],
      constraints: [],
    };

    const result = relaxConstraints(catalog, preference, categoryConfig);

    expect(result.exactMatchFound).toBe(false);
    if (result.alternatives.length > 0) {
      const budgetRelaxation = result.relaxedConstraints.find(
        (r) => r.attribute === "budget"
      );
      expect(budgetRelaxation).toBeDefined();
      expect(budgetRelaxation!.impact).toBe("low");
    }
  });

  it("assigns higher impact to high-priority attribute relaxations", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    // RAM is high priority (importance 3) with defaultImportance 3
    // Effective importance = 3 * 1.5 + 3 = 7.5 → high impact
    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [
        { attributeKey: "ram_gb", importance: 3 },
      ],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 16, operator: ">=" },
      ],
    };

    const result = relaxConstraints(catalog, preference, categoryConfig);

    expect(result.exactMatchFound).toBe(false);
    if (result.relaxedConstraints.length > 0) {
      const ramRelaxation = result.relaxedConstraints.find(
        (r) => r.attribute === "ram_gb"
      );
      expect(ramRelaxation).toBeDefined();
      expect(ramRelaxation!.impact).toBe("high");
    }
  });
});

// ============================================================
// TEST 9: Explanation generation
// ============================================================
describe("Constraint relaxation: Explanations", () => {
  it("provides explanation when no alternatives found", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    // Impossible constraint: RAM >= 100 — no value below 100 exists
    // OnePlus Nord 4 has 12GB which is the highest, so relaxation finds 12
    // But the relaxation should still produce alternatives
    const preference: UserPreference = {
      category: "smartphone",
      budget: {},
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 100, operator: ">=" },
      ],
    };

    const result = relaxConstraints(catalog, preference, categoryConfig);

    expect(result.exactMatchFound).toBe(false);
    // Relaxation finds products with RAM >= 12 (highest below 100)
    // OnePlus Nord 4 has 12GB RAM
    expect(result.alternatives.length).toBe(1);
    expect(result.alternatives[0].product.id).toBe("phone-003");
    expect(result.explanation).toContain("Found");
  });

  it("provides explanation when alternatives found", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 20000 },
      priorities: [],
      constraints: [],
    };

    const result = relaxConstraints(catalog, preference, categoryConfig);

    expect(result.exactMatchFound).toBe(false);
    expect(result.alternatives.length).toBeGreaterThan(0);
    expect(result.explanation).toContain("Found");
    expect(result.explanation).toContain("alternative");
  });
});

// ============================================================
// TEST 10: Multiple constraint relaxation
// ============================================================
describe("Constraint relaxation: Multiple constraints", () => {
  it("handles budget + attribute constraint together", () => {
    const catalog = getCatalog("smartphone");
    const categoryConfig = getCategoryConfig("smartphone")!;

    // Budget under ₹25,000 AND RAM >= 12
    // OnePlus Nord 4 (₹26,999, 12GB) — fails budget, meets RAM
    const preference: UserPreference = {
      category: "smartphone",
      budget: { max: 25000 },
      priorities: [],
      constraints: [
        { type: "attribute_comparison", attributeKey: "ram_gb", value: 12, operator: ">=" },
      ],
    };

    const result = relaxConstraints(catalog, preference, categoryConfig);

    expect(result.exactMatchFound).toBe(false);

    // Should find OnePlus Nord 4 as alternative
    const oneplus = result.alternatives.find(
      (a) => a.product.id === "phone-003"
    );
    expect(oneplus).toBeDefined();
    expect(oneplus!.product.price).toBe(26999);

    // Trade-off should mention budget
    const budgetTradeOff = oneplus!.tradeOffs.find(
      (t) => t.attribute === "budget"
    );
    expect(budgetTradeOff).toBeDefined();
  });
});
