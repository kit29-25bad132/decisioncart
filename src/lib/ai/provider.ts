// ============================================================
// DecisionCart — AI Provider
// Provider abstraction and OpenAI implementation.
// All AI calls are server-side only. Never exposed to client.
// ============================================================

import type {
  AIProvider,
  AIParseResult,
  ParsedShoppingIntent,
} from "./types";
import type { CategoryConfig } from "@/types";

// --- OpenAI Provider ---

class OpenAIProvider implements AIProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async parseShoppingQuery(
    query: string,
    categoryConfig: CategoryConfig,
    availableCategories: CategoryConfig[]
  ): Promise<AIParseResult> {
    try {
      const systemPrompt = buildSystemPrompt(
        categoryConfig,
        availableCategories
      );

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: query },
            ],
            temperature: 0,
            max_tokens: 500,
            response_format: { type: "json_object" },
          }),
          signal: AbortSignal.timeout(15000),
        }
      );

      if (!response.ok) {
        return {
          success: false,
          source: "ai",
          error: `AI API returned status ${response.status}`,
        };
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        return {
          success: false,
          source: "ai",
          error: "AI returned empty response",
        };
      }

      const parsed = JSON.parse(content);
      const intent = validateParsedIntent(
        parsed,
        categoryConfig,
        availableCategories
      );

      if (!intent) {
        return {
          success: false,
          source: "ai",
          error: "AI returned invalid structured data",
        };
      }

      return { success: true, source: "ai", intent };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown AI error";
      return { success: false, source: "ai", error: message };
    }
  }
}

// --- System Prompt Builder ---

function buildSystemPrompt(
  categoryConfig: CategoryConfig,
  availableCategories: CategoryConfig[]
): string {
  const categoryNames = availableCategories
    .map((c) => `- ${c.category}: ${c.label}`)
    .join("\n");

  const attributeDescriptions = categoryConfig.attributes
    .map(
      (a) =>
        `- "${a.key}" (${a.label}): ${a.description} [${a.comparisonDirection}]`
    )
    .join("\n");

  return `You are DecisionCart's intent parser. Parse shopping queries into structured JSON.

AVAILABLE CATEGORIES:
${categoryNames}

CURRENT CATEGORY ATTRIBUTES (${categoryConfig.label}):
${attributeDescriptions}

PRIORITY MAPPING RULES:
- "excellent", "best", "top", "great", "important", "must have" → importance 3 (high)
- "good", "decent", "nice" → importance 2 (medium)
- "doesn't matter", "not important", "low priority", "don't care" → importance 1 (low)
- If a criterion is not mentioned, do NOT include it in priorities

CATEGORY DETECTION:
- "phone", "smartphone", "mobile", "cell phone" → smartphone
- "laptop", "notebook", "computer", "pc" → laptop
- If ambiguous, use the current category from context

BUDGET DETECTION:
- "under 30000", "below 30k", "budget 30000", "₹30000" → max: 30000
- "above 50000", "over 50k" → min: 50000
- Currency is INR (₹)

OUTPUT FORMAT (strict JSON):
{
  "category": "smartphone",
  "budget": { "max": 30000 },
  "priorities": [
    { "attributeKey": "camera_score", "importance": 3 },
    { "attributeKey": "battery_mah", "importance": 3 }
  ],
  "constraints": [],
  "confidence": 0.85
}

Rules:
- Output ONLY valid JSON, no markdown
- Use attribute keys exactly as listed above
- Confidence: 0.0–1.0 based on how clear the query is
- For refinement queries (follow-ups), preserve unstated preferences from context`;
}

// --- Validation ---

function validateParsedIntent(
  raw: Record<string, unknown>,
  categoryConfig: CategoryConfig,
  availableCategories: CategoryConfig[]
): ParsedShoppingIntent | null {
  // Validate category
  const category = typeof raw.category === "string" ? raw.category : null;
  if (!category) return null;

  const validCategory = availableCategories.find(
    (c) => c.category === category
  );
  if (!validCategory) return null;

  // Validate budget
  let budget: { min?: number; max?: number } | undefined;
  if (raw.budget && typeof raw.budget === "object") {
    const b = raw.budget as Record<string, unknown>;
    budget = {};
    if (typeof b.max === "number" && b.max > 0) budget.max = b.max;
    if (typeof b.min === "number" && b.min > 0) budget.min = b.min;
    if (!budget.max && !budget.min) budget = undefined;
  }

  // Validate priorities against actual category attributes
  const validKeys = new Set(categoryConfig.attributes.map((a) => a.key));
  const priorities: { attributeKey: string; importance: number }[] = [];

  if (Array.isArray(raw.priorities)) {
    for (const p of raw.priorities) {
      if (
        typeof p === "object" &&
        p !== null &&
        typeof (p as Record<string, unknown>).attributeKey === "string" &&
        typeof (p as Record<string, unknown>).importance === "number"
      ) {
        const pk = p as { attributeKey: string; importance: number };
        if (validKeys.has(pk.attributeKey)) {
          const importance = Math.min(3, Math.max(1, Math.round(pk.importance)));
          priorities.push({ attributeKey: pk.attributeKey, importance });
        }
      }
    }
  }

  // Validate constraints
  type ConstraintType = "max_price" | "min_price" | "required_attribute" | "exclude_attribute";
  const validConstraintTypes: ConstraintType[] = ["max_price", "min_price", "required_attribute", "exclude_attribute"];
  const constraints: { type: ConstraintType; attributeKey?: string; value?: number | boolean | string }[] = [];

  if (Array.isArray(raw.constraints)) {
    for (const c of raw.constraints) {
      if (typeof c === "object" && c !== null) {
        const ct = c as Record<string, unknown>;
        if (typeof ct.type === "string" && validConstraintTypes.includes(ct.type as ConstraintType)) {
          constraints.push({
            type: ct.type as ConstraintType,
            attributeKey: typeof ct.attributeKey === "string" ? ct.attributeKey : undefined,
            value: ct.value as number | boolean | string | undefined,
          });
        }
      }
    }
  }

  const confidence =
    typeof raw.confidence === "number"
      ? Math.min(1, Math.max(0, raw.confidence))
      : 0.5;

  return {
    category,
    budget,
    priorities,
    constraints,
    confidence,
    originalQuery: "",
  };
}

// --- Gemini Provider ---

class GeminiProvider implements AIProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async parseShoppingQuery(
    query: string,
    categoryConfig: CategoryConfig,
    availableCategories: CategoryConfig[]
  ): Promise<AIParseResult> {
    try {
      const systemPrompt = buildSystemPrompt(
        categoryConfig,
        availableCategories
      );

      const endpoint =
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: query }],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        return {
          success: false,
          source: "ai",
          error: `Gemini API returned status ${response.status}`,
        };
      }

      const data = await response.json();
      const content =
        data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!content) {
        return {
          success: false,
          source: "ai",
          error: "Gemini returned empty response",
        };
      }

      const parsed = JSON.parse(content);
      const intent = validateParsedIntent(
        parsed,
        categoryConfig,
        availableCategories
      );

      if (!intent) {
        return {
          success: false,
          source: "ai",
          error: "Gemini returned invalid structured data",
        };
      }

      return { success: true, source: "ai", intent };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown Gemini error";
      return { success: false, source: "ai", error: message };
    }
  }
}

// --- Provider Factory ---

let cachedProvider: AIProvider | null = null;

/** Reset the cached provider. Exported for test-only use. */
export function _resetProviderForTesting(): void {
  cachedProvider = null;
}

export function getAIProvider(): AIProvider | null {
  if (cachedProvider) return cachedProvider;

  const provider = process.env.AI_PROVIDER;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;

  if (!provider || !apiKey || !model) return null;
  if (apiKey === "your_ai_api_key_here") return null;

  if (provider === "openai") {
    cachedProvider = new OpenAIProvider(apiKey, model);
    return cachedProvider;
  }

  if (provider === "gemini") {
    cachedProvider = new GeminiProvider(apiKey, model);
    return cachedProvider;
  }

  // Future providers can be added here
  return null;
}
