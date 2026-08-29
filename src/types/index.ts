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

export interface Constraint {
  type: "max_price" | "min_price" | "required_attribute" | "exclude_attribute";
  attributeKey?: string;
  value?: number | boolean | string;
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
