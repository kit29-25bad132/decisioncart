// ============================================================
// DecisionCart — Constraint Relaxation Engine
// Category-agnostic intelligent multi-constraint relaxation.
// Deterministic. No AI inference. No external calls.
//
// When no product satisfies all user constraints, this engine
// intelligently finds the closest viable alternatives by:
// 1. Preserving highest-priority preferences
// 2. Preserving hard constraints where possible
// 3. Relaxing lowest-impact constraints first
// 4. Preferring the smallest possible relaxation
// 5. Clearly explaining every compromise
// ============================================================

import type {
  AttributeConfig,
  CategoryConfig,
  ComparisonOperator,
  Constraint,
  Product,
  UserPreference,
} from "@/types";

// --- Types ---

/** Impact level of a constraint relaxation. */
export type RelaxationImpact = "low" | "medium" | "high";

/** A single constraint that was relaxed. */
export interface RelaxedConstraint {
  /** Attribute key or constraint type identifier. */
  attribute: string;
  /** Original requirement value. */
  originalRequirement: string;
  /** Relaxed requirement value. */
  relaxedRequirement: string;
  /** Impact of this relaxation on the user's preferences. */
  impact: RelaxationImpact;
  /** Human-readable reason for this relaxation. */
  reason: string;
}

/** A product that was found through constraint relaxation. */
export interface RelaxedProduct {
  /** The original product from the catalog. */
  product: Product;
  /** Whether this product meets all original constraints. */
  meetsAllOriginal: boolean;
  /** Trade-offs incurred by choosing this product. */
  tradeOffs: TradeOffDetail[];
  /** The relaxed constraints that were needed for this product. */
  requiredRelaxations: RelaxedConstraint[];
}

/** A specific trade-off detail for a relaxed product. */
export interface TradeOffDetail {
  /** Attribute key or "budget". */
  attribute: string;
  /** Human-readable description of what was required. */
  description: string;
  /** The original requirement. */
  original: string;
  /** The actual value in the product. */
  actual: string;
  /** Impact level. */
  impact: RelaxationImpact;
}

/** Result of the constraint relaxation analysis. */
export interface ConstraintRelaxationResult {
  /** Whether an exact match was found (no relaxation needed). */
  exactMatchFound: boolean;
  /** Products found through relaxation, sorted by best trade-offs. */
  alternatives: RelaxedProduct[];
  /** Summary of all relaxed constraints across alternatives. */
  relaxedConstraints: RelaxedConstraint[];
  /** Human-readable explanation of the relaxation results. */
  explanation: string;
  /** Number of products found. */
  alternativeCount: number;
}

// --- Constants ---

/** Maximum budget relaxation percentage (20%). */
const MAX_BUDGET_RELAXATION_PCT = 0.20;

/** Maximum number of alternatives to return. */
const MAX_ALTERNATIVES = 5;

// --- Numeric Value Extraction ---

/**
 * Extract a numeric value from a product attribute.
 * Mirrors the extraction logic in decision-engine.ts and empty-result-analysis.ts.
 */
function extractNumericValue(
  val: number | boolean | string | null | undefined
): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return val;
  if (typeof val === "boolean") return val ? 1 : 0;
  if (typeof val === "string") {
    const cleaned = val
      .replace(/\s+/g, "")
      .replace(/gb|mb|ghz|mhz|mah|hours|inches|kg|in|cm|mm|wh/gi, "")
      .replace(/,/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  return null;
}

// --- Constraint Evaluation ---

/** Check if a product passes a single constraint. */
function passesConstraint(product: Product, constraint: Constraint): boolean {
  switch (constraint.type) {
    case "max_price":
      return product.price <= (constraint.value as number);
    case "min_price":
      return product.price >= (constraint.value as number);
    case "required_attribute": {
      const val = product.attributes[constraint.attributeKey!];
      return val !== null && val !== undefined && val !== false;
    }
    case "exclude_attribute":
      return product.attributes[constraint.attributeKey!] !== constraint.value;
    case "attribute_comparison": {
      if (!constraint.attributeKey || !constraint.operator) return true;
      const productNum = extractNumericValue(
        product.attributes[constraint.attributeKey]
      );
      const constraintNum = extractNumericValue(constraint.value);
      if (productNum === null || constraintNum === null) return true;
      return compareNumeric(productNum, constraint.operator, constraintNum);
    }
    default:
      return true;
  }
}

/** Check if a product passes the budget filter. */
function passesBudget(
  product: Product,
  budget?: { min?: number; max?: number }
): boolean {
  if (!budget) return true;
  const price = product.price;
  if (price === null || price === undefined) return true;
  if (budget.max !== undefined && price > budget.max) return false;
  if (budget.min !== undefined && price < budget.min) return false;
  return true;
}

/** Check if a product passes all original constraints and budget. */
function passesAllOriginal(
  product: Product,
  preference: UserPreference
): boolean {
  if (!passesBudget(product, preference.budget)) return false;
  if (preference.constraints) {
    for (const constraint of preference.constraints) {
      if (!passesConstraint(product, constraint)) return false;
    }
  }
  return true;
}

function compareNumeric(
  a: number,
  op: ComparisonOperator,
  b: number
): boolean {
  switch (op) {
    case ">=": return a >= b;
    case "<=": return a <= b;
    case ">":  return a > b;
    case "<":  return a < b;
    case "=":  return a === b;
    case "!=": return a !== b;
    default:   return true;
  }
}

// --- Relaxation Finding ---

/** Find the nearest lower numeric value in products for >= relaxation. */
function findRelaxedGteValue(
  products: Product[],
  attributeKey: string,
  currentValue: number
): number | null {
  const valuesBelow = new Set<number>();
  for (const p of products) {
    const v = extractNumericValue(p.attributes[attributeKey]);
    if (v !== null && v < currentValue) {
      valuesBelow.add(v);
    }
  }
  if (valuesBelow.size === 0) return null;
  return Math.max(...valuesBelow);
}

/** Find the nearest higher numeric value in products for <= relaxation. */
function findRelaxedLteValue(
  products: Product[],
  attributeKey: string,
  currentValue: number
): number | null {
  const valuesAbove = new Set<number>();
  for (const p of products) {
    const v = extractNumericValue(p.attributes[attributeKey]);
    if (v !== null && v > currentValue) {
      valuesAbove.add(v);
    }
  }
  if (valuesAbove.size === 0) return null;
  return Math.min(...valuesAbove);
}

/** Find relaxed value for > constraint. */
function findRelaxedGtValue(
  products: Product[],
  attributeKey: string,
  currentValue: number
): number | null {
  const valuesAtOrAbove = new Set<number>();
  for (const p of products) {
    const v = extractNumericValue(p.attributes[attributeKey]);
    if (v !== null && v >= currentValue) {
      valuesAtOrAbove.add(v);
    }
  }
  if (valuesAtOrAbove.size === 0) return null;
  return Math.min(...valuesAtOrAbove);
}

/** Find relaxed value for < constraint. */
function findRelaxedLtValue(
  products: Product[],
  attributeKey: string,
  currentValue: number
): number | null {
  const valuesAtOrBelow = new Set<number>();
  for (const p of products) {
    const v = extractNumericValue(p.attributes[attributeKey]);
    if (v !== null && v <= currentValue) {
      valuesAtOrBelow.add(v);
    }
  }
  if (valuesAtOrBelow.size === 0) return null;
  return Math.max(...valuesAtOrBelow);
}

/** Find the nearest budget max relaxation (bounded by percentage). */
function findRelaxedBudgetMax(
  products: Product[],
  currentMax: number
): number | null {
  const maxRelaxation = currentMax * MAX_BUDGET_RELAXATION_PCT;
  const absoluteMax = currentMax + maxRelaxation;

  const pricesAbove = products
    .map((p) => p.price)
    .filter((price) => price > currentMax && price <= absoluteMax);

  if (pricesAbove.length === 0) return null;
  return Math.min(...pricesAbove);
}

/** Find the nearest budget min relaxation. */
function findRelaxedBudgetMin(
  products: Product[],
  currentMin: number
): number | null {
  const pricesBelow = products
    .map((p) => p.price)
    .filter((price) => price < currentMin);
  if (pricesBelow.length === 0) return null;
  return Math.max(...pricesBelow);
}

// --- Impact Assessment ---

/**
 * Determine the impact of relaxing a constraint based on user priorities.
 * Higher priority = higher impact if relaxed.
 */
function assessImpact(
  constraint: Constraint,
  priorities: UserPreference["priorities"],
  categoryAttributes: AttributeConfig[]
): RelaxationImpact {
  // Budget relaxations are generally low-medium impact
  if (constraint.type === "max_price" || constraint.type === "min_price") {
    return "low";
  }

  // Find the priority level for this attribute
  const attrKey = constraint.attributeKey;
  if (!attrKey) return "medium";

  const priority = priorities.find((p) => p.attributeKey === attrKey);
  if (!priority) return "low";

  // Check default importance from category config
  const attrConfig = categoryAttributes.find((a) => a.key === attrKey);
  const baseline = attrConfig?.defaultImportance ?? 2;
  const effective = priority.importance * 1.5 + baseline;

  if (effective >= 6) return "high";
  if (effective >= 4) return "medium";
  return "low";
}

// --- Trade-Off Detection ---

/** Generate trade-off details for a product that doesn't pass all original constraints. */
function generateTradeOffs(
  product: Product,
  preference: UserPreference,
  categoryConfig: CategoryConfig,
  relaxedConstraints: RelaxedConstraint[]
): TradeOffDetail[] {
  const tradeOffs: TradeOffDetail[] = [];

  // Check budget trade-offs
  if (preference.budget?.max !== undefined && product.price > preference.budget.max) {
    const over = product.price - preference.budget.max;
    tradeOffs.push({
      attribute: "budget",
      description: `₹${over.toLocaleString()} above your budget`,
      original: `Under ₹${preference.budget.max.toLocaleString()}`,
      actual: `₹${product.price.toLocaleString()}`,
      impact: "low",
    });
  }

  if (preference.budget?.min !== undefined && product.price < preference.budget.min) {
    const under = preference.budget.min - product.price;
    tradeOffs.push({
      attribute: "budget",
      description: `₹${under.toLocaleString()} below your minimum`,
      original: `Above ₹${preference.budget.min.toLocaleString()}`,
      actual: `₹${product.price.toLocaleString()}`,
      impact: "low",
    });
  }

  // Check constraint trade-offs
  if (preference.constraints) {
    for (const constraint of preference.constraints) {
      if (passesConstraint(product, constraint)) continue;

      const attrLabel =
        categoryConfig.attributes.find((a) => a.key === constraint.attributeKey)
          ?.label ?? humanizeAttrKey(constraint.attributeKey ?? "unknown");

      switch (constraint.type) {
        case "attribute_comparison": {
          const productVal = extractNumericValue(
            product.attributes[constraint.attributeKey!]
          );
          const unit =
            categoryConfig.attributes.find(
              (a) => a.key === constraint.attributeKey
            )?.unit ?? "";

          if (productVal !== null) {
            const relaxed = relaxedConstraints.find(
              (r) => r.attribute === constraint.attributeKey
            );
            tradeOffs.push({
              attribute: constraint.attributeKey!,
              description: `${attrLabel} is ${productVal}${unit ? " " + unit : ""} (requires ${constraint.operator} ${constraint.value}${unit ? " " + unit : ""})`,
              original: `${constraint.operator} ${constraint.value}${unit ? " " + unit : ""}`,
              actual: `${productVal}${unit ? " " + unit : ""}`,
              impact: relaxed?.impact ?? "medium",
            });
          }
          break;
        }
        case "required_attribute":
          tradeOffs.push({
            attribute: constraint.attributeKey!,
            description: `Missing ${attrLabel}`,
            original: "Required",
            actual: "Not available",
            impact: "high",
          });
          break;
        case "exclude_attribute":
          tradeOffs.push({
            attribute: constraint.attributeKey!,
            description: `Has excluded ${attrLabel}`,
            original: `Not ${constraint.value}`,
            actual: `${constraint.value}`,
            impact: "medium",
          });
          break;
      }
    }
  }

  return tradeOffs;
}

// --- Scoring for Alternative Ranking ---

/**
 * Score an alternative product based on how well it balances relaxation impact
 * and original preference alignment. Lower score = better alternative.
 */
function scoreAlternative(
  product: Product,
  tradeOffs: TradeOffDetail[],
  preference: UserPreference,
  categoryConfig: CategoryConfig
): number {
  let score = 0;

  // Penalty for each trade-off based on impact
  for (const tradeOff of tradeOffs) {
    switch (tradeOff.impact) {
      case "high":   score += 10; break;
      case "medium": score += 5; break;
      case "low":    score += 1; break;
    }
  }

  // Bonus for matching high-priority attributes
  for (const priority of preference.priorities) {
    if (priority.importance >= 3) {
      const attrVal = extractNumericValue(product.attributes[priority.attributeKey]);
      if (attrVal !== null) {
        const attrConfig = categoryConfig.attributes.find(
          (a) => a.key === priority.attributeKey
        );
        if (attrConfig) {
          // Higher normalized value = better
          const allVals = categoryConfig.attributes
            .map((a) => extractNumericValue(product.attributes[a.key]))
            .filter((v): v is number => v !== null);
          const min = Math.min(...allVals);
          const max = Math.max(...allVals);
          const range = max - min;
          if (range > 0) {
            const normalized =
              attrConfig.comparisonDirection === "higher_is_better"
                ? (attrVal - min) / range
                : (max - attrVal) / range;
            score -= normalized * 3; // Up to 3 points bonus
          }
        }
      }
    }
  }

  // Bonus for lower price (value)
  const maxBudget = preference.budget?.max ?? Infinity;
  if (product.price <= maxBudget) {
    score -= 2;
  }

  return score;
}

// --- Main Relaxation Engine ---

/**
 * Execute intelligent multi-constraint relaxation.
 *
 * When no product satisfies all user constraints, this engine:
 * 1. Analyzes which constraints are blocking products
 * 2. Tries progressively relaxed constraint combinations
 * 3. Finds the smallest relaxation that preserves the most important requirements
 * 4. Returns alternatives with explicit trade-off explanations
 *
 * This is category-agnostic: behavior is driven entirely by
 * category config, attribute metadata, and user preferences.
 */
export function relaxConstraints(
  products: Product[],
  preference: UserPreference,
  categoryConfig: CategoryConfig
): ConstraintRelaxationResult {
  // 1. Check if any products pass all original constraints
  const exactMatches = products.filter((p) => passesAllOriginal(p, preference));

  if (exactMatches.length > 0) {
    return {
      exactMatchFound: true,
      alternatives: exactMatches.map((p) => ({
        product: p,
        meetsAllOriginal: true,
        tradeOffs: [],
        requiredRelaxations: [],
      })),
      relaxedConstraints: [],
      explanation: "All constraints are satisfied by available products.",
      alternativeCount: exactMatches.length,
    };
  }

  // 2. No exact matches — begin intelligent relaxation

  // 2a. Try budget relaxation first (bounded)
  const budgetAlternatives = tryBudgetRelaxation(products, preference, categoryConfig);

  // 2b. Try individual attribute constraint relaxation
  const attributeAlternatives = tryAttributeRelaxation(
    products,
    preference,
    categoryConfig
  );

  // 2c. Combine and deduplicate alternatives
  const allAlternatives = mergeAlternatives(
    budgetAlternatives,
    attributeAlternatives,
    preference,
    categoryConfig
  );

  // 2d. Sort by best trade-off score (fewest/lowest-impact trade-offs first)
  allAlternatives.sort((a, b) => {
    // Prefer products that meet more original constraints
    const aMetCount = a.requiredRelaxations.length;
    const bMetCount = b.requiredRelaxations.length;
    if (aMetCount !== bMetCount) return aMetCount - bMetCount;

    // Then prefer lower total impact
    const aImpact = a.requiredRelaxations.reduce(
      (sum, r) => sum + (r.impact === "high" ? 3 : r.impact === "medium" ? 2 : 1),
      0
    );
    const bImpact = b.requiredRelaxations.reduce(
      (sum, r) => sum + (r.impact === "high" ? 3 : r.impact === "medium" ? 2 : 1),
      0
    );
    if (aImpact !== bImpact) return aImpact - bImpact;

    // Then prefer lower price
    return a.product.price - b.product.price;
  });

  const topAlternatives = allAlternatives.slice(0, MAX_ALTERNATIVES);

  // 3. Collect all unique relaxed constraints
  const allRelaxedConstraints = collectRelaxedConstraints(topAlternatives);

  // 4. Build explanation
  const explanation = buildExplanation(
    topAlternatives,
    allRelaxedConstraints,
    products.length
  );

  return {
    exactMatchFound: false,
    alternatives: topAlternatives,
    relaxedConstraints: allRelaxedConstraints,
    explanation,
    alternativeCount: topAlternatives.length,
  };
}

// --- Internal Strategy Functions ---

/** Try relaxing the budget constraint within bounded limits. */
function tryBudgetRelaxation(
  products: Product[],
  preference: UserPreference,
  categoryConfig: CategoryConfig
): RelaxedProduct[] {
  const results: RelaxedProduct[] = [];

  if (!preference.budget) return results;

  // Try budget max relaxation
  if (preference.budget.max !== undefined) {
    const relaxedMax = findRelaxedBudgetMax(products, preference.budget.max);
    if (relaxedMax !== null) {
      const relaxedPreference: UserPreference = {
        ...preference,
        budget: { ...preference.budget, max: relaxedMax },
      };

      const matchingProducts = products.filter((p) =>
        passesAllOriginal(p, relaxedPreference)
      );

      for (const product of matchingProducts) {
        const requiredRelaxation: RelaxedConstraint = {
          attribute: "budget",
          originalRequirement: `Under ₹${preference.budget.max!.toLocaleString()}`,
          relaxedRequirement: `Under ₹${relaxedMax.toLocaleString()}`,
          impact: "low",
          reason: `Small budget increase of ₹${(relaxedMax - preference.budget.max!).toLocaleString()} preserves your most important requirements.`,
        };

        const tradeOffs: TradeOffDetail[] = [
          {
            attribute: "budget",
            description: `₹${(product.price - preference.budget.max!).toLocaleString()} above your budget`,
            original: `Under ₹${preference.budget.max!.toLocaleString()}`,
            actual: `₹${product.price.toLocaleString()}`,
            impact: "low",
          },
        ];

        results.push({
          product,
          meetsAllOriginal: false,
          tradeOffs,
          requiredRelaxations: [requiredRelaxation],
        });
      }
    }
  }

  // Try budget min relaxation
  if (preference.budget.min !== undefined) {
    const relaxedMin = findRelaxedBudgetMin(products, preference.budget.min);
    if (relaxedMin !== null) {
      const relaxedPreference: UserPreference = {
        ...preference,
        budget: { ...preference.budget, min: relaxedMin },
      };

      const matchingProducts = products.filter((p) =>
        passesAllOriginal(p, relaxedPreference)
      );

      for (const product of matchingProducts) {
        const requiredRelaxation: RelaxedConstraint = {
          attribute: "budget",
          originalRequirement: `Above ₹${preference.budget.min!.toLocaleString()}`,
          relaxedRequirement: `Above ₹${relaxedMin.toLocaleString()}`,
          impact: "low",
          reason: `Small budget decrease of ₹${(preference.budget.min! - relaxedMin).toLocaleString()} preserves your most important requirements.`,
        };

        const tradeOffs: TradeOffDetail[] = [
          {
            attribute: "budget",
            description: `₹${(preference.budget.min! - product.price).toLocaleString()} below your minimum`,
            original: `Above ₹${preference.budget.min!.toLocaleString()}`,
            actual: `₹${product.price.toLocaleString()}`,
            impact: "low",
          },
        ];

        results.push({
          product,
          meetsAllOriginal: false,
          tradeOffs,
          requiredRelaxations: [requiredRelaxation],
        });
      }
    }
  }

  return results;
}

/** Try relaxing individual attribute constraints. */
function tryAttributeRelaxation(
  products: Product[],
  preference: UserPreference,
  categoryConfig: CategoryConfig
): RelaxedProduct[] {
  const results: RelaxedProduct[] = [];

  if (!preference.constraints) return results;

  for (const constraint of preference.constraints) {
    if (constraint.type !== "attribute_comparison") continue;
    if (!constraint.attributeKey || !constraint.operator) continue;

    const currentValue = extractNumericValue(constraint.value);
    if (currentValue === null) continue;

    let relaxedValue: number | null = null;
    let relaxedOp = constraint.operator;

    switch (constraint.operator) {
      case ">=":
        relaxedValue = findRelaxedGteValue(
          products,
          constraint.attributeKey,
          currentValue
        );
        break;
      case "<=":
        relaxedValue = findRelaxedLteValue(
          products,
          constraint.attributeKey,
          currentValue
        );
        break;
      case ">":
        relaxedValue = findRelaxedGtValue(
          products,
          constraint.attributeKey,
          currentValue
        );
        relaxedOp = ">=";
        break;
      case "<":
        relaxedValue = findRelaxedLtValue(
          products,
          constraint.attributeKey,
          currentValue
        );
        relaxedOp = "<=";
        break;
      default:
        continue; // = and != cannot be relaxed
    }

    if (relaxedValue === null) continue;

    // Build relaxed constraint set
    const relaxedConstraints: Constraint[] = preference.constraints.map((c) => {
      if (
        c.attributeKey === constraint.attributeKey &&
        c.type === "attribute_comparison"
      ) {
        return { ...c, value: relaxedValue, operator: relaxedOp };
      }
      return c;
    });

    const relaxedPreference: UserPreference = {
      ...preference,
      constraints: relaxedConstraints,
    };

    const matchingProducts = products.filter((p) =>
      passesAllOriginal(p, relaxedPreference)
    );

    const attrLabel =
      categoryConfig.attributes.find((a) => a.key === constraint.attributeKey)
        ?.label ?? humanizeAttrKey(constraint.attributeKey);
    const unit =
      categoryConfig.attributes.find((a) => a.key === constraint.attributeKey)
        ?.unit ?? "";

    const impact = assessImpact(constraint, preference.priorities, categoryConfig.attributes);

    for (const product of matchingProducts) {
      const requiredRelaxation: RelaxedConstraint = {
        attribute: constraint.attributeKey,
        originalRequirement: `${constraint.operator} ${currentValue}${unit ? " " + unit : ""}`,
        relaxedRequirement: `${relaxedOp} ${relaxedValue}${unit ? " " + unit : ""}`,
        impact,
        reason: `Relaxing ${attrLabel} from ${constraint.operator} ${currentValue}${unit ? " " + unit : ""} to ${relaxedOp} ${relaxedValue}${unit ? " " + unit : ""} preserves your higher-priority requirements.`,
      };

      const tradeOffs = generateTradeOffs(
        product,
        relaxedPreference,
        categoryConfig,
        [requiredRelaxation]
      );

      results.push({
        product,
        meetsAllOriginal: false,
        tradeOffs,
        requiredRelaxations: [requiredRelaxation],
      });
    }
  }

  return results;
}

/** Merge and deduplicate alternatives from different relaxation strategies. */
function mergeAlternatives(
  budgetAlternatives: RelaxedProduct[],
  attributeAlternatives: RelaxedProduct[],
  preference: UserPreference,
  categoryConfig: CategoryConfig
): RelaxedProduct[] {
  const seen = new Map<string, RelaxedProduct>();

  // Add budget alternatives
  for (const alt of budgetAlternatives) {
    const existing = seen.get(alt.product.id);
    if (!existing || alt.requiredRelaxations.length < existing.requiredRelaxations.length) {
      seen.set(alt.product.id, alt);
    }
  }

  // Add attribute alternatives (may combine with budget relaxation)
  for (const alt of attributeAlternatives) {
    const existing = seen.get(alt.product.id);
    if (!existing) {
      seen.set(alt.product.id, alt);
    } else {
      // Combine relaxations if this alternative has fewer/different ones
      if (alt.requiredRelaxations.length <= existing.requiredRelaxations.length) {
        seen.set(alt.product.id, alt);
      }
    }
  }

  // Re-score all alternatives for consistent ranking
  return Array.from(seen.values()).map((alt) => ({
    ...alt,
    tradeOffs: alt.tradeOffs.length > 0
      ? alt.tradeOffs
      : generateTradeOffs(
          alt.product,
          preference,
          categoryConfig,
          alt.requiredRelaxations
        ),
  }));
}

/** Collect unique relaxed constraints from all alternatives. */
function collectRelaxedConstraints(
  alternatives: RelaxedProduct[]
): RelaxedConstraint[] {
  const seen = new Map<string, RelaxedConstraint>();

  for (const alt of alternatives) {
    for (const relaxation of alt.requiredRelaxations) {
      const key = relaxation.attribute;
      if (!seen.has(key)) {
        seen.set(key, relaxation);
      }
    }
  }

  return Array.from(seen.values());
}

/** Build human-readable explanation of the relaxation results. */
function buildExplanation(
  alternatives: RelaxedProduct[],
  relaxedConstraints: RelaxedConstraint[],
  totalProducts: number
): string {
  if (alternatives.length === 0) {
    return `No alternatives found within bounded relaxation limits. The ${totalProducts} available products require larger trade-offs than permitted.`;
  }

  const count = alternatives.length;
  const constraintCount = relaxedConstraints.length;

  if (constraintCount === 1) {
    const constraint = relaxedConstraints[0];
    return `Found ${count} alternative${count !== 1 ? "s" : ""} by relaxing ${constraint.attribute === "budget" ? "the budget" : "one attribute requirement"}. ${constraint.reason}`;
  }

  return `Found ${count} alternative${count !== 1 ? "s" : ""} by relaxing ${constraintCount} constraint${constraintCount !== 1 ? "s" : ""}. The smallest trade-offs preserve your highest-priority requirements.`;
}

// --- Helpers ---

function humanizeAttrKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
