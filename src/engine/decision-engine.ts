// ============================================================
// DecisionCart — Deterministic Decision Engine
// Pure TypeScript. No AI inference. Fully reproducible.
// ============================================================

import type {
  AttributeConfig,
  CategoryConfig,
  Constraint,
  DecisionMatrix,
  DecisionResult,
  MatrixCell,
  MatrixRow,
  PriorityItem,
  Product,
  ScoreContribution,
  ScoredProduct,
  TradeOff,
  UserPreference,
} from "@/types";
import { analyzeEmptyResults } from "./empty-result-analysis";

// --- Weight Calculation ---

/** Multiplier applied to explicitly prioritized attributes. */
const PRIORITY_BOOST = 1.5;

/** Fallback baseline importance when defaultImportance is not set. */
const FALLBACK_BASELINE = 2;

/**
 * Convert priority items into normalized weights summing to 1.0.
 *
 * Weight resolution rules:
 *  1. Explicitly requested attributes receive a boosted importance.
 *  2. Unspecified but relevant category attributes receive baseline importance
 *     from category configuration (defaultImportance).
 *  3. The final weights are normalized so they sum to 1.0.
 *
 * This is category-agnostic: behavior is driven entirely by AttributeConfig.
 */
export function calculateWeights(
  priorities: PriorityItem[],
  attributes: AttributeConfig[]
): Record<string, number> {
  const priorityMap = new Map(
    priorities.map((p) => [p.attributeKey, p.importance])
  );

  // Step 1: compute effective importance for every attribute
  const effectiveImportances: { key: string; importance: number }[] = [];

  for (const attr of attributes) {
    const explicit = priorityMap.get(attr.key);
    const baseline = attr.defaultImportance ?? FALLBACK_BASELINE;

    let effective: number;
    if (explicit !== undefined) {
      // Explicit user priority: boost on top of baseline
      effective = explicit * PRIORITY_BOOST + baseline;
    } else {
      // No explicit priority: use baseline category importance
      effective = baseline;
    }
    effectiveImportances.push({ key: attr.key, importance: effective });
  }

  // Step 2: sort by effective importance descending for exponential decay
  effectiveImportances.sort((a, b) => b.importance - a.importance);

  // Step 3: exponential decay — highest effective importance gets base^0, etc.
  const base = 0.5;
  let rawSum = 0;
  const rawWeights: number[] = [];

  for (let i = 0; i < effectiveImportances.length; i++) {
    const raw =
      Math.pow(base, i) * effectiveImportances[i].importance;
    rawWeights.push(raw);
    rawSum += raw;
  }

  // Step 4: normalize to sum to 1.0
  const weights: Record<string, number> = {};
  for (let i = 0; i < effectiveImportances.length; i++) {
    weights[effectiveImportances[i].key] =
      rawSum > 0 ? rawWeights[i] / rawSum : 0;
  }

  return weights;
}

// --- Normalization ---

/**
 * Normalize a product set's attribute values to 0–1 scale.
 * Returns normalized values per product per attribute.
 */
export function normalizeProducts(
  products: Product[],
  attributes: AttributeConfig[]
): Map<string, Record<string, number | null>> {
  const normalized = new Map<string, Record<string, number | null>>();

  for (const attr of attributes) {
    if (attr.type === "binary") {
      // Binary: true=1, false=0, null=0
      for (const product of products) {
        const val = product.attributes[attr.key];
        if (!normalized.has(product.id)) normalized.set(product.id, {});
        const map = normalized.get(product.id)!;
        map[attr.key] = val === null || val === undefined ? null : val ? 1 : 0;
      }
      continue;
    }

    // Numeric: collect all present values for min/max
    const values: number[] = [];
    for (const product of products) {
      const val = product.attributes[attr.key];
      if (typeof val === "number") values.push(val);
    }

    if (values.length === 0) {
      // No data for this attribute at all
      for (const product of products) {
        if (!normalized.has(product.id)) normalized.set(product.id, {});
        normalized.get(product.id)![attr.key] = null;
      }
      continue;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    for (const product of products) {
      const val = product.attributes[attr.key];
      if (!normalized.has(product.id)) normalized.set(product.id, {});
      const map = normalized.get(product.id)!;

      if (typeof val !== "number") {
        map[attr.key] = null; // missing data
        continue;
      }

      if (range === 0) {
        // All values identical — full score
        map[attr.key] = 1;
        continue;
      }

      map[attr.key] =
        attr.comparisonDirection === "higher_is_better"
          ? (val - min) / range
          : (max - val) / range;
    }
  }

  return normalized;
}

// --- Scoring ---

/**
 * Calculate a deterministic score for a single product.
 * Missing attributes are redistributed proportionally.
 */
export function scoreProduct(
  product: Product,
  weights: Record<string, number>,
  normalized: Record<string, number | null>,
  attributes: AttributeConfig[]
): {
  totalScore: number;
  contributions: ScoreContribution[];
  missingAttributes: string[];
} {
  const contributions: ScoreContribution[] = [];
  const missingAttributes: string[] = [];

  // Separate available and missing
  let availableWeightSum = 0;
  let totalContribution = 0;

  // First pass: identify missing and available
  const availableAttrs: AttributeConfig[] = [];
  for (const attr of attributes) {
    const normVal = normalized[attr.key];
    if (normVal === null || normVal === undefined) {
      missingAttributes.push(attr.key);
    } else {
      availableAttrs.push(attr);
      availableWeightSum += weights[attr.key] ?? 0;
    }
  }

  // Second pass: score with redistributed weights
  for (const attr of attributes) {
    const rawVal = product.attributes[attr.key];
    const normVal = normalized[attr.key];
    const originalWeight = weights[attr.key] ?? 0;

    const available = normVal !== null && normVal !== undefined;
    const effectiveWeight =
      available && availableWeightSum > 0
        ? originalWeight / availableWeightSum
        : 0;
    const contribution = available ? normVal * effectiveWeight : 0;
    totalContribution += contribution;

    contributions.push({
      attributeKey: attr.key,
      label: attr.label,
      rawValue: rawVal,
      normalizedValue: normVal ?? 0,
      weight: originalWeight,
      contribution,
      available,
    });
  }

  // Normalize total to 0–100
  const totalScore = Math.round(totalContribution * 10000) / 100;

  return { totalScore, contributions, missingAttributes };
}

// --- Strengths & Weaknesses ---

function identifyStrengthsAndWeaknesses(
  contributions: ScoreContribution[]
): { strengths: string[]; weaknesses: string[] } {
  const available = contributions.filter(
    (c) => c.available && c.weight > 0
  );

  if (available.length === 0) return { strengths: [], weaknesses: [] };

  // Strengths: highest contribution-to-weight ratio
  const sorted = [...available].sort(
    (a, b) =>
      b.contribution / (b.weight || 1) - a.contribution / (a.weight || 1)
  );

  const strengths = sorted.slice(0, 2).map((c) => c.label);
  // Weaknesses: lowest contribution-to-weight ratio, excluding any already in strengths
  const strengthSet = new Set(strengths);
  const weaknesses = sorted
    .filter((c) => !strengthSet.has(c.label))
    .slice(-2)
    .reverse()
    .map((c) => c.label);

  return { strengths, weaknesses };
}

// --- Data Confidence ---

function calculateDataConfidence(
  contributions: ScoreContribution[],
  allAttributes: AttributeConfig[]
): "high" | "medium" | "low" | "unknown" {
  const total = allAttributes.length;
  if (total === 0) return "unknown";

  const availableCount = contributions.filter((c) => c.available).length;
  const ratio = availableCount / total;

  if (ratio >= 0.8) return "high";
  if (ratio >= 0.5) return "medium";
  if (ratio > 0) return "low";
  return "unknown";
}

// --- Trade-Off Detection ---

function detectTradeOffs(
  scoredProducts: ScoredProduct[],
  attributes: AttributeConfig[]
): TradeOff[] {
  const tradeOffs: TradeOff[] = [];

  for (const attr of attributes) {
    let bestProduct: ScoredProduct | null = null;
    let bestNormalized = -1;

    for (const sp of scoredProducts) {
      const contrib = sp.contributions.find(
        (c) => c.attributeKey === attr.key
      );
      if (contrib && contrib.available && contrib.normalizedValue > bestNormalized) {
        bestNormalized = contrib.normalizedValue;
        bestProduct = sp;
      }
    }

    if (bestProduct) {
      tradeOffs.push({
        criterionKey: attr.key,
        criterionLabel: attr.label,
        winnerProductId: bestProduct.product.id,
        winnerProductName: bestProduct.product.name,
        score: Math.round(bestNormalized * 100),
      });
    }
  }

  return tradeOffs;
}

// --- Hard Constraints ---

/**
 * Extract a numeric value from a product attribute value.
 * Handles raw numbers, numeric strings ("8", "256"), and strings with units
 * ("8 GB", "256GB", "6.7 inches", "5000 mAh").
 * Returns null if the value cannot be converted to a number.
 */
function extractNumericValue(
  val: number | boolean | string | null | undefined
): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return val;
  if (typeof val === "boolean") return val ? 1 : 0;
  if (typeof val === "string") {
    // Strip common units and whitespace, then parse
    const cleaned = val
      .replace(/\s+/g, "")
      .replace(/gb|mb|ghz|mhz|mah|hours|inches|kg|in|cm|mm|wh/gi, "")
      .replace(/,/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  return null;
}

/**
 * Evaluate a single attribute_comparison constraint against a product.
 * Missing data: product passes (we cannot prove it fails the constraint).
 */
function passesAttributeComparison(
  product: Product,
  constraint: Constraint
): boolean {
  if (!constraint.attributeKey || !constraint.operator) return true;

  const rawVal = product.attributes[constraint.attributeKey];
  const productNum = extractNumericValue(rawVal);
  const constraintNum = extractNumericValue(constraint.value);

  // If either value cannot be resolved, product passes (missing data = eligible)
  if (productNum === null || constraintNum === null) return true;

  switch (constraint.operator) {
    case ">=":
      return productNum >= constraintNum;
    case "<=":
      return productNum <= constraintNum;
    case ">":
      return productNum > constraintNum;
    case "<":
      return productNum < constraintNum;
    case "=":
      return productNum === constraintNum;
    case "!=":
      return productNum !== constraintNum;
    default:
      return true;
  }
}

function passesConstraints(
  product: Product,
  constraints?: Constraint[]
): boolean {
  if (!constraints || constraints.length === 0) return true;

  for (const constraint of constraints) {
    switch (constraint.type) {
      case "max_price":
        if (product.price > (constraint.value as number)) return false;
        break;
      case "min_price":
        if (product.price < (constraint.value as number)) return false;
        break;
      case "required_attribute": {
        const val = product.attributes[constraint.attributeKey!];
        if (val === null || val === undefined || val === false) return false;
        break;
      }
      case "exclude_attribute": {
        const val = product.attributes[constraint.attributeKey!];
        if (val === constraint.value) return false;
        break;
      }
      case "attribute_comparison": {
        if (!passesAttributeComparison(product, constraint)) return false;
        break;
      }
    }
  }

  return true;
}

/**
 * Check if a product passes the budget filter.
 * Budget is a HARD eligibility constraint, not a preference.
 */
function passesBudget(product: Product, budget?: { min?: number; max?: number }): boolean {
  if (!budget) return true;

  const price = product.price;
  if (price === null || price === undefined) return true; // Unknown price is eligible

  if (budget.max !== undefined && price > budget.max) return false;
  if (budget.min !== undefined && price < budget.min) return false;

  return true;
}

// --- Build Decision Matrix ---

export function buildDecisionMatrix(
  products: Product[],
  attributes: AttributeConfig[],
  normalized: Map<string, Record<string, number | null>>,
  scores?: Map<string, number>
): DecisionMatrix {
  const rows: MatrixRow[] = products.map((product) => {
    const norm = normalized.get(product.id) ?? {};
    const cells: Record<string, MatrixCell> = {};

    for (const attr of attributes) {
      cells[attr.key] = {
        value: product.attributes[attr.key] ?? null,
        normalized: norm[attr.key] ?? null,
        available: norm[attr.key] !== null && norm[attr.key] !== undefined,
      };
    }

    return {
      product,
      cells,
      score: scores?.get(product.id) ?? 0,
    };
  });

  return { attributes, rows };
}

// --- Main Decision Function ---

export function runDecision(
  products: Product[],
  preference: UserPreference,
  categoryConfig: CategoryConfig
): DecisionResult {
  const { attributes } = categoryConfig;

  // 1. Filter by hard constraints (budget + explicit constraints)
  const filtered = products.filter(
    (p) =>
      passesBudget(p, preference.budget) && passesConstraints(p, preference.constraints)
  );

  if (filtered.length === 0) {
    const emptyAnalysis = analyzeEmptyResults(products, preference, categoryConfig);
    return {
      scoredProducts: [],
      tradeOffs: [],
      querySummary: buildQuerySummary(preference, categoryConfig),
      categoryLabel: categoryConfig.label,
      emptyResultAnalysis: emptyAnalysis,
    };
  }

  // 2. Calculate weights from priorities + category baseline importance
  const weights = calculateWeights(
    preference.priorities,
    attributes
  );

  // 3. Normalize all attributes
  const normalized = normalizeProducts(filtered, attributes);

  // 4. Score each product
  const scored: ScoredProduct[] = filtered.map((product) => {
    const norm = normalized.get(product.id) ?? {};
    const { totalScore, contributions, missingAttributes } = scoreProduct(
      product,
      weights,
      norm,
      attributes
    );
    const { strengths, weaknesses } = identifyStrengthsAndWeaknesses(
      contributions
    );
    const dataConfidence = calculateDataConfidence(contributions, attributes);

    return {
      product,
      totalScore,
      rank: 0, // set after sorting
      contributions,
      missingAttributes,
      strengths,
      weaknesses,
      dataConfidence,
    };
  });

  // 5. Rank by score descending, break ties by price (lower = better)
  scored.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return a.product.price - b.product.price;
  });

  scored.forEach((sp, i) => {
    sp.rank = i + 1;
  });

  // 6. Detect trade-offs
  const tradeOffs = detectTradeOffs(scored, attributes);

  // 7. Build summary
  const querySummary = buildQuerySummary(preference, categoryConfig);

  return {
    scoredProducts: scored,
    tradeOffs,
    querySummary,
    categoryLabel: categoryConfig.label,
  };
}

// --- Stale Selection Prevention ---

/**
 * Safely resolve the effective selected product ID.
 * Prevents stale selections when the selected product is no longer in results.
 *
 * Rules:
 *  1. If selectedProductId exists AND present in scoredProducts → return it.
 *  2. If selectedProductId is null → return top ranked product ID.
 *  3. If selectedProductId exists but not in scoredProducts → return top ranked product ID.
 *  4. If scoredProducts is empty → return null.
 */
export function resolveEffectiveSelectedId(
  selectedProductId: string | null,
  scoredProducts: ScoredProduct[]
): string | null {
  if (scoredProducts.length === 0) return null;

  if (
    selectedProductId !== null &&
    scoredProducts.some((sp) => sp.product.id === selectedProductId)
  ) {
    return selectedProductId;
  }

  return scoredProducts[0].product.id;
}

// --- Query Summary Builder ---

function buildQuerySummary(
  preference: UserPreference,
  categoryConfig: CategoryConfig
): string {
  const parts: string[] = [];

  parts.push(`Category: ${categoryConfig.label}`);

  if (preference.budget) {
    const { min, max } = preference.budget;
    if (min && max) parts.push(`Budget: ₹${min.toLocaleString()} – ₹${max.toLocaleString()}`);
    else if (max) parts.push(`Budget: Under ₹${max.toLocaleString()}`);
    else if (min) parts.push(`Budget: Above ₹${min.toLocaleString()}`);
  }

  if (preference.priorities.length > 0) {
    const sorted = [...preference.priorities].sort(
      (a, b) => b.importance - a.importance
    );
    const labels = sorted.map((p) => {
      const attr = categoryConfig.attributes.find(
        (a) => a.key === p.attributeKey
      );
      const label = attr?.label ?? p.attributeKey;
      const impLabel =
        p.importance === 3 ? "High" : p.importance === 2 ? "Medium" : "Low";
      return `${label} (${impLabel})`;
    });
    parts.push(`Priorities: ${labels.join(", ")}`);
  }

  return parts.join(" · ");
}
