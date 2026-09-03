// ============================================================
// DecisionCart — Domain Models
// Category-agnostic types for the decision intelligence platform.
// ============================================================

// --- Category Configuration ---

export interface AttributeConfig {
  key: string;
  label: string;
  type: "numeric" | "binary" | "enum";
  unit?: string;
  comparisonDirection: "higher_is_better" | "lower_is_better";
  description: string;
  /** Baseline importance for this attribute within the category (1–3). */
  defaultImportance?: number;
}

export interface CategoryConfig {
  category: string;
  label: string;
  attributes: AttributeConfig[];
}

// --- Product ---

export type DataConfidence = "high" | "medium" | "low" | "unknown";

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  imageUrl?: string;
  attributes: Record<string, number | boolean | string | null>;
  confidence: Record<string, DataConfidence>;
  evidence?: Record<string, string>;
}

// --- User Preferences ---

export interface PriorityItem {
  attributeKey: string;
  importance: number; // 1 = low, 2 = medium, 3 = high
}

export type ComparisonOperator = ">=" | "<=" | ">" | "<" | "=" | "!=";

export interface Constraint {
  type: "max_price" | "min_price" | "required_attribute" | "exclude_attribute" | "attribute_comparison";
  attributeKey?: string;
  value?: number | boolean | string;
  /** Operator for attribute_comparison constraints. */
  operator?: ComparisonOperator;
}

export interface UserPreference {
  category: string;
  budget?: { min?: number; max?: number };
  priorities: PriorityItem[];
  constraints?: Constraint[];
}

// --- Decision Result ---

export interface ScoreContribution {
  attributeKey: string;
  label: string;
  rawValue: number | boolean | string | null;
  normalizedValue: number;
  weight: number;
  contribution: number;
  available: boolean;
}

export interface TradeOff {
  criterionKey: string;
  criterionLabel: string;
  winnerProductId: string;
  winnerProductName: string;
  score: number;
}

export interface ScoredProduct {
  product: Product;
  totalScore: number;
  rank: number;
  contributions: ScoreContribution[];
  missingAttributes: string[];
  strengths: string[];
  weaknesses: string[];
  dataConfidence: DataConfidence;
}

export interface DecisionResult {
  scoredProducts: ScoredProduct[];
  tradeOffs: TradeOff[];
  querySummary: string;
  categoryLabel: string;
  /** Present only when zero products satisfy all requirements. */
  emptyResultAnalysis?: EmptyResultAnalysis;
  /** Calculated weights used for scoring (stored for downstream comparison). */
  weights?: Record<string, number>;
  /** User priorities used for scoring (stored for downstream comparison). */
  priorities?: PriorityItem[];
  /** Budget constraints applied during filtering. */
  budget?: { min?: number; max?: number };
}

// --- Decision Confidence ---

export type ConfidenceLevel = "high" | "good" | "moderate" | "low";

export interface DecisionConfidence {
  /** Deterministic confidence score 0–100. */
  score: number;
  /** Human-readable confidence label based on range. */
  level: ConfidenceLevel;
  /** Brief explanation of why this confidence was assigned. */
  explanation: string;
}

// --- Decision Matrix ---

export interface MatrixCell {
  value: number | boolean | string | null;
  normalized: number | null;
  available: boolean;
}

export interface MatrixRow {
  product: Product;
  cells: Record<string, MatrixCell>;
  score: number;
}

export interface DecisionMatrix {
  attributes: AttributeConfig[];
  rows: MatrixRow[];
}

// --- Decision Insight Panel ---

export type ParserSource = "ai" | "fallback";

export interface DecisionInsightData {
  /** Human-readable category label (e.g. "Smartphone"). */
  categoryLabel: string;
  /** Category attribute key. */
  categoryKey: string;
  /** Budget, if provided. */
  budget?: { min?: number; max?: number };
  /** Priorities extracted from the query, sorted by importance. */
  priorities: PriorityItem[];
  /** All attribute configs for the current category. */
  attributes: AttributeConfig[];
  /** Whether AI or fallback parser was used. */
  parserSource: ParserSource;
  /** The original natural-language query the user typed. */
  originalQuery: string;
}

// --- Empty Result Analysis ---

/** A single requirement that excluded products. */
export interface FailedRequirement {
  type: "budget" | "constraint";
  attributeKey?: string;
  description: string;
  excludedProductCount: number;
}

/** A suggestion for relaxing a constraint to get results. */
export interface ConstraintRelaxationSuggestion {
  id: string;
  type: "budget" | "constraint";
  attributeKey?: string;
  title: string;
  explanation: string;
  currentValue?: number;
  suggestedValue?: number;
  operator?: ComparisonOperator;
  matchingProductCount: number;
  affectedProductIds?: string[];
}

/** How close a product is to satisfying all requirements. */
export interface ClosestMatch {
  product: Product;
  totalRequirements: number;
  metRequirements: number;
  unmetCount: number;
  unmetDetails: {
    type: "budget" | "constraint";
    attributeKey?: string;
    description: string;
    gap?: number;
  }[];
}

/** Full analysis of why no products matched and what could help. */
export interface EmptyResultAnalysis {
  hasResults: boolean;
  reason: string;
  failedRequirements: FailedRequirement[];
  suggestions: ConstraintRelaxationSuggestion[];
  closestMatches: ClosestMatch[];
}

// --- Merchant Intelligence ---

/**
 * A merchant in the DecisionCart marketplace.
 * Each merchant represents a seller that offers products.
 */
export interface Merchant {
  /** Unique merchant identifier. */
  id: string;
  /** Human-readable merchant name. */
  name: string;
  /** Trust score 0–100. Higher = more trustworthy. */
  trustScore: number;
  /** Whether the merchant is a verified / authorized seller. */
  verified: boolean;
  /** Fulfillment speed classification. */
  fulfillmentSpeed: "standard" | "fast" | "priority";
  /** Number of ratings received. */
  ratingCount: number;
  /** Return policy in days. */
  returnPolicyDays: number;
}

/**
 * A merchant's offer for a specific product.
 * Each product may have offers from multiple merchants.
 */
export interface MerchantOffer {
  /** Unique offer identifier. */
  id: string;
  /** The merchant making this offer. */
  merchantId: string;
  /** The product this offer is for. */
  productId: string;
  /** Offer price in the smallest currency unit (INR). */
  price: number;
  /** Currency code (e.g. "INR"). */
  currency: string;
  /** Available stock units. */
  stock: number;
  /** Warranty period in months. */
  warrantyMonths: number;
  /** Estimated delivery in days. */
  deliveryDays: number;
  /** ISO 8601 timestamp of last update. */
  updatedAt: string;
  /** Whether this offer is currently available. */
  isAvailable: boolean;
}

/**
 * Deterministic score for a merchant offer.
 * All values 0–100. The overallScore drives ranking.
 */
export interface MerchantOfferScore {
  /** The offer this score belongs to. */
  offerId: string;
  /** The merchant this score belongs to. */
  merchantId: string;
  /** Weighted overall score 0–100. */
  overallScore: number;
  /** Price competitiveness score 0–100. */
  priceScore: number;
  /** Trust score 0–100. */
  trustScore: number;
  /** Stock availability score 0–100. */
  stockScore: number;
  /** Warranty / protection score 0–100. */
  warrantyScore: number;
  /** Human-readable highlight of the main trade-off. */
  tradeOffHighlight: string;
}

/**
 * Result of merchant selection for a given product.
 * Includes the recommended offer, merchant, explanation, and alternatives.
 */
export interface MerchantSelection {
  /** The recommended offer. */
  selectedOffer: MerchantOffer;
  /** The merchant for the recommended offer. */
  merchant: Merchant;
  /** Human-readable explanation of why this offer was selected. */
  explanation: string;
  /** Other available offers for comparison. */
  alternativeOffers: MerchantOffer[];
}
