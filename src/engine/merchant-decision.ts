// ============================================================
// DecisionCart — Merchant Decision Intelligence Engine
// Deterministic scoring and ranking of merchant offers.
// No AI inference. No external calls. Fully reproducible.
//
// This engine answers: "Which MERCHANT OFFER is best for
// a selected product, given the user's priorities?"
//
// The product decision engine answers "which product is best?"
// This engine answers "which offer for that product is best?"
// ============================================================

import type {
  Merchant,
  MerchantOffer,
  MerchantOfferScore,
  MerchantSelection,
  PriorityItem,
} from "@/types";

// --- Merchant Scoring Dimensions ---

/**
 * Internal dimension definition for merchant scoring.
 * Follows the same pattern as CategoryConfig attributes.
 */
interface MerchantDimension {
  key: string;
  label: string;
  type: "numeric" | "binary";
  comparisonDirection: "higher_is_better" | "lower_is_better";
}

const MERCHANT_DIMENSIONS: MerchantDimension[] = [
  {
    key: "price",
    label: "Price",
    type: "numeric",
    comparisonDirection: "lower_is_better",
  },
  {
    key: "trust",
    label: "Trust",
    type: "numeric",
    comparisonDirection: "higher_is_better",
  },
  {
    key: "stock",
    label: "Availability",
    type: "numeric",
    comparisonDirection: "higher_is_better",
  },
  {
    key: "warranty",
    label: "Warranty",
    type: "numeric",
    comparisonDirection: "higher_is_better",
  },
  {
    key: "delivery",
    label: "Delivery Speed",
    type: "numeric",
    comparisonDirection: "lower_is_better",
  },
];

// --- Priority-to-Dimension Mapping ---

/**
 * Maps existing user priority attribute keys to merchant scoring dimensions.
 * Multiple priority keys can map to the same merchant dimension.
 *
 * This is the bridge between the product-scoring priority system and
 * the merchant-scoring dimension system. No new preference types needed.
 */
const PRIORITY_TO_MERCHANT_DIMENSION: Record<string, string> = {
  // Price / budget → price dimension
  budget: "price",
  price: "price",
  value: "price",
  cost: "price",
  affordability: "price",
  // Reliability / trust → trust dimension
  reliability: "trust",
  trust: "trust",
  safety: "trust",
  "brand_reputation": "trust",
  // Warranty / protection → warranty dimension
  warranty: "warranty",
  protection: "warranty",
  "return_policy": "warranty",
  // Delivery / speed → delivery dimension
  delivery: "delivery",
  convenience: "delivery",
  speed: "delivery",
  "fulfillment_speed": "delivery",
  // Availability → stock dimension
  stock: "stock",
  availability: "stock",
  "in_stock": "stock",
};

// --- Default Weights ---

/** Fallback importance when no user priority maps to a merchant dimension. */
const FALLBACK_DIMENSION_IMPORTANCE = 2;

/** Boost multiplier for explicitly prioritized dimensions. */
const DIMENSION_PRIORITY_BOOST = 1.5;

// --- Weight Calculation ---

/**
 * Convert user PriorityItems into merchant dimension weights.
 *
 * Uses the same weighted approach as the product decision engine:
 * - Explicitly prioritized dimensions get boosted importance.
 * - Unmapped dimensions use baseline importance.
 * - Final weights are normalized to sum to 1.0.
 *
 * This is category-agnostic: the mapping is fixed, but the
 * weights are driven by user priorities.
 */
export function calculateMerchantWeights(
  priorities: PriorityItem[]
): Record<string, number> {
  // Step 1: Map user priorities to merchant dimensions
  const dimensionImportances: Record<string, number> = {};

  for (const dim of MERCHANT_DIMENSIONS) {
    dimensionImportances[dim.key] = FALLBACK_DIMENSION_IMPORTANCE;
  }

  // Apply explicit user priorities
  for (const priority of priorities) {
    const dimension = PRIORITY_TO_MERCHANT_DIMENSION[priority.attributeKey];
    if (dimension) {
      // User explicitly requested this dimension — boost on top of baseline
      dimensionImportances[dimension] =
        priority.importance * DIMENSION_PRIORITY_BOOST +
        FALLBACK_DIMENSION_IMPORTANCE;
    }
  }

  // Step 2: Sort by importance descending for exponential decay
  const sorted = MERCHANT_DIMENSIONS.map((d) => ({
    key: d.key,
    importance: dimensionImportances[d.key],
  })).sort((a, b) => b.importance - a.importance);

  // Step 3: Exponential decay (same as product engine)
  const base = 0.5;
  let rawSum = 0;
  const rawWeights: number[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const raw = Math.pow(base, i) * sorted[i].importance;
    rawWeights.push(raw);
    rawSum += raw;
  }

  // Step 4: Normalize to sum to 1.0
  const weights: Record<string, number> = {};
  for (let i = 0; i < sorted.length; i++) {
    weights[sorted[i].key] = rawSum > 0 ? rawWeights[i] / rawSum : 0;
  }

  return weights;
}

// --- Score a Single Offer ---

/**
 * Calculate raw dimension scores (0–100) for a merchant offer.
 *
 * Price: lower is better → normalized so cheapest gets 100.
 * Trust: direct trust score from merchant (already 0–100).
 * Stock: log scale — high stock is good, very low stock is penalized.
 * Warranty: linear mapping (0 months → 0, 36 months → 100).
 * Delivery: lower days is better → normalized so fastest gets 100.
 */
export function calculateDimensionScores(
  offer: MerchantOffer,
  merchant: Merchant,
  priceRange: { min: number; max: number }
): Record<string, number> {
  const scores: Record<string, number> = {};

  // --- Price: lower is better (0–100) ---
  if (priceRange.max === priceRange.min) {
    scores.price = 100; // All same price → full score
  } else {
    // Cheapest = 100, most expensive = 0
    scores.price =
      ((priceRange.max - offer.price) / (priceRange.max - priceRange.min)) *
      100;
  }

  // --- Trust: use merchant trust score directly (0–100) ---
  scores.trust = merchant.trustScore;

  // --- Stock: availability confidence (0–100) ---
  if (offer.stock <= 0) {
    scores.stock = 0;
  } else if (offer.stock >= 50) {
    scores.stock = 100;
  } else {
    // Log-like scaling: rapid gain up to ~20 units, then gradual
    scores.stock = Math.min(100, (offer.stock / 50) * 100);
  }

  // --- Warranty: linear mapping (0–100) ---
  // 0 months → 0, 36 months → 100
  scores.warranty = Math.min(100, (offer.warrantyMonths / 36) * 100);

  // --- Delivery: lower is better (0–100) ---
  // 1 day → 100, 7+ days → ~0
  const MAX_DELIVERY_DAYS = 7;
  if (offer.deliveryDays <= 1) {
    scores.delivery = 100;
  } else {
    scores.delivery =
      Math.max(
        0,
        ((MAX_DELIVERY_DAYS - offer.deliveryDays) / (MAX_DELIVERY_DAYS - 1)) *
          100
      );
  }

  return scores;
}

/**
 * Score a single merchant offer using weighted dimension scores.
 *
 * Returns a complete MerchantOfferScore with transparent
 * scoring data and trade-off highlights.
 */
export function scoreMerchantOffer(
  offer: MerchantOffer,
  merchant: Merchant,
  weights: Record<string, number>,
  priceRange: { min: number; max: number }
): MerchantOfferScore {
  const dimensions = calculateDimensionScores(offer, merchant, priceRange);

  // Weighted sum
  let totalContribution = 0;
  let maxContribution = 0;
  let maxDimension = "trust";
  const dimensionContributions: Record<string, number> = {};

  for (const dim of MERCHANT_DIMENSIONS) {
    const contribution = dimensions[dim.key] * (weights[dim.key] ?? 0);
    dimensionContributions[dim.key] = contribution;
    totalContribution += contribution;

    if (contribution > maxContribution) {
      maxContribution = contribution;
      maxDimension = dim.key;
    }
  }

  // Weights already sum to 1.0, so totalContribution is already 0–100 range
  const overallScore = Math.round(totalContribution * 100) / 100;

  // Determine trade-off highlight
  const tradeOffHighlight = buildTradeOffHighlight(
    offer,
    merchant,
    dimensions,
    maxDimension
  );

  return {
    offerId: offer.id,
    merchantId: offer.merchantId,
    overallScore,
    priceScore: Math.round(dimensions.price),
    trustScore: Math.round(dimensions.trust),
    stockScore: Math.round(dimensions.stock),
    warrantyScore: Math.round(dimensions.warranty),
    deliveryScore: Math.round(dimensions.delivery),
    tradeOffHighlight,
  };
}

// --- Trade-Off Highlight ---

/**
 * Build a human-readable trade-off highlight for an offer.
 * Identifies the strongest advantage and main risk.
 */
function buildTradeOffHighlight(
  offer: MerchantOffer,
  merchant: Merchant,
  dimensions: Record<string, number>,
  topDimension: string
): string {
  const highlights: string[] = [];

  if (topDimension === "price") {
    highlights.push(`${merchant.name} offers the best price`);
  } else if (topDimension === "trust") {
    highlights.push(`${merchant.name} has the highest trust score`);
  } else if (topDimension === "warranty") {
    highlights.push(`${merchant.name} provides the strongest warranty`);
  } else if (topDimension === "delivery") {
    highlights.push(`${merchant.name} offers the fastest delivery`);
  } else if (topDimension === "stock") {
    highlights.push(`${merchant.name} has the best availability`);
  }

  // Add risk factors
  if (offer.stock <= 3 && offer.stock > 0) {
    highlights.push(`limited stock (${offer.stock} units)`);
  } else if (offer.stock <= 0) {
    highlights.push("out of stock");
  }

  if (dimensions.trust < 80) {
    highlights.push("lower trust score");
  }

  return highlights.join(", ");
}

// --- Filter Eligible Offers ---

/**
 * Filter out unavailable and out-of-stock offers.
 * Also handles offers with missing merchant records.
 *
 * Returns only offers that are both available AND have stock > 0
 * AND have a corresponding merchant record.
 */
export function filterEligibleOffers(
  offers: MerchantOffer[],
  merchantMap: Map<string, Merchant>
): MerchantOffer[] {
  return offers.filter(
    (offer) =>
      offer.isAvailable &&
      offer.stock > 0 &&
      offer.price > 0 &&
      merchantMap.has(offer.merchantId)
  );
}

// --- Explanation Generation ---

/**
 * Generate a deterministic explanation for a merchant selection.
 * Explains why the winner was chosen and how alternatives compare.
 */
function generateExplanation(
  winnerScore: MerchantOfferScore,
  winnerOffer: MerchantOffer,
  winnerMerchant: Merchant,
  alternatives: Array<{
    offer: MerchantOffer;
    merchant: Merchant;
    score: MerchantOfferScore;
  }>,
  weights: Record<string, number>,
  topDimension: string
): string {
  const parts: string[] = [];

  // Sentence 1: Why the winner wins
  const winnerAdvantage = getWinnerAdvantageDescription(
    topDimension,
    winnerOffer,
    winnerMerchant
  );
  parts.push(`${winnerMerchant.name} ${winnerAdvantage}.`);

  // Sentence 2: Compare with runner-up if available
  if (alternatives.length > 0) {
    const runnerUp = alternatives[0];
    const runnerUploses = getRunnerUpWeaknesses(
      topDimension,
      winnerOffer,
      runnerUp.offer,
      winnerMerchant,
      runnerUp.merchant
    );

    if (runnerUploses) {
      parts.push(
        `${runnerUp.merchant.name} ${runnerUploses} but ${getRunnerUpStrengths(
          runnerUp.score,
          runnerUp.merchant
        )}.`
      );
    } else {
      parts.push(
        `${runnerUp.merchant.name} ${getRunnerUpStrengths(
          runnerUp.score,
          runnerUp.merchant
        )}.`
      );
    }
  }

  // Sentence 3: Summary if multiple alternatives
  if (alternatives.length > 1) {
    const lowestPrice = Math.min(
      ...alternatives.map((a) => a.offer.price)
    );
    const highestTrust = Math.max(
      ...alternatives.map((a) => a.merchant.trustScore)
    );

    if (lowestPrice < winnerOffer.price) {
      const cheaperAlt = alternatives.find(
        (a) => a.offer.price === lowestPrice
      );
      if (cheaperAlt) {
        parts.push(
          `Note: ${cheaperAlt.merchant.name} is available at a lower price if cost is the primary concern.`
        );
      }
    }

    if (highestTrust > winnerMerchant.trustScore) {
      const trustedAlt = alternatives.find(
        (a) => a.merchant.trustScore === highestTrust
      );
      if (trustedAlt) {
        parts.push(
          `Note: ${trustedAlt.merchant.name} has a higher trust score if reliability matters most.`
        );
      }
    }
  }

  return parts.join(" ");
}

function getWinnerAdvantageDescription(
  topDimension: string,
  offer: MerchantOffer,
  merchant: Merchant
): string {
  switch (topDimension) {
    case "price":
      return `offers the best price at ₹${offer.price.toLocaleString()}`;
    case "trust":
      return `has the highest trust score (${merchant.trustScore}/100)`;
    case "warranty":
      return `provides ${offer.warrantyMonths} months of warranty coverage`;
    case "delivery":
      return `offers delivery in just ${offer.deliveryDays} day${offer.deliveryDays !== 1 ? "s" : ""}`;
    case "stock":
      return `has ${offer.stock} units available`;
    default:
      return "is the best overall choice";
  }
}

function getRunnerUpWeaknesses(
  winnerDimension: string,
  winnerOffer: MerchantOffer,
  runnerUpOffer: MerchantOffer,
  winnerMerchant: Merchant,
  runnerUpMerchant: Merchant
): string {
  const weaknesses: string[] = [];

  if (winnerDimension === "price" && runnerUpOffer.price > winnerOffer.price) {
    weaknesses.push(
      `costs ₹${(runnerUpOffer.price - winnerOffer.price).toLocaleString()} more`
    );
  }

  if (
    winnerDimension === "trust" &&
    runnerUpMerchant.trustScore < winnerMerchant.trustScore
  ) {
    weaknesses.push(
      `has a lower trust score (${runnerUpMerchant.trustScore} vs ${winnerMerchant.trustScore})`
    );
  }

  if (
    winnerDimension === "warranty" &&
    runnerUpOffer.warrantyMonths < winnerOffer.warrantyMonths
  ) {
    weaknesses.push(
      `offers less warranty (${runnerUpOffer.warrantyMonths} months vs ${winnerOffer.warrantyMonths})`
    );
  }

  if (
    winnerDimension === "delivery" &&
    runnerUpOffer.deliveryDays > winnerOffer.deliveryDays
  ) {
    weaknesses.push(
      `takes longer to deliver (${runnerUpOffer.deliveryDays} days vs ${winnerOffer.deliveryDays})`
    );
  }

  if (
    winnerDimension === "stock" &&
    runnerUpOffer.stock < winnerOffer.stock
  ) {
    weaknesses.push(`has lower availability`);
  }

  return weaknesses.join(" but ");
}

function getRunnerUpStrengths(
  score: MerchantOfferScore,
  merchant: Merchant
): string {
  const strengths: string[] = [];

  if (score.trustScore >= 90) {
    strengths.push(`high trust (${merchant.trustScore}/100)`);
  }

  if (score.warrantyScore >= 60) {
    strengths.push("good warranty coverage");
  }

  if (score.deliveryScore >= 70) {
    strengths.push("fast delivery");
  }

  if (score.stockScore >= 80) {
    strengths.push("strong availability");
  }

  if (strengths.length === 0) {
    strengths.push("balanced overall performance");
  }

  return "provides " + strengths.join(", ");
}

// --- Main Decision Function ---

/**
 * Input for the merchant decision engine.
 */
export interface MerchantDecisionInput {
  /** The product being purchased (for price context). */
  productId: string;
  /** Base catalog price of the product. */
  productPrice: number;
  /** Available merchant offers for this product. */
  offers: MerchantOffer[];
  /** All merchants (used to resolve merchant details). */
  merchants: Merchant[];
  /** User priorities from the existing preference system. */
  priorities: PriorityItem[];
}

/**
 * Run the deterministic merchant decision engine.
 *
 * Scores all eligible merchant offers, selects the best one,
 * and returns a MerchantSelection with explanation and alternatives.
 *
 * The winner changes based on user priorities:
 * - Price-sensitive → cheapest valid offer wins
 * - Reliability-sensitive → highest-trust offer wins
 * - Warranty-sensitive → best warranty offer wins
 *
 * @returns MerchantSelection with the recommended offer
 */
export function runMerchantDecision(
  input: MerchantDecisionInput
): MerchantSelection | null {
  const { productId, offers, merchants, priorities } = input;

  // 1. Build merchant lookup map
  const merchantMap = new Map<string, Merchant>(
    merchants.map((m) => [m.id, m])
  );

  // 2. Filter eligible offers (available + in-stock + has merchant)
  const eligible = filterEligibleOffers(
    offers.filter((o) => o.productId === productId),
    merchantMap
  );

  if (eligible.length === 0) {
    // No eligible offers — return null to indicate no selection possible
    return null;
  }

  // 3. Calculate price range for normalization
  const prices = eligible.map((o) => o.price);
  const priceRange = {
    min: Math.min(...prices),
    max: Math.max(...prices),
  };

  // 4. Calculate merchant weights from user priorities
  const weights = calculateMerchantWeights(priorities);

  // 5. Determine top priority dimension
  let topDimension = "trust";
  let topWeight = 0;
  for (const dim of MERCHANT_DIMENSIONS) {
    if ((weights[dim.key] ?? 0) > topWeight) {
      topWeight = weights[dim.key] ?? 0;
      topDimension = dim.key;
    }
  }

  // 6. Score all eligible offers
  const scored: Array<{
    offer: MerchantOffer;
    merchant: Merchant;
    score: MerchantOfferScore;
  }> = [];

  for (const offer of eligible) {
    const merchant = merchantMap.get(offer.merchantId);
    if (!merchant) continue; // Should not happen after filtering, but safe

    const score = scoreMerchantOffer(offer, merchant, weights, priceRange);
    scored.push({ offer, merchant, score });
  }

  if (scored.length === 0) {
    return null;
  }

  // 7. Sort by overallScore descending, tie-break by offer ID for determinism
  scored.sort((a, b) => {
    if (b.score.overallScore !== a.score.overallScore) {
      return b.score.overallScore - a.score.overallScore;
    }
    // Deterministic tie-break: lower price first, then alphabetical ID
    if (a.offer.price !== b.offer.price) {
      return a.offer.price - b.offer.price;
    }
    return a.offer.id.localeCompare(b.offer.id);
  });

  // 8. Select winner and alternatives
  const winner = scored[0];
  const alternatives = scored.slice(1);

  // 9. Generate explanation
  const explanation = generateExplanation(
    winner.score,
    winner.offer,
    winner.merchant,
    alternatives,
    weights,
    topDimension
  );

  // 10. Build MerchantSelection
  return {
    selectedOffer: winner.offer,
    merchant: winner.merchant,
    explanation,
    alternativeOffers: alternatives.map((a) => a.offer),
  };
}

/**
 * Get all scored offers for a product (for debugging and UI display).
 * Returns offers sorted by overall score descending.
 */
export function scoreAllMerchantOffers(
  productId: string,
  offers: MerchantOffer[],
  merchants: Merchant[],
  priorities: PriorityItem[]
): MerchantOfferScore[] {
  const merchantMap = new Map<string, Merchant>(
    merchants.map((m) => [m.id, m])
  );

  const eligible = filterEligibleOffers(
    offers.filter((o) => o.productId === productId),
    merchantMap
  );

  if (eligible.length === 0) return [];

  const prices = eligible.map((o) => o.price);
  const priceRange = {
    min: Math.min(...prices),
    max: Math.max(...prices),
  };

  const weights = calculateMerchantWeights(priorities);

  const scored: MerchantOfferScore[] = [];
  for (const offer of eligible) {
    const merchant = merchantMap.get(offer.merchantId);
    if (!merchant) continue;
    scored.push(scoreMerchantOffer(offer, merchant, weights, priceRange));
  }

  scored.sort((a, b) => b.overallScore - a.overallScore);
  return scored;
}
