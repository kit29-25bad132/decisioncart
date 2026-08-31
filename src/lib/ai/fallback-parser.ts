// ============================================================
// DecisionCart — Fallback Parser
// Deterministic keyword-based intent parsing.
// Works without any AI API key.
// Supports conversational refinement detection.
// ============================================================

import type { CategoryConfig, Constraint, PriorityItem } from "@/types";
import type { ParserContext, ParsedShoppingIntent, RefinementMode } from "./types";

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
  // "between 20000 and 40000", "between ₹20k and ₹40k"
  {
    regex:
      /between\s*(?:₹?\s*)?([\d,]+(?:\.\d+)?)\s*(k|K)?\s*and\s*(?:₹?\s*)?([\d,]+(?:\.\d+)?)\s*(k|K)?/i,
    extract: (m) => ({
      min: parseCurrencyAmount(m[1], !!m[2]),
      max: parseCurrencyAmount(m[3], !!m[4]),
    }),
  },
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
  // "budget 30000", "budget to 40000", "price 30k"
  {
    regex:
      /(?:budget|price|around|about|approximately|near)(?:\s+to)?\s*(?:₹?\s*)?([\d,]+(?:\.\d+)?)\s*(?:k|K)?/i,
    extract: (m) => ({
      max: parseCurrencyAmount(m[1], m[0].toLowerCase().includes("k")),
    }),
  },
  // "make it 40000", "set to 35000"
  {
    regex:
      /(?:make|set)\s+(?:it\s+)?(?:to\s+)?(?:₹?\s*)?([\d,]+(?:\.\d+)?)\s*(k|K)?/i,
    extract: (m) => ({
      max: parseCurrencyAmount(m[1], !!m[2]),
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

// --- Hard Constraint Extraction ---

/**
 * Extract numeric value from a string like "8GB", "256 GB", "6.7 inches".
 */
function extractNumber(str: string): number | null {
  const cleaned = str.replace(/[^\d.]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Escape a string for use in a regex.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract hard constraints from a natural language query.
 * Uses per-attribute regex matching to avoid false positives
 * where numbers and attribute keywords are far apart.
 *
 * Detects:
 *   "at least 8GB RAM" → ram_gb >= 8
 *   "minimum 256GB storage" → storage_gb >= 256
 *   "less than 512GB storage" → storage_gb <= 512
 *   "above 14 inches display" → display_inches > 14
 *   "must have 5G" → five_g = true (required_attribute)
 *   "RAM should be above 12GB" → ram_gb > 12
 */
function extractConstraints(
  query: string,
  categoryConfig: CategoryConfig
): Constraint[] {
  const constraints: Constraint[] = [];
  const lower = query.toLowerCase();
  const attributeMap = buildAttributeKeywordMap(categoryConfig);
  const seenAttrs = new Set<string>();

  const UNITS = "gb|mb|ghz|mhz|mah|hours|inches|kg|in|cm|mm|wh";

  // Helper: create a comparison constraint if not duplicate
  function addComparison(
    attrKey: string,
    op: ">=" | "<=" | ">" | "<",
    value: number
  ) {
    if (seenAttrs.has(attrKey)) return;
    seenAttrs.add(attrKey);
    constraints.push({
      type: "attribute_comparison",
      attributeKey: attrKey,
      value,
      operator: op,
    });
  }

  function addRequired(attrKey: string) {
    if (seenAttrs.has(attrKey)) return;
    seenAttrs.add(attrKey);
    constraints.push({
      type: "required_attribute",
      attributeKey: attrKey,
      value: true,
    });
  }

  let m: RegExpExecArray | null;

  // --- Per-attribute constraint matching ---
  for (const [attrKey, synonyms] of attributeMap) {
    const synAlternation = synonyms.map(escapeRegex).join("|");

    // >= patterns:
    //   "at least NUM [unit] [attr]" / "minimum NUM [unit] [attr]"
    //   "[attr] at least NUM [unit]" / "[attr] minimum NUM [unit]"
    const gteOp = "(?:at\\s+least|minimum|min(?:imum)?)";
    const gteForward = new RegExp(
      `${gteOp}\\s+(\\d+(?:\\.\\d+)?)\\s*(?:${UNITS})?\\s+(?:of\\s+)?(?:${synAlternation})`,
      "gi"
    );
    const gteBackward = new RegExp(
      `(?:${synAlternation})\\s+${gteOp}\\s+(?:of\\s*)?(\\d+(?:\\.\\d+)?)\\s*(?:${UNITS})?`,
      "gi"
    );
    while ((m = gteForward.exec(lower)) !== null) {
      const num = extractNumber(m[1]);
      if (num !== null) addComparison(attrKey, ">=", num);
    }
    while ((m = gteBackward.exec(lower)) !== null) {
      const num = extractNumber(m[1]);
      if (num !== null) addComparison(attrKey, ">=", num);
    }

    // <= patterns:
    //   "less than NUM [unit] [attr]" / "under NUM [unit] [attr]" / "max NUM [unit] [attr]"
    //   "[attr] less than NUM [unit]" / "[attr] under NUM [unit]"
    const lteOp = "(?:less\\s+than|under|below|max(?:imum)?|at\\s+most)";
    const lteForward = new RegExp(
      `${lteOp}\\s+(\\d+(?:\\.\\d+)?)\\s*(?:${UNITS})?\\s+(?:of\\s+)?(?:${synAlternation})`,
      "gi"
    );
    const lteBackward = new RegExp(
      `(?:${synAlternation})\\s+(?:should\\s+be\\s+)?${lteOp}\\s+(\\d+(?:\\.\\d+)?)\\s*(?:${UNITS})?`,
      "gi"
    );
    while ((m = lteForward.exec(lower)) !== null) {
      const num = extractNumber(m[1]);
      if (num !== null) addComparison(attrKey, "<=", num);
    }
    while ((m = lteBackward.exec(lower)) !== null) {
      const num = extractNumber(m[1]);
      if (num !== null) addComparison(attrKey, "<=", num);
    }

    // > patterns:
    //   "above NUM [unit] [attr]" / "more than NUM [unit] [attr]"
    //   "[attr] above NUM [unit]" / "[attr] more than NUM [unit]"
    const gtOp = "(?:above|over|more\\s+than|greater\\s+than)";
    const gtForward = new RegExp(
      `${gtOp}\\s+(\\d+(?:\\.\\d+)?)\\s*(?:${UNITS})?\\s+(?:of\\s+)?(?:${synAlternation})`,
      "gi"
    );
    const gtBackward = new RegExp(
      `(?:${synAlternation})\\s+(?:should\\s+be\\s+)?${gtOp}\\s+(\\d+(?:\\.\\d+)?)\\s*(?:${UNITS})?`,
      "gi"
    );
    while ((m = gtForward.exec(lower)) !== null) {
      const num = extractNumber(m[1]);
      if (num !== null) addComparison(attrKey, ">", num);
    }
    while ((m = gtBackward.exec(lower)) !== null) {
      const num = extractNumber(m[1]);
      if (num !== null) addComparison(attrKey, ">", num);
    }

    // "NUM [unit] or more" / "NUM [unit] and above" (attribute must appear nearby)
    const numThenMore = new RegExp(
      `(?:${synAlternation})\\s*[,:-]?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:${UNITS})\\s*(?:or\\s+more|and\\s+(?:above|up|higher))`,
      "gi"
    );
    while ((m = numThenMore.exec(lower)) !== null) {
      const num = extractNumber(m[1]);
      if (num !== null) addComparison(attrKey, ">=", num);
    }

    // Boolean required patterns:
    //   "must have [attr]" / "[attr] required" / "need [attr]"
    const mustHave = new RegExp(
      `(?:must\\s+have|require[d]?|need(?:ed)?)\\s+(?:(?:the\\s+|a\\s+)?)?(?:${synAlternation})`,
      "gi"
    );
    while ((m = mustHave.exec(lower)) !== null) {
      addRequired(attrKey);
    }

    // "[attr] = true" / "[attr] is required" / "[attr] must be true"
    const boolTrue = new RegExp(
      `(?:${synAlternation})\\s*(?:=|is|must\\s+be)\\s*(?:true|yes|required)`,
      "gi"
    );
    while ((m = boolTrue.exec(lower)) !== null) {
      addRequired(attrKey);
    }
  }

  return constraints;
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
  categoryConfig: CategoryConfig,
  refinementMode?: RefinementMode
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
        let importance = detectImportance(lower, synonym);

        // For exclusive refinements, force mentioned attributes to high
        if (refinementMode === "exclusive") {
          importance = 3;
        }

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

// --- Refinement Mode Detection ---

/**
 * Detect refinement mode from a natural language query.
 * Exported for use by the parse dispatcher.
 */
export function detectRefinementMode(query: string): RefinementMode {
  const lower = query.toLowerCase().trim();

  // Exclusive priority patterns
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

  // Ignore patterns
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

  // Increase patterns
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

  // Decrease patterns
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

  // Budget-only refinement
  const CATEGORY_KEYWORDS: Record<string, string[]> = {
    smartphone: ["phone", "smartphone", "mobile", "cell phone", "android", "iphone"],
    laptop: ["laptop", "notebook", "computer", "pc", "macbook"],
  };
  const hasCategoryKeyword = Object.values(CATEGORY_KEYWORDS).some(
    (kws) => kws.some((kw) => lower.includes(kw))
  );
  if (!hasCategoryKeyword && /\d/.test(lower)) {
    const budgetLanguage = [
      /\b(?:budget|price|cost|spend)\b/i,
      /\b(?:make|set|change|increase|decrease|go|up|down)\b/i,
      /\b(?:to|upto|up to|under|over|above|below|around)\b/i,
      /₹/,
    ];
    if (budgetLanguage.some((p) => p.test(lower))) {
      return "budget";
    }
  }

  // Default: not a refinement
  return "normal";
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

  // If no category detected, fall back to current or first category
  const finalCategory =
    category ?? context.currentCategory ?? context.categories[0]?.category ?? "smartphone";

  // Resolve category config using finalCategory (not just detected category)
  const categoryConfig = context.categories.find(
    (c) => c.category === finalCategory
  );

  // Detect budget
  const budget = extractBudget(trimmed);

  // Detect refinement mode
  const refinementMode = detectRefinementMode(trimmed);

  // Detect priorities (only if we have a category config)
  // Pass refinement mode so exclusive queries get correct importance values
  const priorities = categoryConfig
    ? detectPriorities(trimmed, categoryConfig, refinementMode)
    : [];

  // Detect hard constraints (only if we have a category config)
  const constraints = categoryConfig
    ? extractConstraints(trimmed, categoryConfig)
    : [];

  // Determine confidence based on what was detected
  let confidence = 0.3;
  if (category) confidence += 0.3;
  if (budget) confidence += 0.2;
  if (priorities.length > 0) confidence += 0.15;
  if (constraints.length > 0) confidence += 0.05;

  const intent: ParsedShoppingIntent = {
    category: finalCategory,
    budget,
    priorities,
    constraints,
    confidence: Math.min(confidence, 0.9),
    originalQuery: trimmed,
  };

  // Attach refinement mode if not a fresh query
  if (refinementMode !== "normal") {
    intent.refinementMode = refinementMode;
  }

  return intent;
}
