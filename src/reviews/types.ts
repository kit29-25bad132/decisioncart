// ============================================================
// DecisionCart — Review Intelligence Types
// Category-agnostic structured review intelligence.
// Deterministic. No AI inference. No web scraping.
// ============================================================

/** Sentiment classification for a product's review intelligence. */
export type OverallSentiment = "very_positive" | "positive" | "mixed" | "negative";

/** A single review insight (strength or concern). */
export interface ReviewInsight {
  /** Attribute key this insight relates to (maps to CategoryConfig attribute). */
  attributeKey: string;
  /** Human-readable description of the insight. */
  description: string;
  /** How frequently this theme appears in review data (1–5). */
  frequency: number;
}

/** Structured review intelligence for a single product. */
export interface ProductReviewIntelligence {
  /** Product ID this review intelligence belongs to. */
  productId: string;
  /** Overall sentiment classification. */
  overallSentiment: OverallSentiment;
  /** Numeric sentiment score 0–100 (0 = very negative, 100 = very positive). */
  sentimentScore: number;
  /** Brief summary of the review intelligence. */
  summary: string;
  /** Key strengths / what users love. */
  strengths: ReviewInsight[];
  /** Common concerns / complaints. */
  concerns: ReviewInsight[];
  /** Confidence in this review intelligence (high / medium / low). */
  confidence: "high" | "medium" | "low";
}

/** Result from the analyze_reviews agent tool. */
export interface ReviewAnalysisResult {
  /** Whether the tool execution succeeded. */
  success: boolean;
  /** Review intelligence for each product, keyed by product ID. */
  reviews: Record<string, ProductReviewIntelligence>;
  /** Number of products analyzed. */
  analyzedCount: number;
  /** Human-readable summary of the analysis. */
  outputSummary: string;
  /** Error message when success is false. */
  error?: string;
}
