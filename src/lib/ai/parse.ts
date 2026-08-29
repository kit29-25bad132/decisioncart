// ============================================================
// DecisionCart — Parse Dispatcher
// Tries AI provider first, falls back to deterministic parser.
// ============================================================

import type { CategoryConfig } from "@/types";
import type { AIParseResult, ParserContext } from "./types";
import { getAIProvider } from "./provider";
import { fallbackParse } from "./fallback-parser";

/**
 * Parse a natural language shopping query into structured preferences.
 * Tries AI if available, otherwise uses deterministic fallback.
 */
export async function parseShoppingQuery(
  query: string,
  context: ParserContext
): Promise<AIParseResult> {
  const trimmed = query.trim();

  if (!trimmed) {
    return {
      success: false,
      source: "fallback",
      error: "Please enter a search query",
    };
  }

  // Determine which category config to use
  const categoryConfig = resolveCategoryConfig(context);
  if (!categoryConfig) {
    return {
      success: false,
      source: "fallback",
      error: "No valid category found",
    };
  }

  // Try AI provider first
  const aiProvider = getAIProvider();
  if (aiProvider) {
    const aiResult = await aiProvider.parseShoppingQuery(
      trimmed,
      categoryConfig,
      context.categories
    );

    if (aiResult.success && aiResult.intent) {
      // Set original query
      aiResult.intent.originalQuery = trimmed;

      // If this is a refinement (follow-up), merge with current preferences
      if (context.currentPreferences && isRefinementQuery(trimmed)) {
        aiResult.intent = mergeWithCurrent(
          aiResult.intent,
          context.currentPreferences,
          categoryConfig
        );
      }

      return aiResult;
    }

    // AI failed — fall through to fallback
  }

  // Use deterministic fallback
  const fallbackIntent = fallbackParse(trimmed, context);
  fallbackIntent.originalQuery = trimmed;

  // If this is a refinement, merge with current preferences
  if (context.currentPreferences && isRefinementQuery(trimmed)) {
    const merged = mergeWithCurrent(
      fallbackIntent,
      context.currentPreferences,
      categoryConfig
    );
    return { success: true, source: "fallback", intent: merged };
  }

  return { success: true, source: "fallback", intent: fallbackIntent };
}

// --- Helpers ---

function resolveCategoryConfig(context: ParserContext): CategoryConfig | undefined {
  if (context.currentCategory) {
    return context.categories.find(
      (c) => c.category === context.currentCategory
    );
  }
  return context.categories[0];
}

/**
 * Detect if a query is a refinement (follow-up) rather than a fresh query.
 * Refinements are short, don't specify a category, and modify existing preferences.
 */
function isRefinementQuery(query: string): boolean {
  const lower = query.toLowerCase().trim();

  // Very short queries are likely refinements
  if (lower.split(/\s+/).length <= 6) return true;

  // Phrases that indicate refinement
  const refinementPatterns = [
    /^actually/i,
    /^also/i,
    /^and/i,
    /^but/i,
    /^more about/i,
    /^less about/i,
    /^care more/i,
    /^care less/i,
    /^increase/i,
    /^decrease/i,
    /^change/i,
    /^make it/i,
    /^switch/i,
    /^adjust/i,
  ];

  return refinementPatterns.some((p) => p.test(lower));
}

/**
 * Merge a newly parsed intent with current preferences.
 * Only overwrites fields that the new query explicitly mentions.
 */
function mergeWithCurrent(
  newIntent: ReturnType<typeof fallbackParse>,
  current: {
    category: string;
    budget?: { min?: number; max?: number };
    priorities: { attributeKey: string; importance: number }[];
  },
  categoryConfig: CategoryConfig
): ReturnType<typeof fallbackParse> {
  const merged = { ...newIntent };

  // If the new query doesn't mention a category, keep current
  if (!newIntent.category || newIntent.category === current.category) {
    merged.category = current.category;
  }

  // If the new query doesn't mention budget, keep current
  if (!newIntent.budget) {
    merged.budget = current.budget;
  }

  // Merge priorities: new priorities override, others stay
  if (newIntent.priorities.length > 0) {
    const newKeys = new Set(
      newIntent.priorities.map((p) => p.attributeKey)
    );

    // Keep current priorities that weren't overridden
    const keptPriorities = current.priorities.filter(
      (p) => !newKeys.has(p.attributeKey)
    );

    merged.priorities = [...keptPriorities, ...newIntent.priorities];

    // Fill in any missing attributes with default medium priority
    for (const attr of categoryConfig.attributes) {
      if (!merged.priorities.find((p) => p.attributeKey === attr.key)) {
        merged.priorities.push({ attributeKey: attr.key, importance: 2 });
      }
    }
  }

  return merged;
}
