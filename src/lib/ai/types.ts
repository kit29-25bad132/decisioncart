// ============================================================
// DecisionCart — AI Types
// Types for natural language → structured preference parsing.
// ============================================================

import type { CategoryConfig, PriorityItem, Constraint } from "@/types";

// --- Parsed Intent ---

export interface ParsedShoppingIntent {
  category: string;
  budget?: { min?: number; max?: number };
  priorities: PriorityItem[];
  constraints: Constraint[];
  confidence: number; // 0–1, how confident the parser is
  originalQuery: string;
}

// --- Parser Result ---

export type ParseSource = "ai" | "fallback";

export interface AIParseResult {
  success: boolean;
  source: ParseSource;
  intent?: ParsedShoppingIntent;
  error?: string;
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
