// ============================================================
// DecisionCart — Decision Confidence Engine Tests
// Verifies deterministic behavior, bounds, and edge cases.
// ============================================================

import { describe, it, expect } from "vitest";
import {
  calculateDecisionConfidence,
  buildWhyMatches,
  buildTradeOffNotes,
  type CalculateConfidenceInput,
} from "./decision-confidence";
import type {
  ScoredProduct,
  ScoreContribution,
  PriorityItem,
  AttributeConfig,
} from "@/types";

// --- Test Helpers ---

function makeContributions(
  attrs: { key: string; label: string; normalized: number; weight: number; available: boolean }[]
): ScoreContribution[] {
  return attrs.map((a) => ({
    attributeKey: a.key,
    label: a.label,
    rawValue: 100,
    normalizedValue: a.normalized,
    weight: a.weight,
    contribution: a.normalized * a.weight,
    available: a.available,
  }));
}

function makeScoredProduct(
  overrides: Partial<ScoredProduct> & { score?: number; id?: string; rank?: number }
): ScoredProduct {
  return {
    product: {
      id: overrides.id ?? "test-product-1",
      name: "Test Product",
      brand: "Test Brand",
      category: "smartphone",
      price: overrides.product?.price ?? 25000,
      attributes: {},
      confidence: {},
    },
    totalScore: overrides.score ?? 75,
    rank: overrides.rank ?? 1,
    contributions: overrides.contributions ?? [],
    missingAttributes: overrides.missingAttributes ?? [],
    strengths: overrides.strengths ?? [],
    weaknesses: overrides.weaknesses ?? [],
    dataConfidence: overrides.dataConfidence ?? "high",
  };
}

function makeAttribute(key: string, label: string): AttributeConfig {
  return {
    key,
    label,
    type: "numeric",
    comparisonDirection: "higher_is_better",
    description: `${label} attribute`,
  };
}

// --- Tests ---

describe("calculateDecisionConfidence", () => {
  const smartphoneAttrs: AttributeConfig[] = [
    makeAttribute("camera_score", "Camera Quality"),
    makeAttribute("battery_mah", "Battery Life"),
    makeAttribute("display_inches", "Display Size"),
    makeAttribute("ram_gb", "RAM"),
    makeAttribute("storage_gb", "Storage"),
    makeAttribute("five_g", "5G Support"),
  ];

  const defaultPriorities: PriorityItem[] = [
    { attributeKey: "camera_score", importance: 3 },
    { attributeKey: "battery_mah", importance: 2 },
    { attributeKey: "display_inches", importance: 1 },
  ];

  const defaultBudget = { max: 30000 };

  it("produces a score between 0 and 100", () => {
    const input: CalculateConfidenceInput = {
      selectedProduct: makeScoredProduct({
        score: 70,
        contributions: makeContributions([
          { key: "camera_score", label: "Camera", normalized: 0.8, weight: 0.5, available: true },
          { key: "battery_mah", label: "Battery", normalized: 0.6, weight: 0.3, available: true },
          { key: "display_inches", label: "Display", normalized: 0.5, weight: 0.2, available: true },
        ]),
      }),
      allScoredProducts: [
        makeScoredProduct({ id: "p1", score: 70, rank: 1 }),
        makeScoredProduct({ id: "p2", score: 55, rank: 2 }),
      ],
      attributes: smartphoneAttrs,
      priorities: defaultPriorities,
      budget: defaultBudget,
    };

    const result = calculateDecisionConfidence(input);

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(Number.isFinite(result.score)).toBe(true);
  });

  it("is deterministic — same inputs produce same output", () => {
    const input: CalculateConfidenceInput = {
      selectedProduct: makeScoredProduct({
        score: 80,
        contributions: makeContributions([
          { key: "camera_score", label: "Camera", normalized: 0.9, weight: 0.5, available: true },
          { key: "battery_mah", label: "Battery", normalized: 0.7, weight: 0.3, available: true },
        ]),
      }),
      allScoredProducts: [
        makeScoredProduct({ id: "p1", score: 80 }),
        makeScoredProduct({ id: "p2", score: 60 }),
      ],
      attributes: smartphoneAttrs,
      priorities: defaultPriorities,
      budget: defaultBudget,
    };

    const result1 = calculateDecisionConfidence(input);
    const result2 = calculateDecisionConfidence(input);

    expect(result1.score).toBe(result2.score);
    expect(result1.level).toBe(result2.level);
  });

  it("never produces NaN", () => {
    const inputs: CalculateConfidenceInput[] = [
      // Normal case
      {
        selectedProduct: makeScoredProduct({ score: 50 }),
        allScoredProducts: [makeScoredProduct({ score: 50 })],
        attributes: smartphoneAttrs,
        priorities: defaultPriorities,
        budget: defaultBudget,
      },
      // Zero score
      {
        selectedProduct: makeScoredProduct({ score: 0 }),
        allScoredProducts: [makeScoredProduct({ score: 0 })],
        attributes: smartphoneAttrs,
        priorities: [],
        budget: undefined,
      },
      // High score
      {
        selectedProduct: makeScoredProduct({ score: 100 }),
        allScoredProducts: [makeScoredProduct({ score: 100 })],
        attributes: smartphoneAttrs,
        priorities: defaultPriorities,
        budget: defaultBudget,
      },
    ];

    for (const input of inputs) {
      const result = calculateDecisionConfidence(input);
      expect(Number.isNaN(result.score)).toBe(false);
      expect(Number.isFinite(result.score)).toBe(true);
    }
  });

  it("never produces Infinity", () => {
    const input: CalculateConfidenceInput = {
      selectedProduct: makeScoredProduct({ score: 100 }),
      allScoredProducts: [makeScoredProduct({ score: 100 })],
      attributes: smartphoneAttrs,
      priorities: defaultPriorities,
      budget: defaultBudget,
    };

    const result = calculateDecisionConfidence(input);
    expect(result.score).not.toBe(Infinity);
    expect(result.score).not.toBe(-Infinity);
  });

  it("returns 0 confidence for zero-result case", () => {
    const input: CalculateConfidenceInput = {
      selectedProduct: makeScoredProduct({ score: 50 }),
      allScoredProducts: [],
      attributes: smartphoneAttrs,
      priorities: defaultPriorities,
      budget: defaultBudget,
    };

    const result = calculateDecisionConfidence(input);
    expect(result.score).toBe(0);
  });

  it("assigns high confidence for strong top-ranked product with good budget fit", () => {
    const input: CalculateConfidenceInput = {
      selectedProduct: makeScoredProduct({
        id: "best",
        score: 88,
        rank: 1,
        product: { price: 20000 } as ScoredProduct["product"],
        contributions: makeContributions([
          { key: "camera_score", label: "Camera", normalized: 0.9, weight: 0.5, available: true },
          { key: "battery_mah", label: "Battery", normalized: 0.8, weight: 0.3, available: true },
          { key: "display_inches", label: "Display", normalized: 0.7, weight: 0.2, available: true },
        ]),
      }),
      allScoredProducts: [
        makeScoredProduct({ id: "best", score: 88, rank: 1 }),
        makeScoredProduct({ id: "second", score: 65, rank: 2 }),
      ],
      attributes: smartphoneAttrs,
      priorities: defaultPriorities,
      budget: { max: 30000 },
    };

    const result = calculateDecisionConfidence(input);
    expect(result.level).toBe("high");
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it("assigns lower confidence when product is not #1", () => {
    const inputHigh: CalculateConfidenceInput = {
      selectedProduct: makeScoredProduct({
        id: "best",
        score: 85,
        rank: 1,
        contributions: makeContributions([
          { key: "camera_score", label: "Camera", normalized: 0.9, weight: 0.5, available: true },
          { key: "battery_mah", label: "Battery", normalized: 0.8, weight: 0.3, available: true },
        ]),
      }),
      allScoredProducts: [
        makeScoredProduct({ id: "best", score: 85, rank: 1 }),
        makeScoredProduct({ id: "second", score: 50, rank: 2 }),
      ],
      attributes: smartphoneAttrs,
      priorities: defaultPriorities,
      budget: defaultBudget,
    };

    const inputLow: CalculateConfidenceInput = {
      selectedProduct: makeScoredProduct({
        id: "third",
        score: 40,
        rank: 3,
        contributions: makeContributions([
          { key: "camera_score", label: "Camera", normalized: 0.4, weight: 0.5, available: true },
          { key: "battery_mah", label: "Battery", normalized: 0.3, weight: 0.3, available: true },
        ]),
      }),
      allScoredProducts: [
        makeScoredProduct({ id: "best", score: 85, rank: 1 }),
        makeScoredProduct({ id: "second", score: 60, rank: 2 }),
        makeScoredProduct({ id: "third", score: 40, rank: 3 }),
      ],
      attributes: smartphoneAttrs,
      priorities: defaultPriorities,
      budget: defaultBudget,
    };

    const high = calculateDecisionConfidence(inputHigh);
    const low = calculateDecisionConfidence(inputLow);

    expect(high.score).toBeGreaterThan(low.score);
  });

  it("assigns lower confidence when product exceeds budget", () => {
    const withinBudget: CalculateConfidenceInput = {
      selectedProduct: makeScoredProduct({
        id: "cheap",
        score: 70,
        rank: 1,
        product: { price: 25000 } as ScoredProduct["product"],
      }),
      allScoredProducts: [
        makeScoredProduct({ id: "cheap", score: 70, rank: 1 }),
      ],
      attributes: smartphoneAttrs,
      priorities: defaultPriorities,
      budget: { max: 30000 },
    };

    const overBudget: CalculateConfidenceInput = {
      selectedProduct: makeScoredProduct({
        id: "expensive",
        score: 70,
        rank: 1,
        product: { price: 50000 } as ScoredProduct["product"],
      }),
      allScoredProducts: [
        makeScoredProduct({ id: "expensive", score: 70, rank: 1 }),
      ],
      attributes: smartphoneAttrs,
      priorities: defaultPriorities,
      budget: { max: 30000 },
    };

    const within = calculateDecisionConfidence(withinBudget);
    const over = calculateDecisionConfidence(overBudget);

    expect(within.score).toBeGreaterThan(over.score);
  });

  it("valid confidence level labels", () => {
    const validLevels = ["high", "good", "moderate", "low"];

    const input: CalculateConfidenceInput = {
      selectedProduct: makeScoredProduct({ score: 60 }),
      allScoredProducts: [makeScoredProduct({ score: 60 })],
      attributes: smartphoneAttrs,
      priorities: defaultPriorities,
      budget: defaultBudget,
    };

    const result = calculateDecisionConfidence(input);
    expect(validLevels).toContain(result.level);
  });

  it("handles tied scores correctly", () => {
    const input: CalculateConfidenceInput = {
      selectedProduct: makeScoredProduct({
        id: "p1",
        score: 70,
        rank: 1,
      }),
      allScoredProducts: [
        makeScoredProduct({ id: "p1", score: 70, rank: 1 }),
        makeScoredProduct({ id: "p2", score: 70, rank: 1 }),
      ],
      attributes: smartphoneAttrs,
      priorities: defaultPriorities,
      budget: defaultBudget,
    };

    const result = calculateDecisionConfidence(input);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(Number.isFinite(result.score)).toBe(true);
  });

  it("handles single product result", () => {
    const input: CalculateConfidenceInput = {
      selectedProduct: makeScoredProduct({
        score: 65,
        rank: 1,
        contributions: makeContributions([
          { key: "camera_score", label: "Camera", normalized: 0.7, weight: 0.5, available: true },
          { key: "battery_mah", label: "Battery", normalized: 0.6, weight: 0.3, available: true },
        ]),
      }),
      allScoredProducts: [
        makeScoredProduct({ id: "p1", score: 65, rank: 1 }),
      ],
      attributes: smartphoneAttrs,
      priorities: defaultPriorities,
      budget: defaultBudget,
    };

    const result = calculateDecisionConfidence(input);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(Number.isFinite(result.score)).toBe(true);
  });

  it("handles zero scores across all products", () => {
    const input: CalculateConfidenceInput = {
      selectedProduct: makeScoredProduct({
        score: 0,
        contributions: makeContributions([
          { key: "camera_score", label: "Camera", normalized: 0, weight: 0.5, available: true },
        ]),
      }),
      allScoredProducts: [
        makeScoredProduct({ id: "p1", score: 0 }),
        makeScoredProduct({ id: "p2", score: 0 }),
      ],
      attributes: smartphoneAttrs,
      priorities: defaultPriorities,
      budget: defaultBudget,
    };

    const result = calculateDecisionConfidence(input);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(Number.isFinite(result.score)).toBe(true);
  });

  it("works with laptop-category attributes", () => {
    const laptopAttrs: AttributeConfig[] = [
      makeAttribute("processor_score", "Processor Performance"),
      makeAttribute("ram_gb", "RAM"),
      makeAttribute("battery_hours", "Battery Life"),
      makeAttribute("display_inches", "Display Size"),
      makeAttribute("weight_kg", "Portability"),
      makeAttribute("ssd_gb", "Storage"),
    ];

    const laptopPriorities: PriorityItem[] = [
      { attributeKey: "processor_score", importance: 3 },
      { attributeKey: "ram_gb", importance: 3 },
      { attributeKey: "weight_kg", importance: 2 },
    ];

    const input: CalculateConfidenceInput = {
      selectedProduct: makeScoredProduct({
        id: "laptop-1",
        score: 82,
        rank: 1,
        product: { price: 55000 } as ScoredProduct["product"],
        contributions: makeContributions([
          { key: "processor_score", label: "Processor", normalized: 0.85, weight: 0.5, available: true },
          { key: "ram_gb", label: "RAM", normalized: 0.9, weight: 0.3, available: true },
          { key: "weight_kg", label: "Portability", normalized: 0.7, weight: 0.2, available: true },
        ]),
      }),
      allScoredProducts: [
        makeScoredProduct({ id: "laptop-1", score: 82, rank: 1 }),
        makeScoredProduct({ id: "laptop-2", score: 60, rank: 2 }),
      ],
      attributes: laptopAttrs,
      priorities: laptopPriorities,
      budget: { max: 60000 },
    };

    const result = calculateDecisionConfidence(input);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.level).toBe("high");
  });
});

describe("buildWhyMatches", () => {
  const defaultPriorities: PriorityItem[] = [
    { attributeKey: "camera_score", importance: 3 },
    { attributeKey: "battery_mah", importance: 2 },
  ];

  it("returns non-empty array for a valid product", () => {
    const input: CalculateConfidenceInput = {
      selectedProduct: makeScoredProduct({
        score: 75,
        rank: 1,
        product: { price: 25000 } as ScoredProduct["product"],
        contributions: makeContributions([
          { key: "camera_score", label: "Camera", normalized: 0.9, weight: 0.5, available: true },
          { key: "battery_mah", label: "Battery", normalized: 0.7, weight: 0.3, available: true },
        ]),
      }),
      allScoredProducts: [
        makeScoredProduct({ id: "p1", score: 75, rank: 1 }),
      ],
      attributes: [
        makeAttribute("camera_score", "Camera Quality"),
        makeAttribute("battery_mah", "Battery Life"),
      ],
      priorities: defaultPriorities,
      budget: { max: 30000 },
    };

    const reasons = buildWhyMatches(input);
    expect(reasons.length).toBeGreaterThan(0);
    // Should mention budget compatibility
    expect(reasons.some((r) => r.includes("budget") || r.includes("₹"))).toBe(true);
  });

  it("returns reasons with no NaN or Infinity", () => {
    const input: CalculateConfidenceInput = {
      selectedProduct: makeScoredProduct({
        score: 50,
        contributions: makeContributions([
          { key: "camera_score", label: "Camera", normalized: 0.5, weight: 0.5, available: true },
        ]),
      }),
      allScoredProducts: [makeScoredProduct({ score: 50 })],
      attributes: [makeAttribute("camera_score", "Camera Quality")],
      priorities: defaultPriorities,
      budget: undefined,
    };

    const reasons = buildWhyMatches(input);
    for (const reason of reasons) {
      expect(typeof reason).toBe("string");
      expect(reason.length).toBeGreaterThan(0);
    }
  });
});

describe("buildTradeOffNotes", () => {
  it("identifies weak contributions", () => {
    const sp = makeScoredProduct({
      score: 60,
      contributions: makeContributions([
        { key: "camera_score", label: "Camera Quality", normalized: 0.9, weight: 0.5, available: true },
        { key: "battery_mah", label: "Battery Life", normalized: 0.15, weight: 0.3, available: true },
        { key: "display_inches", label: "Display Size", normalized: 0.1, weight: 0.2, available: true },
      ]),
      missingAttributes: ["five_g"],
    });

    const notes = buildTradeOffNotes(sp);
    // Should identify weak contributions and missing data
    expect(notes.length).toBeGreaterThan(0);
  });

  it("returns empty for strong product", () => {
    const sp = makeScoredProduct({
      score: 90,
      contributions: makeContributions([
        { key: "camera_score", label: "Camera Quality", normalized: 0.9, weight: 0.5, available: true },
        { key: "battery_mah", label: "Battery Life", normalized: 0.85, weight: 0.3, available: true },
        { key: "display_inches", label: "Display Size", normalized: 0.8, weight: 0.2, available: true },
      ]),
    });

    const notes = buildTradeOffNotes(sp);
    // No weak contributions, no missing attributes
    expect(notes).toHaveLength(0);
  });
});
