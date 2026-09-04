// ============================================================
// DecisionCart — AI Types
// Types for natural language → structured preference parsing.
// ============================================================

import type { CategoryConfig, PriorityItem, Constraint } from "@/types";

// --- Refinement Mode ---

/**
 * Classification of how a follow-up query modifies existing preferences.
 *
 * - "exclusive": Only mentioned attributes matter (e.g. "just focus on camera")
 * - "increase":  Boost importance of mentioned attributes
 * - "decrease":  Reduce importance of mentioned attributes
 * - "ignore":    Set mentioned attributes to low importance
 * - "budget":    Only budget is being changed
 * - "normal":    Full fresh query that replaces preferences entirely
 */
export type RefinementMode =
  | "exclusive"
  | "increase"
  | "decrease"
  | "ignore"
  | "budget"
  | "normal";

// --- Parsed Intent ---

export interface ParsedShoppingIntent {
  category: string;
  budget?: { min?: number; max?: number };
  priorities: PriorityItem[];
  constraints: Constraint[];
  confidence: number; // 0–1, how confident the parser is
  originalQuery: string;
  /** How this query relates to a previous query (set during refinement merge). */
  refinementMode?: RefinementMode;
}

// --- Parser Result ---export type ParseSource = "ai" | "fallback";

export type ParseSource = "ai" | "fallback";

export type AIFailureClass =
  | "unavailable"
  | "timeout"
  | "invalid_response"
  | "api_error"
  | "network"
  | "unknown";

export interface AIParseResult {
  success: boolean;
  source: ParseSource;
  intent?: ParsedShoppingIntent;
  error?: string;
  /** Whether an AI provider was attempted for this parse. */
  aiAttempted?: boolean;
  /** Whether an AI provider was configured and reachable at parse time. */
  aiAvailable?: boolean;
  /** The configured AI provider name when available, for observability only. */
  aiProvider?: string;
  /** Whether the deterministic fallback parser was used to produce the final intent. */
  fallbackUsed?: boolean;
  /** Normalized, non-sensitive classification of an AI failure, when applicable. */
  aiFailureClass?: AIFailureClass;
}

// --- AI Provider Interface ---

export interface AIProvider {
  /** Parse a natural language shopping query into structured preferences. */
  parseShoppingQuery(
    query: string,
    categoryConfig: CategoryConfig,
    availableCategories: CategoryConfig[]
  ): Promise<AIParseResult>;
}

// --- Parser Context ---

export interface ParserContext {
  /** All available category configurations. */
  categories: CategoryConfig[];
  /** The currently selected category (if any). */
  currentCategory?: string;
  /** Current user preferences (for refinement parsing). */
  currentPreferences?: {
    category: string;
    budget?: { min?: number; max?: number };
    priorities: PriorityItem[];
    constraints?: Constraint[];
  };
}

// --- Environment Config ---

export interface AIConfig {
  provider: string;
  apiKey: string;
  model: string;
}

export function getAIConfig(): AIConfig | null {
  const provider = process.env.AI_PROVIDER;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;

  if (!provider || !apiKey || !model) return null;
  if (apiKey === "your_ai_api_key_here") return null;

  return { provider, apiKey, model };
}
