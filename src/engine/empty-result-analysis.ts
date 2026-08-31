// ============================================================
// DecisionCart — Empty Result Analysis
// Deterministic, category-agnostic analysis for zero-match scenarios.
// Produces explanations, relaxation suggestions, and closest matches.
// ============================================================

import type {
  AttributeConfig,
  CategoryConfig,
  ClosestMatch,
  ComparisonOperator,
  Constraint,
  ConstraintRelaxationSuggestion,
  EmptyResultAnalysis,
  FailedRequirement,
  Product,
  UserPreference,
} from "@/types";

// --- Numeric value extraction (mirrors decision-engine) ---

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

// --- Individual requirement evaluation ---

interface RequirementEvaluation {
  type: "budget" | "constraint";
  attributeKey?: string;
  description: string;
  passingProductIds: string[];
  failingProductIds: string[];
}

/**
 * Evaluate a single budget constraint against all products.
 */
function evaluateBudget(
  products: Product[],
  budget: { min?: number; max?: number }
): RequirementEvaluation {
  const passing: string[] = [];
  const failing: string[] = [];

  for (const p of products) {
    if (passesBudget(p, budget)) {
      passing.push(p.id);
    } else {
      failing.push(p.id);
    }
  }

  const parts: string[] = [];
  if (budget.max !== undefined) parts.push(`Under ₹${budget.max.toLocaleString()}`);
  if (budget.min !== undefined) parts.push(`Above ₹${budget.min.toLocaleString()}`);

  return {
    type: "budget",
    description: parts.join(" and ") || "Budget",
    passingProductIds: passing,
    failingProductIds: failing,
  };
}

function passesBudget(
  product: Product,
  budget: { min?: number; max?: number }
): boolean {
  const price = product.price;
  if (price === null || price === undefined) return true;
  if (budget.max !== undefined && price > budget.max) return false;
  if (budget.min !== undefined && price < budget.min) return false;
  return true;
}

/**
 * Evaluate a single attribute constraint against all products.
 */
function evaluateAttributeConstraint(
  products: Product[],
  constraint: Constraint
): RequirementEvaluation {
  const passing: string[] = [];
  const failing: string[] = [];

  for (const p of products) {
    if (passesSingleConstraint(p, constraint)) {
      passing.push(p.id);
    } else {
      failing.push(p.id);
    }
  }

  const attrKey = constraint.attributeKey ?? "unknown";
  const label = humanizeAttrKey(attrKey);

  let description = "";
  switch (constraint.type) {
    case "required_attribute":
      description = `Must have ${label}`;
      break;
    case "exclude_attribute":
      description = `Must not have ${label} = ${constraint.value}`;
      break;
    case "attribute_comparison":
      description = `${label} ${constraint.operator ?? "?"} ${constraint.value}`;
      break;
    case "max_price":
      description = `Under ₹${(constraint.value as number).toLocaleString()}`;
      break;
    case "min_price":
      description = `Above ₹${(constraint.value as number).toLocaleString()}`;
      break;
    default:
      description = `${constraint.type} constraint`;
  }

  return {
    type: "constraint",
    attributeKey: attrKey,
    description,
    passingProductIds: passing,
    failingProductIds: failing,
  };
}

function passesSingleConstraint(product: Product, constraint: Constraint): boolean {
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
      if (productNum === null || constraintNum === null) return true; // missing = passes
      return compareNumeric(productNum, constraint.operator, constraintNum);
    }
    default:
      return true;
  }
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

// --- Suggestion generation (based on real product data) ---

/**
 * For a `>=` constraint, find the nearest lower real product value that would
 * allow more products through.
 */
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
  // Return the highest value below currentValue (smallest relaxation)
  return Math.max(...valuesBelow);
}

/**
 * For a `<=` constraint, find the nearest higher real product value.
 */
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
  // Return the lowest value above currentValue (smallest relaxation)
  return Math.min(...valuesAbove);
}

/**
 * For a `>` constraint, the relaxed value is the nearest value >= currentValue.
 */
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

/**
 * For a `<` constraint, find the nearest value <= currentValue.
 */
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

/**
 * For budget max, find the lowest product price above current max.
 */
function findRelaxedBudgetMax(
  products: Product[],
  currentMax: number
): number | null {
  const pricesAbove = products
    .map((p) => p.price)
    .filter((price) => price > currentMax);
  if (pricesAbove.length === 0) return null;
  return Math.min(...pricesAbove);
}

/**
 * For budget min, find the highest product price below current min.
 */
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

/**
 * Count how many products would pass if a single requirement were relaxed.
 */
function countPassingWithRelaxation(
  products: Product[],
  evaluations: RequirementEvaluation[],
  skipIndex: number,
  relaxedEval: RequirementEvaluation
): number {
  return products.filter((p) => {
    for (let i = 0; i < evaluations.length; i++) {
      if (i === skipIndex) {
        // Use relaxed evaluation
        if (!relaxedEval.passingProductIds.includes(p.id)) return false;
      } else {
        if (!evaluations[i].passingProductIds.includes(p.id)) return false;
      }
    }
    return true;
  }).length;
}

/**
 * Generate a relaxation suggestion for a budget requirement.
 */
function suggestBudgetRelaxation(
  products: Product[],
  budget: { min?: number; max?: number },
  evaluations: RequirementEvaluation[],
  budgetIndex: number
): ConstraintRelaxationSuggestion | null {
  const suggestions: ConstraintRelaxationSuggestion[] = [];

  if (budget.max !== undefined) {
    const relaxedMax = findRelaxedBudgetMax(products, budget.max);
    if (relaxedMax !== null) {
      const relaxedEval: RequirementEvaluation = {
        type: "budget",
        description: `Under ₹${relaxedMax.toLocaleString()}`,
        passingProductIds: products
          .filter((p) => passesBudget(p, { ...budget, max: relaxedMax }))
          .map((p) => p.id),
        failingProductIds: [],
      };
      const count = countPassingWithRelaxation(
        products, evaluations, budgetIndex, relaxedEval
      );
      if (count > 0) {
        suggestions.push({
          id: "budget-max",
          type: "budget",
          title: `Increase budget to ₹${relaxedMax.toLocaleString()}`,
          explanation: `Increasing your maximum budget from ₹${budget.max.toLocaleString()} to ₹${relaxedMax.toLocaleString()} would make ${count} product${count !== 1 ? "s" : ""} available.`,
          currentValue: budget.max,
          suggestedValue: relaxedMax,
          matchingProductCount: count,
          affectedProductIds: relaxedEval.passingProductIds,
        });
      }
    }
  }

  if (budget.min !== undefined) {
    const relaxedMin = findRelaxedBudgetMin(products, budget.min);
    if (relaxedMin !== null) {
      const relaxedEval: RequirementEvaluation = {
        type: "budget",
        description: `Above ₹${relaxedMin.toLocaleString()}`,
        passingProductIds: products
          .filter((p) => passesBudget(p, { ...budget, min: relaxedMin }))
          .map((p) => p.id),
        failingProductIds: [],
      };
      const count = countPassingWithRelaxation(
        products, evaluations, budgetIndex, relaxedEval
      );
      if (count > 0) {
        suggestions.push({
          id: "budget-min",
          type: "budget",
          title: `Reduce minimum budget to ₹${relaxedMin.toLocaleString()}`,
          explanation: `Lowering your minimum budget from ₹${budget.min.toLocaleString()} to ₹${relaxedMin.toLocaleString()} would make ${count} product${count !== 1 ? "s" : ""} available.`,
          currentValue: budget.min,
          suggestedValue: relaxedMin,
          matchingProductCount: count,
          affectedProductIds: relaxedEval.passingProductIds,
        });
      }
    }
  }

  return suggestions.length > 0 ? suggestions[0] : null;
}

/**
 * Generate a relaxation suggestion for an attribute_comparison constraint.
 */
function suggestAttributeRelaxation(
  products: Product[],
  constraint: Constraint,
  evaluations: RequirementEvaluation[],
  evalIndex: number,
  attributes: AttributeConfig[]
): ConstraintRelaxationSuggestion | null {
  if (!constraint.attributeKey || !constraint.operator) return null;
  if (constraint.type !== "attribute_comparison") return null;

  const currentValue = extractNumericValue(constraint.value);
  if (currentValue === null) return null;

  let relaxedValue: number | null = null;
  let relaxedOp = constraint.operator;

  switch (constraint.operator) {
    case ">=":
      relaxedValue = findRelaxedGteValue(products, constraint.attributeKey, currentValue);
      // Relax to >= instead of >
      break;
    case "<=":
      relaxedValue = findRelaxedLteValue(products, constraint.attributeKey, currentValue);
      break;
    case ">":
      relaxedValue = findRelaxedGtValue(products, constraint.attributeKey, currentValue);
      relaxedOp = ">="; // relax strict > to >=
      break;
    case "<":
      relaxedValue = findRelaxedLtValue(products, constraint.attributeKey, currentValue);
      relaxedOp = "<="; // relax strict < to <=
      break;
    default:
      return null; // = and != cannot be meaningfully relaxed
  }

  if (relaxedValue === null) return null;

  // Build a relaxed constraint and evaluate
  const relaxedConstraint: Constraint = {
    type: "attribute_comparison",
    attributeKey: constraint.attributeKey,
    value: relaxedValue,
    operator: relaxedOp,
  };

  const relaxedPassing = products
    .filter((p) => passesSingleConstraint(p, relaxedConstraint))
    .map((p) => p.id);

  const relaxedEval: RequirementEvaluation = {
    type: "constraint",
    attributeKey: constraint.attributeKey,
    description: `${humanizeAttrKey(constraint.attributeKey)} ${relaxedOp} ${relaxedValue}`,
    passingProductIds: relaxedPassing,
    failingProductIds: [],
  };

  const count = countPassingWithRelaxation(
    products, evaluations, evalIndex, relaxedEval
  );

  if (count === 0) return null;

  const attrLabel =
    attributes.find((a) => a.key === constraint.attributeKey)?.label ??
    humanizeAttrKey(constraint.attributeKey);
  const unit = attributes.find((a) => a.key === constraint.attributeKey)?.unit ?? "";

  return {
    id: `constraint-${constraint.attributeKey}`,
    type: "constraint",
    attributeKey: constraint.attributeKey,
    title: `Reduce ${attrLabel} requirement to ${relaxedValue}${unit ? " " + unit : ""}`,
    explanation: `Relaxing from ${constraint.operator} ${currentValue}${unit ? " " + unit : ""} to ${relaxedOp} ${relaxedValue}${unit ? " " + unit : ""} would make ${count} product${count !== 1 ? "s" : ""} available.`,
    currentValue,
    suggestedValue: relaxedValue,
    operator: relaxedOp,
    matchingProductCount: count,
    affectedProductIds: relaxedPassing,
  };
}

// --- Closest match calculation ---

/**
 * Calculate how close each product is to satisfying all requirements.
 * Products with fewer unmet requirements rank higher.
 * For numeric gaps, include the normalized distance.
 */
function calculateClosestMatches(
  products: Product[],
  preference: UserPreference,
  categoryConfig: CategoryConfig,
  limit: number = 3
): ClosestMatch[] {
  const matches: ClosestMatch[] = [];

  const totalReqs = countRequirements(preference);

  for (const product of products) {
    const unmetDetails: ClosestMatch["unmetDetails"] = [];
    let metCount = 0;

    // Check budget
    if (preference.budget) {
      const budgetPasses = passesBudget(product, preference.budget);
      if (budgetPasses) {
        metCount++;
      } else {
        unmetDetails.push({
          type: "budget",
          description: describeBudgetGap(product, preference.budget),
          gap: calculateBudgetGap(product, preference.budget),
        });
      }
    } else {
      metCount++; // no budget = no budget failure
    }

    // Check constraints
    if (preference.constraints) {
      for (const constraint of preference.constraints) {
        if (passesSingleConstraint(product, constraint)) {
          metCount++;
        } else {
          unmetDetails.push({
            type: "constraint",
            attributeKey: constraint.attributeKey,
            description: describeConstraintGap(product, constraint, categoryConfig),
            gap: calculateConstraintGap(product, constraint),
          });
        }
      }
    }

    // Only include products that meet at least one requirement
    // and have some unmet requirements (otherwise they'd be in results)
    if (unmetDetails.length > 0 && metCount > 0) {
      matches.push({
        product,
        totalRequirements: totalReqs,
        metRequirements: metCount,
        unmetCount: unmetDetails.length,
        unmetDetails,
      });
    }
  }

  // Sort: fewer unmet first, then more met, then lower price
  matches.sort((a, b) => {
    if (a.unmetCount !== b.unmetCount) return a.unmetCount - b.unmetCount;
    if (a.metRequirements !== b.metRequirements)
      return b.metRequirements - a.metRequirements;
    return a.product.price - b.product.price;
  });

  return matches.slice(0, limit);
}

function countRequirements(preference: UserPreference): number {
  let count = 0;
  if (preference.budget?.max !== undefined || preference.budget?.min !== undefined)
    count++;
  if (preference.constraints) {
    count += preference.constraints.length;
  }
  return count;
}

function describeBudgetGap(
  product: Product,
  budget: { min?: number; max?: number }
): string {
  const parts: string[] = [];
  if (budget.max !== undefined && product.price > budget.max) {
    parts.push(`Price ₹${product.price.toLocaleString()} exceeds budget of ₹${budget.max.toLocaleString()}`);
  }
  if (budget.min !== undefined && product.price < budget.min) {
    parts.push(`Price ₹${product.price.toLocaleString()} is below minimum of ₹${budget.min.toLocaleString()}`);
  }
  return parts.join("; ") || "Budget mismatch";
}

function calculateBudgetGap(
  product: Product,
  budget: { min?: number; max?: number }
): number | undefined {
  if (budget.max !== undefined && product.price > budget.max) {
    return product.price - budget.max;
  }
  if (budget.min !== undefined && product.price < budget.min) {
    return budget.min - product.price;
  }
  return undefined;
}

function describeConstraintGap(
  product: Product,
  constraint: Constraint,
  categoryConfig: CategoryConfig
): string {
  const attrLabel =
    categoryConfig.attributes.find((a) => a.key === constraint.attributeKey)?.label ??
    humanizeAttrKey(constraint.attributeKey ?? "unknown");

  switch (constraint.type) {
    case "required_attribute":
      return `Missing ${attrLabel}`;
    case "exclude_attribute":
      return `Has excluded ${attrLabel}`;
    case "attribute_comparison": {
      const productVal = extractNumericValue(
        product.attributes[constraint.attributeKey!]
      );
      if (productVal === null) return `Unknown ${attrLabel}`;
      const unit =
        categoryConfig.attributes.find((a) => a.key === constraint.attributeKey)
          ?.unit ?? "";
      return `${attrLabel} is ${productVal}${unit ? " " + unit : ""} (requires ${constraint.operator} ${constraint.value}${unit ? " " + unit : ""})`;
    }
    case "max_price":
      return `Price ₹${product.price.toLocaleString()} exceeds limit`;
    case "min_price":
      return `Price ₹${product.price.toLocaleString()} below minimum`;
    default:
      return `${attrLabel} requirement not met`;
  }
}

function calculateConstraintGap(
  product: Product,
  constraint: Constraint
): number | undefined {
  if (constraint.type !== "attribute_comparison") return undefined;
  if (!constraint.attributeKey || !constraint.operator) return undefined;

  const productVal = extractNumericValue(
    product.attributes[constraint.attributeKey]
  );
  const constraintVal = extractNumericValue(constraint.value);
  if (productVal === null || constraintVal === null) return undefined;

  switch (constraint.operator) {
    case ">=":
      return constraintVal - productVal; // positive = gap
    case "<=":
      return productVal - constraintVal;
    case ">":
      return constraintVal - productVal + 1;
    case "<":
      return productVal - constraintVal + 1;
    default:
      return undefined;
  }
}

// --- Main analysis function ---

/**
 * Analyze why no products match the user's requirements.
 * Returns structured analysis with failed requirements, suggestions,
 * and closest matches.
 */
export function analyzeEmptyResults(
  products: Product[],
  preference: UserPreference,
  categoryConfig: CategoryConfig
): EmptyResultAnalysis {
  // 1. Evaluate each requirement individually
  const evaluations: RequirementEvaluation[] = [];

  // Budget evaluation
  if (preference.budget) {
    evaluations.push(evaluateBudget(products, preference.budget));
  }

  // Constraint evaluations
  if (preference.constraints) {
    for (const constraint of preference.constraints) {
      evaluations.push(evaluateAttributeConstraint(products, constraint));
    }
  }

  // 2. Build failed requirements list
  const failedRequirements: FailedRequirement[] = evaluations
    .filter((e) => e.failingProductIds.length > 0)
    .sort((a, b) => b.failingProductIds.length - a.failingProductIds.length)
    .map((e) => ({
      type: e.type,
      attributeKey: e.attributeKey,
      description: e.description,
      excludedProductCount: e.failingProductIds.length,
    }));

  // 3. Generate relaxation suggestions
  const suggestions: ConstraintRelaxationSuggestion[] = [];

  // Budget suggestions
  const budgetIndex = evaluations.findIndex((e) => e.type === "budget");
  if (budgetIndex >= 0 && preference.budget) {
    const budgetSuggestion = suggestBudgetRelaxation(
      products,
      preference.budget,
      evaluations,
      budgetIndex
    );
    if (budgetSuggestion) suggestions.push(budgetSuggestion);
  }

  // Attribute constraint suggestions
  for (let i = 0; i < evaluations.length; i++) {
    const eval_ = evaluations[i];
    if (eval_.type !== "constraint") continue;
    if (eval_.failingProductIds.length === 0) continue;

    // Find the original constraint for this evaluation
    const constraint = preference.constraints?.find(
      (c) => c.attributeKey === eval_.attributeKey || c.type === eval_.attributeKey
    );
    if (!constraint) continue;

    const suggestion = suggestAttributeRelaxation(
      products,
      constraint,
      evaluations,
      i,
      categoryConfig.attributes
    );
    if (suggestion) suggestions.push(suggestion);
  }

  // Sort suggestions: budget first, then by most products gained
  suggestions.sort((a, b) => {
    if (a.type === "budget" && b.type !== "budget") return -1;
    if (a.type !== "budget" && b.type === "budget") return 1;
    return b.matchingProductCount - a.matchingProductCount;
  });

  // 5. Calculate closest matches
  const closestMatches = calculateClosestMatches(
    products,
    preference,
    categoryConfig
  );

  // 6. Build reason string
  const fullReason =
    failedRequirements.length > 0
      ? `None of the ${products.length} available products satisfy all ${failedRequirements.length} strict requirement${failedRequirements.length !== 1 ? "s" : ""}.`
      : "No products are available in this category.";

  return {
    hasResults: false,
    reason: fullReason,
    failedRequirements,
    suggestions,
    closestMatches,
  };
}

// --- Helpers ---

function humanizeAttrKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
