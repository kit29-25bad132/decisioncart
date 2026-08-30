// ============================================================
// DecisionCart — Deterministic Decision Confidence Engine
// Pure TypeScript. No AI inference. Fully reproducible.
//
// Calculates how strongly a selected product matches the user's
// expressed decision criteria. This is NOT a payment-success
// prediction or product reliability rating.
// ============================================================

import type {
  AttributeConfig,
  DecisionConfidence,
  PriorityItem,
  ScoredProduct,
} from "@/types";

// --- Confidence Range Labels ---

const CONFIDENCE_RANGES: {
  min: number;
  max: number;
  level: DecisionConfidence["level"];
  description: string;
}[] = [
  { min: 80, max: 100, level: "high", description: "High confidence match" },
  { min: 60, max: 79, level: "good", description: "Good confidence match" },
  { min: 40, max: 59, level: "moderate", description: "Moderate confidence match" },
  { min: 0, max: 39, level: "low", description: "Low confidence match" },
];

function getConfidenceLevel(score: number): DecisionConfidence {
  const clamped = Math.max(0, Math.min(100, score));
  const range = CONFIDENCE_RANGES.find(
    (r) => clamped >= r.min && clamped <= r.max
  ) ?? CONFIDENCE_RANGES[CONFIDENCE_RANGES.length - 1];

  return {
    score: Math.round(clamped),
    level: range.level,
    explanation: range.description,
  };
}

// --- Sub-signal: Overall Score Strength ---
//
// How well the selected product scored relative to the maximum
// possible score (100). Range: 0–35 contribution.

function scoreStrengthSignal(totalScore: number): number {
  // Direct proportional: a score of 100 maps to 35, 0 maps to 0.
  return (totalScore / 100) * 35;
}

// --- Sub-signal: High-Priority Satisfaction ---
//
// How well the selected product performs on High/Extreme priority
// criteria. Only considers attributes with importance >= 3 (High).
// Range: 0–30 contribution.

function highPrioritySatisfactionSignal(
  scoredProduct: ScoredProduct,
  priorities: PriorityItem[]
): number {
  const highPriorityKeys = new Set(
    priorities.filter((p) => p.importance >= 3).map((p) => p.attributeKey)
  );

  if (highPriorityKeys.size === 0) return 15; // No high priorities → neutral

  const highContributions = scoredProduct.contributions.filter(
    (c) => highPriorityKeys.has(c.attributeKey) && c.available
  );

  if (highContributions.length === 0) return 0; // All high-priority data missing

  const avgNormalized =
    highContributions.reduce((sum, c) => sum + c.normalizedValue, 0) /
    highContributions.length;

  return avgNormalized * 30;
}

// --- Sub-signal: Budget Compatibility ---
//
// Whether the selected product fits the user's budget.
// Full credit if within budget, partial if close, zero if over.
// Range: 0–15 contribution.

function budgetCompatibilitySignal(
  product: ScoredProduct["product"],
  budget?: { min?: number; max?: number }
): number {
  if (!budget || !budget.max) return 15; // No budget constraint → full credit

  const price = product.price;
  const maxBudget = budget.max;

  if (price <= maxBudget) return 15; // Within budget → full credit

  // Over budget: penalize proportionally based on how far over
  const overRatio = (price - maxBudget) / maxBudget;
  // 10% over → 10 points lost; >50% over → 0
  const penalty = Math.min(overRatio * 100, 15);
  return Math.max(0, 15 - penalty);
}

// --- Sub-signal: Ranking Margin ---
//
// Difference between selected product's score and the second-best score.
// If the product is #1, this signals a clear lead.
// If the product is NOT #1, this signals how close it is to the top.
// Range: 0–20 contribution.

function rankingMarginSignal(
  scoredProduct: ScoredProduct,
  allScoredProducts: ScoredProduct[]
): number {
  if (allScoredProducts.length <= 1) return 20; // Only one product → max margin

  // Find the best score among all products
  const bestScore = Math.max(...allScoredProducts.map((sp) => sp.totalScore));
  const selectedScore = scoredProduct.totalScore;

  if (selectedScore >= bestScore) {
    // Product is #1: margin = difference to second best
    const sortedScores = allScoredProducts
      .map((sp) => sp.totalScore)
      .sort((a, b) => b - a);
    const secondBest = sortedScores[1] ?? 0;
    const margin = selectedScore - secondBest;

    // A margin of 15+ points → full 20; margin of 0 → 10
    return 10 + Math.min(margin / 15, 1) * 10;
  }

  // Product is NOT #1: how close is it to the top?
  const marginBelowTop = bestScore - selectedScore;
  // 0 margin → 10, 20+ margin → 0
  return Math.max(0, 10 - (marginBelowTop / 20) * 10);
}

// --- Main: Calculate Decision Confidence ---

export interface CalculateConfidenceInput {
  selectedProduct: ScoredProduct;
  allScoredProducts: ScoredProduct[];
  attributes: AttributeConfig[];
  priorities: PriorityItem[];
  budget?: { min?: number; max?: number };
}

/**
 * Calculate a deterministic decision confidence score.
 *
 * The confidence represents how strongly the selected product
 * matches the user's expressed decision criteria.
 *
 * Formula breakdown (total = 100):
 *   - Overall score strength:         0–35
 *   - High-priority satisfaction:     0–30
 *   - Budget compatibility:           0–15
 *   - Ranking margin:                 0–20
 *
 * @returns DecisionConfidence with score (0–100), level, and explanation.
 *          Always deterministic. Never NaN, Infinity, or negative.
 */
export function calculateDecisionConfidence(
  input: CalculateConfidenceInput
): DecisionConfidence {
  const { selectedProduct, allScoredProducts, priorities, budget } = input;

  // Guard: empty products → low confidence
  if (allScoredProducts.length === 0) {
    return getConfidenceLevel(0);
  }

  // Calculate each sub-signal
  const s1 = scoreStrengthSignal(selectedProduct.totalScore);
  const s2 = highPrioritySatisfactionSignal(selectedProduct, priorities);
  const s3 = budgetCompatibilitySignal(selectedProduct.product, budget);
  const s4 = rankingMarginSignal(selectedProduct, allScoredProducts);

  // Sum and clamp
  const raw = s1 + s2 + s3 + s4;
  const clamped = Math.max(0, Math.min(100, raw));

  // Final safety: ensure no NaN/Infinity
  if (!Number.isFinite(clamped)) {
    return getConfidenceLevel(0);
  }

  return getConfidenceLevel(clamped);
}

// --- Helper: Build Why-Matches list ---

/**
 * Build a deterministic list of reasons why the selected product
 * matches the user's criteria. Uses only real engine data.
 */
export function buildWhyMatches(
  input: CalculateConfidenceInput
): string[] {
  const { selectedProduct, allScoredProducts, priorities, budget } = input;
  const reasons: string[] = [];

  // Reason 1: Top criteria performance
  const highPriorityKeys = priorities
    .filter((p) => p.importance >= 3)
    .map((p) => p.attributeKey);

  if (highPriorityKeys.length > 0) {
    const highContributions = selectedProduct.contributions.filter(
      (c) => highPriorityKeys.includes(c.attributeKey) && c.available
    );

    const strongHigh = highContributions.filter(
      (c) => c.normalizedValue >= 0.7
    );
    if (strongHigh.length > 0) {
      const labels = strongHigh.map((c) => c.label).slice(0, 2);
      reasons.push(
        `Strong performance in your highest-priority criteria (${labels.join(", ")})`
      );
    }
  }

  // Reason 2: Budget compatibility
  if (budget?.max) {
    if (selectedProduct.product.price <= budget.max) {
      reasons.push(
        `Fits your budget of ₹${budget.max.toLocaleString()} at ₹${selectedProduct.product.price.toLocaleString()}`
      );
    } else {
      reasons.push(
        `Slightly exceeds your budget (₹${selectedProduct.product.price.toLocaleString()} vs ₹${budget.max.toLocaleString()})`
      );
    }
  }

  // Reason 3: Overall score
  if (selectedProduct.totalScore >= 70) {
    reasons.push(
      `Strong overall DecisionCart score of ${selectedProduct.totalScore}/100`
    );
  } else if (selectedProduct.totalScore >= 50) {
    reasons.push(
      `Good overall DecisionCart score of ${selectedProduct.totalScore}/100`
    );
  }

  // Reason 4: Ranking
  if (selectedProduct.rank === 1) {
    reasons.push("Ranked #1 across all compared products");
  } else {
    reasons.push(
      `Ranked #${selectedProduct.rank} of ${allScoredProducts.length} products`
    );
  }

  return reasons;
}

// --- Helper: Build Trade-off Notes for Selected Product ---

/**
 * Build a deterministic list of trade-off notes for the selected product.
 * Only uses real data from the scoring engine.
 */
export function buildTradeOffNotes(
  scoredProduct: ScoredProduct
): string[] {
  const notes: string[] = [];

  // Weaker contributions (normalized < 0.3 with non-zero weight)
  const weakContributions = scoredProduct.contributions
    .filter((c) => c.available && c.weight > 0 && c.normalizedValue < 0.3)
    .sort((a, b) => a.normalizedValue - b.normalizedValue);

  for (const c of weakContributions.slice(0, 3)) {
    notes.push(
      `Lower ${c.label.toLowerCase()} than some alternatives`
    );
  }

  // Missing attributes
  if (scoredProduct.missingAttributes.length > 0) {
    notes.push(
      `${scoredProduct.missingAttributes.length} attribute(s) have unknown data`
    );
  }

  return notes;
}
