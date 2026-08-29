// ============================================================
// DecisionCart — Fallback Parser
// Deterministic keyword-based intent parsing.
// Works without any AI API key.
// ============================================================

import type { CategoryConfig, PriorityItem } from "@/types";
import type { ParserContext, ParsedShoppingIntent } from "./types";

// --- Keyword Mappings ---

/** Maps natural language terms to category identifiers. */
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

/** Maps natural language terms to attribute keys, per category. */
function buildAttributeKeywordMap(
  categoryConfig: CategoryConfig
): Map<string, string[]> {
  const map = new Map<string, string[]>();

  // Generic synonyms that apply across categories
  const genericSynonyms: Record<string, string[]> = {
    camera_score: ["camera", "photo", "photography", "picture", "selfie"],
    battery_mah: ["battery", "battery life", "charge", "mah"],
    battery_hours: ["battery", "battery life", "charge", "hours"],
    display_inches: [
      "display",
      "screen",
      "display size",
      "screen size",
      "display size",
    ],
    ram_gb: ["ram", "memory", "performance", "speed", "fast"],
    processor_score: [
      "processor",
      "cpu",
      "performance",
      "speed",
      "fast",
      "coding",
      "programming",
    ],
    storage_gb: ["storage", "space", "gb"],
    ssd_gb: ["storage", "space", "ssd", "gb"],
    five_g: ["5g", "5g support", "5g connectivity"],
    weight_kg: [
      "weight",
      "light",
      "lightweight",
      "portable",
      "portability",
      "compact",
    ],
  };

  for (const attr of categoryConfig.attributes) {
    const synonyms = genericSynonyms[attr.key] ?? [attr.label.toLowerCase()];
    map.set(attr.key, synonyms);
  }

  return map;
}

/** Maps natural language importance terms to numeric values. */
const IMPORTANCE_MAP: Record<string, number> = {
  // High importance
  excellent: 3,
  best: 3,
  top: 3,
  great: 3,
  important: 3,
  "must have": 3,
  priority: 3,
  "love to have": 3,
  crucial: 3,
  essential: 3,
  "highest priority": 3,

  // Medium importance
  good: 2,
  decent: 2,
  nice: 2,
  "would like": 2,
  prefer: 2,
  "preferably": 2,

  // Low importance
  "doesn't matter": 1,
  "doesnt matter": 1,
  "not important": 1,
  "low priority": 1,
  "don't care": 1,
  "dont care": 1,
  optional: 1,
  "nice to have": 1,
  "if possible": 1,
};

// --- Budget Extraction ---

const BUDGET_PATTERNS: {
  regex: RegExp;
  extract: (match: RegExpMatchArray) => { min?: number; max?: number };
}[] = [
  // "under 30000", "below 30k", "within 30000"
  {
    regex:
      /(?:under|below|within|less than|max(?:imum)?|upto|up to)\s*(?:₹?\s*)?([\d,]+(?:\.\d+)?)\s*(?:k|K)?/i,
    extract: (m) => ({
      max: parseCurrencyAmount(m[1], m[0].toLowerCase().includes("k")),
    }),
  },
  // "above 50000", "over 50k", "minimum 50000"
  {
    regex:
      /(?:above|over|more than|min(?:imum)?|at least)\s*(?:₹?\s*)?([\d,]+(?:\.\d+)?)\s*(?:k|K)?/i,
    extract: (m) => ({
      min: parseCurrencyAmount(m[1], m[0].toLowerCase().includes("k")),
    }),
  },
  // "budget 30000", "price 30k", "₹30000"
  {
    regex:
      /(?:budget|price|around|about|approximately|near)\s*(?:₹?\s*)?([\d,]+(?:\.\d+)?)\s*(?:k|K)?/i,
    extract: (m) => ({
      max: parseCurrencyAmount(m[1], m[0].toLowerCase().includes("k")),
    }),
  },
  // Standalone "₹30000" or "30000"
  {
    regex: /₹\s*([\d,]+(?:\.\d+)?)\s*(?:k|K)?/,
    extract: (m) => ({
      max: parseCurrencyAmount(m[1], false),
    }),
  },
];

function parseCurrencyAmount(raw: string, isK: boolean): number {
  const num = parseFloat(raw.replace(/,/g, ""));
  if (isNaN(num)) return 0;
  return isK ? num * 1000 : num;
}

function extractBudget(
  query: string
): { min?: number; max?: number } | undefined {
  for (const pattern of BUDGET_PATTERNS) {
    const match = query.match(pattern.regex);
    if (match) {
      const budget = pattern.extract(match);
      if (budget.max || budget.min) return budget;
    }
  }
  return undefined;
}

// --- Category Detection ---

function detectCategory(
  query: string,
  context: ParserContext
): string | null {
  const lower = query.toLowerCase();

  // Check each category's keywords
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return category;
    }
  }

  // Fall back to current category if provided
  if (context.currentCategory) {
    const config = context.categories.find(
      (c) => c.category === context.currentCategory
    );
    if (config) return config.category;
  }

  return null;
}

// --- Priority Detection ---

function detectPriorities(
  query: string,
  categoryConfig: CategoryConfig
): PriorityItem[] {
  const lower = query.toLowerCase();
  const attributeMap = buildAttributeKeywordMap(categoryConfig);
  const priorities: PriorityItem[] = [];
  const seen = new Set<string>();

  // Check each attribute against the query
  for (const [attrKey, synonyms] of attributeMap) {
    for (const synonym of synonyms) {
      if (lower.includes(synonym)) {
        if (seen.has(attrKey)) continue;
        seen.add(attrKey);

        // Determine importance based on surrounding context
        const importance = detectImportance(lower, synonym);
        priorities.push({ attributeKey: attrKey, importance });
        break;
      }
    }
  }

  // Check for negative patterns (low priority)
  const lowPatterns = [
    /(?:don't|dont|do not|doesn't|doesnt|not)\s+(?:care|matter|need|want)\s+(?:about|for)?\s*(\w+)/i,
    /(\w+)\s+(?:doesn't|doesnt|don't|dont)\s+(?:matter|care|important)/i,
  ];

  for (const pattern of lowPatterns) {
    const match = lower.match(pattern);
    if (match) {
      const term = match[1].toLowerCase();
      for (const [attrKey, synonyms] of attributeMap) {
        if (
          synonyms.some((s) => s.includes(term) || term.includes(s)) &&
          !seen.has(attrKey)
        ) {
          seen.add(attrKey);
          priorities.push({ attributeKey: attrKey, importance: 1 });
        }
      }
    }
  }

  return priorities;
}

function detectImportance(query: string, attributeName: string): number {
  // Look for importance keywords near the attribute name
  const nameIdx = query.indexOf(attributeName);
  if (nameIdx === -1) return 2; // default medium

  // Check a window around the attribute name (80 chars before and after)
  const start = Math.max(0, nameIdx - 80);
  const end = Math.min(query.length, nameIdx + attributeName.length + 80);
  const window = query.substring(start, end);

  // Check from highest to lowest importance
  for (const [keyword, importance] of Object.entries(IMPORTANCE_MAP)) {
    if (window.includes(keyword)) return importance;
  }

  return 2; // default medium
}

// --- Main Fallback Parser ---

export function fallbackParse(
  query: string,
  context: ParserContext
): ParsedShoppingIntent {
  const trimmed = query.trim();

  // Detect category
  const category = detectCategory(trimmed, context);
  const categoryConfig = context.categories.find(
    (c) => c.category === category
  );

  // Detect budget
  const budget = extractBudget(trimmed);

  // Detect priorities (only if we have a category config)
  const priorities = categoryConfig
    ? detectPriorities(trimmed, categoryConfig)
    : [];

  // If no category detected, try current category
  const finalCategory =
    category ?? context.currentCategory ?? context.categories[0]?.category ?? "smartphone";

  // Determine confidence based on what was detected
  let confidence = 0.3;
  if (category) confidence += 0.3;
  if (budget) confidence += 0.2;
  if (priorities.length > 0) confidence += 0.15;

  return {
    category: finalCategory,
    budget,
    priorities,
    constraints: [],
    confidence: Math.min(confidence, 0.9),
    originalQuery: trimmed,
  };
}
