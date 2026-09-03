// ============================================================
// DecisionCart — Category-Agnostic Comparison Helpers
// Generates comparison data, insights, and explanations
// using EXISTING decision engine output. No separate scoring.
// ============================================================

import type {
  AttributeConfig,
  PriorityItem,
  ScoreContribution,
  ScoredProduct,
  Product,
} from "@/types";

// --- Types ---

export interface ComparedProduct {
  product: Product;
  score: number;
  rank: number;
  contributions: ScoreContribution[];
  strengths: string[];
  weaknesses: string[];
  missingAttributes: string[];
}

export interface AttributeComparison {
  attributeKey: string;
  label: string;
  unit?: string;
  comparisonDirection: "higher_is_better" | "lower_is_better";
  type: "numeric" | "binary" | "enum";
  values: {
    productId: string;
    productName: string;
    rawValue: number | boolean | string | null;
    normalizedValue: number | null;
    available: boolean;
  }[];
  winnerProductId: string | null;
}

export interface WhyWinnerWins {
  reasons: string[];
}

export interface WhyChooseAlternative {
  reasons: string[];
}

export interface BestForInsight {
  productId: string;
  productName: string;
  insight: string;
  topAttributeLabels: string[];
}

export interface ComparisonResult {
  products: ComparedProduct[];
  attributes: AttributeComparison[];
  winner: ComparedProduct;
  runnerUp: ComparedProduct | null;
  whyWinnerWins: WhyWinnerWins;
  whyChooseAlternatives: Record<string, WhyChooseAlternative>;
  bestForInsights: BestForInsight[];
  decisionInsight: string;
  prioritySensitivity: PrioritySensitivityItem[];
}

export interface PrioritySensitivityItem {
  attributeKey: string;
  attributeLabel: string;
  winnerIfTop: string;
  winnerProductName: string;
}

// --- Main Comparison Function ---

/**
 * Build a complete comparison of top products using existing engine data.
 * Category-agnostic: driven entirely by AttributeConfig.
 */
export function compareTopProducts(
  scoredProducts: ScoredProduct[],
  attributes: AttributeConfig[],
  priorities: PriorityItem[],
  weights: Record<string, number>,
  budget?: { min?: number; max?: number }
): ComparisonResult | null {
  if (!scoredProducts || scoredProducts.length === 0) return null;

  // Take top 2 or 3 (or however many are available)
  const count = Math.min(scoredProducts.length, 3);
  if (count === 0) return null;

  const top = scoredProducts.slice(0, count);

  const products: ComparedProduct[] = top.map((sp) => ({
    product: sp.product,
    score: sp.totalScore,
    rank: sp.rank,
    contributions: sp.contributions,
    strengths: sp.strengths,
    weaknesses: sp.weaknesses,
    missingAttributes: sp.missingAttributes,
  }));

  const winner = products[0];
  const runnerUp = count >= 2 ? products[1] : null;

  // Build attribute comparisons
  const attrComparisons = buildAttributeComparisons(top, attributes);

  // Generate explanations
  const whyWinnerWins = generateWhyWinnerWins(
    winner,
    runnerUp,
    attrComparisons,
    priorities,
    budget
  );

  const whyChooseAlternatives: Record<string, WhyChooseAlternative> = {};
  for (let i = 1; i < products.length; i++) {
    const alt = products[i];
    whyChooseAlternatives[alt.product.id] = generateWhyChooseAlternative(
      alt,
      winner,
      attrComparisons,
      priorities
    );
  }

  // Best For insights
  const bestForInsights = generateBestForInsights(
    products,
    attrComparisons,
    priorities,
  );

  // Decision insight
  const decisionInsight = generateDecisionInsight(
    winner,
    runnerUp,
    attrComparisons,
    priorities,
  );

  // Priority sensitivity
  const prioritySensitivity = generatePrioritySensitivity(
    scoredProducts,
    attributes,
  );

  return {
    products,
    attributes: attrComparisons,
    winner,
    runnerUp,
    whyWinnerWins,
    whyChooseAlternatives,
    bestForInsights,
    decisionInsight,
    prioritySensitivity,
  };
}

// --- Attribute Comparison ---

function buildAttributeComparisons(
  scoredProducts: ScoredProduct[],
  attributes: AttributeConfig[]
): AttributeComparison[] {
  return attributes.map((attr) => {
    const values = scoredProducts.map((sp) => {
      const contrib = sp.contributions.find(
        (c) => c.attributeKey === attr.key
      );
      return {
        productId: sp.product.id,
        productName: sp.product.name,
        rawValue: contrib?.rawValue ?? null,
        normalizedValue: contrib?.normalizedValue ?? null,
        available: contrib?.available ?? false,
      };
    });

    // Determine winner for this attribute
    const availableValues = values.filter((v) => v.available && v.normalizedValue !== null);
    let winnerProductId: string | null = null;

    if (availableValues.length > 0) {
      if (attr.comparisonDirection === "higher_is_better") {
        winnerProductId =
          availableValues.reduce((best, v) =>
            (v.normalizedValue ?? -1) > (best.normalizedValue ?? -1) ? v : best
          ).productId;
      } else {
        // lower_is_better
        winnerProductId =
          availableValues.reduce((best, v) =>
            (v.normalizedValue ?? 2) < (best.normalizedValue ?? 2) ? v : best
          ).productId;
      }
    }

    return {
      attributeKey: attr.key,
      label: attr.label,
      unit: attr.unit,
      comparisonDirection: attr.comparisonDirection,
      type: attr.type,
      values,
      winnerProductId,
    };
  });
}

// --- Why Winner Wins ---

function generateWhyWinnerWins(
  winner: ComparedProduct,
  runnerUp: ComparedProduct | null,
  attrComparisons: AttributeComparison[],
  priorities: PriorityItem[],
  budget?: { min?: number; max?: number }
): WhyWinnerWins {
  const reasons: string[] = [];
  const highPriorityKeys = priorities
    .filter((p) => p.importance >= 3)
    .map((p) => p.attributeKey);

  // Reason 1: Top contributing attributes
  const topContribs = [...winner.contributions]
    .filter((c) => c.available && c.weight > 0 && c.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 2);

  if (topContribs.length > 0) {
    const topLabel = topContribs[0].label;
    const isHighPriority = highPriorityKeys.includes(topContribs[0].attributeKey);
    if (isHighPriority) {
      reasons.push(`${topLabel} strongly matches your highest priority`);
    } else {
      reasons.push(`Strong performance in ${topLabel.toLowerCase()}`);
    }
  }

  // Reason 2: Wins on high-priority attributes
  const highPriWins = attrComparisons.filter(
    (ac) =>
      highPriorityKeys.includes(ac.attributeKey) &&
      ac.winnerProductId === winner.product.id
  );
  if (highPriWins.length > 0) {
    const labels = highPriWins.map((ac) => ac.label).slice(0, 2);
    reasons.push(
      `Best performance on your priorities: ${labels.join(", ")}`
    );
  }

  // Reason 3: Budget fit
  if (budget?.max && winner.product.price <= budget.max) {
    reasons.push(
      `Fits within your ₹${budget.max.toLocaleString()} budget at ₹${winner.product.price.toLocaleString()}`
    );
  }

  // Reason 4: Overall score margin
  if (runnerUp) {
    const margin = winner.score - runnerUp.score;
    if (margin > 10) {
      reasons.push(
        `Clear lead with ${margin.toFixed(1)} points ahead of the next option`
      );
    }
  }

  return { reasons: reasons.slice(0, 3) };
}

// --- Why Choose Alternative ---

function generateWhyChooseAlternative(
  alternative: ComparedProduct,
  winner: ComparedProduct,
  attrComparisons: AttributeComparison[],
  priorities: PriorityItem[]
): WhyChooseAlternative {
  const reasons: string[] = [];
  const priorityMap = new Map(priorities.map((p) => [p.attributeKey, p.importance]));

  // Find attributes where alternative beats the winner
  const altWins = attrComparisons.filter((ac) => {
    if (ac.winnerProductId !== alternative.product.id) return false;
    if (ac.winnerProductId === winner.product.id) return false;
    return true;
  });

  // Prioritize high-priority attributes where alt wins
  const highPriAltWins = altWins.filter((ac) => {
    const imp = priorityMap.get(ac.attributeKey) ?? 1;
    return imp >= 3;
  });

  const medPriAltWins = altWins.filter((ac) => {
    const imp = priorityMap.get(ac.attributeKey) ?? 1;
    return imp === 2;
  });

  // Add high-priority wins first
  for (const ac of highPriAltWins.slice(0, 2)) {
    reasons.push(`Better ${ac.label.toLowerCase()}`);
  }

  // Add medium-priority wins
  for (const ac of medPriAltWins.slice(0, 2)) {
    if (reasons.length >= 3) break;
    reasons.push(`Better ${ac.label.toLowerCase()}`);
  }

  // Add price advantage
  if (alternative.product.price < winner.product.price) {
    const savings = winner.product.price - alternative.product.price;
    if (reasons.length < 3) {
      reasons.push(
        `Lower price (₹${savings.toLocaleString()} less)`
      );
    }
  }

  // If alt has higher normalized value on any non-winning attribute
  if (reasons.length === 0) {
    // Fallback: check if alt has any notable strengths
    const altStrengths = alternative.strengths.filter(
      (s) => !winner.strengths.includes(s)
    );
    for (const s of altStrengths.slice(0, 2)) {
      reasons.push(`Stronger ${s.toLowerCase()}`);
    }
  }

  return { reasons: reasons.slice(0, 3) };
}

// --- Best For Insights ---

function generateBestForInsights(
  products: ComparedProduct[],
  _attrComparisons: AttributeComparison[],
  priorities: PriorityItem[],
): BestForInsight[] {
  const priorityMap = new Map(priorities.map((p) => [p.attributeKey, p.importance]));

  return products.map((sp) => {
    // Find the strongest attributes for this product
    const strongAttrs = [...sp.contributions]
      .filter((c) => c.available && c.normalizedValue > 0.5 && c.weight > 0)
      .sort((a, b) => b.normalizedValue - a.normalizedValue)
      .slice(0, 2);

    const topLabels = strongAttrs.map((c) => c.label);

    // Generate insight from top attributes and priorities
    const highPriAttrs = strongAttrs.filter((c) => {
      const imp = priorityMap.get(c.attributeKey) ?? 1;
      return imp >= 3;
    });

    let insight: string;
    if (highPriAttrs.length > 0) {
      const labels = highPriAttrs.map((c) => c.label.toLowerCase()).join(" and ");
      insight = `Strong ${labels} performance`;
    } else if (topLabels.length > 0) {
      insight = `Excels in ${topLabels.join(" and ").toLowerCase()}`;
    } else {
      insight = `Balanced overall performance`;
    }

    return {
      productId: sp.product.id,
      productName: sp.product.name,
      insight,
      topAttributeLabels: topLabels,
    };
  });
}

// --- Decision Insight ---

function generateDecisionInsight(
  winner: ComparedProduct,
  runnerUp: ComparedProduct | null,
  attrComparisons: AttributeComparison[],
  priorities: PriorityItem[],
): string {
  const priorityMap = new Map(priorities.map((p) => [p.attributeKey, p.importance]));
  const highPriorityAttrs = priorities
    .filter((p) => p.importance >= 3)
    .map((p) => p.attributeKey);

  // Why winner wins
  const winnerTopContrib = [...winner.contributions]
    .filter((c) => c.available && c.weight > 0)
    .sort((a, b) => b.contribution - a.contribution)[0];

  let insight = "";

  if (winnerTopContrib && highPriorityAttrs.includes(winnerTopContrib.attributeKey)) {
    insight += `The ${winner.product.name} wins because ${winnerTopContrib.label} was your strongest priority.`;
  } else if (winnerTopContrib) {
    insight += `The ${winner.product.name} wins with strong overall performance, particularly in ${winnerTopContrib.label.toLowerCase()}.`;
  } else {
    insight += `The ${winner.product.name} wins with the strongest overall score.`;
  }

  // Trade-off with runner-up
  if (runnerUp) {
    const altWins = attrComparisons.filter(
      (ac) =>
        ac.winnerProductId === runnerUp.product.id &&
        ac.winnerProductId !== winner.product.id
    );

    if (altWins.length > 0) {
      const altLabels = altWins
        .filter((ac) => {
          const imp = priorityMap.get(ac.attributeKey) ?? 1;
          return imp >= 2;
        })
        .map((ac) => ac.label.toLowerCase())
        .slice(0, 2);

      if (altLabels.length > 0) {
        insight += ` However, the ${runnerUp.product.name} may be a better choice if ${altLabels.join(" and ")} matter more to you.`;
      }
    }
  }

  return insight;
}

// --- Priority Sensitivity ---

function generatePrioritySensitivity(
  scoredProducts: ScoredProduct[],
  attributes: AttributeConfig[],
): PrioritySensitivityItem[] {
  // For each attribute, compute what happens if it becomes the sole top priority
  const items: PrioritySensitivityItem[] = [];

  for (const attr of attributes) {
    // We use the existing data to approximate: the product with the best
    // normalized value for this attribute will likely win if it's the sole top priority
    const attrComps = scoredProducts
      .map((sp) => {
        const contrib = sp.contributions.find(
          (c) => c.attributeKey === attr.key
        );
        return {
          productId: sp.product.id,
          productName: sp.product.name,
          normalized: contrib?.normalizedValue ?? 0,
          available: contrib?.available ?? false,
        };
      })
      .filter((v) => v.available);

    if (attrComps.length === 0) continue;

    // Winner = best normalized value for this attribute
    const best =
      attr.comparisonDirection === "higher_is_better"
        ? attrComps.reduce((a, b) => (a.normalized > b.normalized ? a : b))
        : attrComps.reduce((a, b) => (a.normalized < b.normalized ? a : b));

    // Skip if current winner already wins this
    if (scoredProducts.length > 0 && best.productId === scoredProducts[0].product.id) {
      continue;
    }

    items.push({
      attributeKey: attr.key,
      attributeLabel: attr.label,
      winnerIfTop: best.productId,
      winnerProductName: best.productName,
    });
  }

  return items;
}
