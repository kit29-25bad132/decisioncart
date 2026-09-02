// ============================================================
// DecisionCart — Parse Dispatcher
// Tries AI provider first, falls back to deterministic parser.
// Handles conversational refinement intelligence.
// ============================================================

import type { CategoryConfig } from "@/types";
import type {
  AIParseResult,
  ParserContext,
  ParsedShoppingIntent,
  RefinementMode,
} from "./types";
import { getAIProvider } from "./provider";
import { fallbackParse } from "./fallback-parser";
import { resolveCategoryConfig as resolveFromCatalog } from "@/catalog/category-resolver";

// --- Category keywords (mirrors fallback-parser for detection) ---

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  smartphone: [
    "phone",
    "smartphone",
    "mobile",
    "cell phone",
    "android",
    "iphone",
  ],
  laptop: ["laptop", "notebook", "computer", "pc", "macbook"],
};

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
      if (context.currentPreferences) {
        const refinementMode = detectRefinementMode(trimmed);
        if (refinementMode !== "normal") {
          aiResult.intent = mergeWithCurrent(
            aiResult.intent,
            context.currentPreferences,
            categoryConfig,
            refinementMode
          );
        }
      }

      return aiResult;
    }

    // AI failed — fall through to fallback
  }

  // Use deterministic fallback
  const fallbackIntent = fallbackParse(trimmed, context);
  fallbackIntent.originalQuery = trimmed;

  // If this is a refinement, merge with current preferences
  if (context.currentPreferences) {
    const refinementMode = detectRefinementMode(trimmed);
    if (refinementMode !== "normal") {
      const merged = mergeWithCurrent(
        fallbackIntent,
        context.currentPreferences,
        categoryConfig,
        refinementMode
      );
      return { success: true, source: "fallback", intent: merged };
    }
  }

  return { success: true, source: "fallback", intent: fallbackIntent };
}

// --- Helpers ---

/**
 * Resolve a category config from the parser context.
 * Uses the context's category list first, then falls back to the resolver
 * for dynamic categories.
 */
function resolveCategoryConfig(context: ParserContext): CategoryConfig | undefined {
  // First try context-provided categories (backward compatible)
  if (context.currentCategory) {
    const found = context.categories.find(
      (c) => c.category === context.currentCategory
    );
    if (found) return found;
  }

  // Fall back to resolver for dynamic categories
  if (context.currentCategory) {
    const resolved = resolveCategoryConfigFromResolver(context.currentCategory);
    if (resolved) return resolved;
  }

  // Default to first available category
  return context.categories[0];
}

/**
 * Resolve a category config using the resolver (registered + dynamic).
 */
function resolveCategoryConfigFromResolver(category: string): CategoryConfig | undefined {
  const result = resolveFromCatalog(category);
  return result?.config;
}

// --- Refinement Mode Detection ---

/**
 * Detect the refinement mode of a query.
 * Returns "normal" if the query is a fresh/full query, not a refinement.
 */
export function detectRefinementMode(query: string): RefinementMode {
  const lower = query.toLowerCase().trim();

  // 1. Check for exclusive priority patterns
  //    "just focus on camera", "only care about battery", "camera is all that matters"
  const exclusivePatterns = [
    /\b(?:just|simply|only|solely)\b.*\b(?:focus on|care about|want|need|prioritize)\b/i,
    /\b(?:focus|care|want|need|prioritize)\b\s+(?:only|just|solely)\b/i,
    /\b(?:focus on|care about|want|need|prioritize)\b.*\b(?:only|just|solely)\b/i,
    /\bis all that matters\b/i,
    /\bis the only thing\b/i,
    /\bonly thing i (?:care|want|need)\b/i,
    /\bnothing else (?:matters|counts)\b/i,
  ];
  if (exclusivePatterns.some((p) => p.test(lower))) {
    return "exclusive";
  }

  // 2. Check for ignore/ignore patterns
  //    "I don't care about gaming", "camera doesn't matter", "ignore battery"
  const ignorePatterns = [
    /\b(?:don't|dont|do not|doesn't|doesnt|can safely)\s+(?:care|matter|need|worry)\b/i,
    /\bisn't (?:important|a concern|necessary|relevant)\b/i,
    /\bis not (?:important|a concern|necessary|relevant)\b/i,
    /\bignore\b/i,
    /\bdrop\b/i,
    /\bremove\b/i,
    /\b(?:stop|cease)\s+(?:caring|focusing|worrying)\b/i,
  ];
  if (ignorePatterns.some((p) => p.test(lower))) {
    return "ignore";
  }

  // 3. Check for increase patterns
  //    "care more about camera", "camera matters more", "increase battery priority"
  const increasePatterns = [
    /\b(?:care|want|need)\s+more\b/i,
    /\bmatters?\s+more\b/i,
    /\bincrease\b.*\b(?:priority|importance|focus)\b/i,
    /\b(?:priority|importance|focus)\s+(?:up|higher|increase)\b/i,
    /\b(?:boost|elevate|emphasize|prioritize)\b/i,
    /\bmore important\b/i,
  ];
  if (increasePatterns.some((p) => p.test(lower))) {
    return "increase";
  }

  // 4. Check for decrease patterns
  //    "care less about battery", "battery is less important"
  const decreasePatterns = [
    /\b(?:care|want|need)\s+less\b/i,
    /\bless\s+(?:important|matters?)\b/i,
    /\b(?:reduce|lower|decrease)\b.*\b(?:priority|importance|focus)\b/i,
    /\b(?:priority|importance|focus)\s+(?:down|lower|decrease)\b/i,
    /\b(?:de-prioritize|deprioritize)\b/i,
  ];
  if (decreasePatterns.some((p) => p.test(lower))) {
    return "decrease";
  }

  // 5. Check for budget-only refinement
  //    "make it 35000", "increase budget to 40k"
  if (isBudgetOnlyRefinement(lower)) {
    return "budget";
  }

  // 6. Check if this is a refinement at all using semantic cues
  //    Must have explicit refinement trigger words — NOT just "short = refinement"
  const refinementTriggers = [
    /^actually\b/i,
    /^also\b/i,
    /^and\b/i,
    /^but\b/i,
    /^more about/i,
    /^less about/i,
    /^change/i,
    /^make it/i,
    /^switch/i,
    /^adjust/i,
    /^instead/i,
    /^how about/i,
    /^what about/i,
    /^can you/i,
    /^try/i,
    /^let's/i,
  ];

  if (refinementTriggers.some((p) => p.test(lower))) {
    return "increase"; // Generic refinement defaults to increase mode
  }

  // 7. Default: this is a normal (fresh) query
  return "normal";
}

/**
 * Check if a query is a budget-only refinement (no category keywords, just a number + budget language).
 */
function isBudgetOnlyRefinement(lower: string): boolean {
  // Must NOT contain category keywords — if it does, it's a fresh query
  for (const keywords of Object.values(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return false;
    }
  }

  // Must contain a number
  const hasNumber = /\d/.test(lower);
  if (!hasNumber) return false;

  // Must contain budget-related language or be a bare number adjustment
  const budgetLanguage = [
    /\b(?:budget|price|cost|spend)\b/i,
    /\b(?:make|set|change|increase|decrease|go|up|down)\b/i,
    /\b(?:to|upto|up to|under|over|above|below|around)\b/i,
    /₹/,
  ];

  return budgetLanguage.some((p) => p.test(lower));
}

// --- Merge Logic ---

/**
 * Merge a newly parsed intent with current preferences based on refinement mode.
 */
export function mergeWithCurrent(
  newIntent: ParsedShoppingIntent,
  current: {
    category: string;
    budget?: { min?: number; max?: number };
    priorities: { attributeKey: string; importance: number }[];
    constraints?: import("@/types").Constraint[];
  },
  categoryConfig: CategoryConfig,
  refinementMode: RefinementMode
): ParsedShoppingIntent {
  const merged = { ...newIntent };
  merged.refinementMode = refinementMode;

  // Category: always preserve current category for refinements
  merged.category = current.category;

  // --- Constraint merging ---
  // Hard constraints are preserved unless the new intent explicitly provides new ones.
  // Merge strategy: combine existing constraints with any new constraints from the intent.
  // If the new intent has constraints, they override existing constraints for the same attributeKey.
  // If the new intent has no constraints, existing constraints are fully preserved.
  const currentConstraints = current.constraints ?? [];
  const newConstraints = newIntent.constraints ?? [];

  if (newConstraints.length > 0) {
    // Merge: new constraints override existing ones for the same attributeKey
    const mergedMap = new Map<string, import("@/types").Constraint>();
    for (const c of currentConstraints) {
      const key = c.attributeKey ?? c.type;
      mergedMap.set(key, c);
    }
    for (const c of newConstraints) {
      const key = c.attributeKey ?? c.type;
      mergedMap.set(key, c);
    }
    merged.constraints = Array.from(mergedMap.values());
  } else {
    // No new constraints — preserve existing ones
    merged.constraints = currentConstraints.length > 0 ? [...currentConstraints] : [];
  }

  switch (refinementMode) {
    case "exclusive": {
      // "just focus on camera" → camera=High, everything else=Low
      // Only the mentioned attributes matter; unmentioned get importance 1.
      const mentionedKeys = new Set(
        newIntent.priorities.map((p) => p.attributeKey)
      );

      // Use new priorities as-is (they have correct importance from parser)
      // Add ALL other attributes at importance 1 (low / negligible influence)
      merged.priorities = [...newIntent.priorities];
      for (const attr of categoryConfig.attributes) {
        if (!mentionedKeys.has(attr.key)) {
          merged.priorities.push({ attributeKey: attr.key, importance: 1 });
        }
      }

      // Budget stays unchanged
      if (!newIntent.budget) {
        merged.budget = current.budget;
      }
      break;
    }

    case "increase": {
      // "care more about camera" → boost that attribute
      // Only explicitly detected attributes should change.
      const increaseMap = new Map(
        newIntent.priorities.map((p) => [p.attributeKey, p.importance])
      );

      // If no valid attributes were detected for this refinement
      // (e.g., "camera" mentioned for laptop which has no camera attribute),
      // preserve current preferences without applying any changes.
      if (increaseMap.size === 0) {
        merged.priorities = current.priorities;
        merged.refinementMode = undefined; // No refinement applied
        if (!newIntent.budget) {
          merged.budget = current.budget;
        }
        break;
      }

      merged.priorities = current.priorities.map((p) => {
        const boost = increaseMap.get(p.attributeKey);
        if (boost !== undefined) {
          // Increase: move up at least one level, or use detected importance
          return { ...p, importance: Math.min(3, Math.max(p.importance, boost)) };
        }
        return p;
      });

      // Add any new attributes mentioned that weren't in current
      for (const p of newIntent.priorities) {
        if (!merged.priorities.find((mp) => mp.attributeKey === p.attributeKey)) {
          merged.priorities.push(p);
        }
      }

      // Budget stays unchanged
      if (!newIntent.budget) {
        merged.budget = current.budget;
      }
      break;
    }

    case "decrease": {
      // "care less about battery" → reduce that attribute
      const decreaseMap = new Map(
        newIntent.priorities.map((p) => [p.attributeKey, p.importance])
      );

      // If no valid attributes were detected, preserve current preferences
      if (decreaseMap.size === 0) {
        merged.priorities = current.priorities;
        merged.refinementMode = undefined;
        if (!newIntent.budget) {
          merged.budget = current.budget;
        }
        break;
      }

      merged.priorities = current.priorities.map((p) => {
        const reduction = decreaseMap.get(p.attributeKey);
        if (reduction !== undefined) {
          // Decrease: move down at least one level, or use detected importance
          return { ...p, importance: Math.min(p.importance, reduction) };
        }
        return p;
      });

      // Budget stays unchanged
      if (!newIntent.budget) {
        merged.budget = current.budget;
      }
      break;
    }

    case "ignore": {
      // "I don't care about battery" → set that attribute to importance 1
      const ignoreKeys = new Set(
        newIntent.priorities.map((p) => p.attributeKey)
      );

      // If no valid attributes were detected, preserve current preferences
      if (ignoreKeys.size === 0) {
        merged.priorities = current.priorities;
        merged.refinementMode = undefined;
        if (!newIntent.budget) {
          merged.budget = current.budget;
        }
        break;
      }

      merged.priorities = current.priorities.map((p) => {
        if (ignoreKeys.has(p.attributeKey)) {
          return { ...p, importance: 1 };
        }
        return p;
      });

      // Budget stays unchanged
      if (!newIntent.budget) {
        merged.budget = current.budget;
      }
      break;
    }

    case "budget": {
      // Budget-only refinement: keep all priorities, only update budget
      merged.priorities = current.priorities;
      if (newIntent.budget) {
        merged.budget = newIntent.budget;
      } else {
        merged.budget = current.budget;
      }
      break;
    }

    case "normal": {
      // Fresh query: use new intent as-is (this path shouldn't be reached
      // since caller filters out "normal" before calling mergeWithCurrent)
      break;
    }
  }

  return merged;
}
