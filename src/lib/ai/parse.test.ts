// ============================================================
// DecisionCart — Parse Dispatcher Observability Tests
// Verifies AI/fallback metadata is produced deterministically.
// ============================================================

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { parseShoppingQuery } from "./parse";
import { _resetProviderForTesting } from "./provider";
import { getAllCategoryConfigs } from "@/catalog/category-resolver";
import type { ParserContext } from "./types";

function makeContext(currentCategory?: string, currentPreferences?: ParserContext["currentPreferences"]): ParserContext {
  return {
    categories: getAllCategoryConfigs(),
    currentCategory,
    currentPreferences,
  };
}

export {};

// ============================================================
// Dispatcher path-selection tests
// Prove the contract: no provider → immediate fallback (no awaits,
// no network); provider configured → AI attempted; AI failure →
// graceful fallback; refinement merge unchanged.
// ============================================================
describe("parseShoppingQuery dispatcher path selection", () => {
  const savedEnv = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_MODEL: process.env.AI_MODEL,
  };

  beforeEach(() => {
    delete process.env.AI_PROVIDER;
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL;
    _resetProviderForTesting();
  });

  afterEach(() => {
    process.env.AI_PROVIDER = savedEnv.AI_PROVIDER;
    process.env.AI_API_KEY = savedEnv.AI_API_KEY;
    process.env.AI_MODEL = savedEnv.AI_MODEL;
    _resetProviderForTesting();
    vi.unstubAllGlobals();
  });

  it("falls back immediately when no provider is configured (no awaits, no network)", async () => {
    // Prove immediacy: with fake timers, any hidden retry/timeout would
    // deadlock this call. Passing without advancing timers proves the
    // no-provider path is synchronous-to-first-result.
    vi.useFakeTimers();
    try {
      const result = await parseShoppingQuery("best phone under 30000", makeContext());

      expect(result.success).toBe(true);
      expect(result.source).toBe("fallback");
      expect(result.fallbackUsed).toBe(true);
      expect(result.aiAttempted).toBe(false);
      expect(result.aiAvailable).toBe(false);
      expect(result.aiFailureClass).toBeUndefined();
      expect(result.intent).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("still attempts the AI path when a provider is configured", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "gemini-2.0-flash";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    category: "smartphone",
                    budget: { max: 30000 },
                    priorities: [{ attributeKey: "camera_score", importance: 3 }],
                    constraints: [],
                    confidence: 0.9,
                  }),
                },
              ],
              role: "model",
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await parseShoppingQuery("best phone under 30000", makeContext());

    // AI path must actually have been attempted and used
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("ai");
    expect(result.aiAttempted).toBe(true);
    expect(result.aiAvailable).toBe(true);
    expect(result.aiProvider).toBe("gemini");
    expect(result.fallbackUsed).toBe(false);
    expect(result.intent?.category).toBe("smartphone");
  });

  it("falls back gracefully when the configured AI call fails", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "gemini-2.0-flash";

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch aborted: timeout")));

    const result = await parseShoppingQuery("best phone under 30000", makeContext());

    expect(result.success).toBe(true);
    expect(result.source).toBe("fallback");
    expect(result.fallbackUsed).toBe(true);
    expect(result.aiAttempted).toBe(true);
    expect(result.aiAvailable).toBe(true);
    expect(result.aiProvider).toBe("gemini");
    expect(result.aiFailureClass).toBe("timeout");
    expect(result.intent).toBeDefined();
  });

  it("preserves refinement merge behavior end-to-end", async () => {
    // Step 1: initial query establishes budget
    const step1 = await parseShoppingQuery("Phone under ₹30,000 with 5G", makeContext());
    expect(step1.success).toBe(true);
    expect(step1.intent?.budget?.max).toBe(30000);

    // Step 2: exclusive refinement must merge with step 1 preferences
    const step2 = await parseShoppingQuery(
      "Actually just focus on camera",
      makeContext("smartphone", {
        category: "smartphone",
        budget: step1.intent?.budget,
        priorities: step1.intent?.priorities ?? [],
      })
    );

    expect(step2.success).toBe(true);
    expect(step2.intent?.category).toBe("smartphone");
    expect(step2.intent?.budget?.max).toBe(30000);
    expect(step2.intent?.refinementMode).toBe("exclusive");
    const camera = step2.intent?.priorities?.find((p) => p.attributeKey === "camera_score");
    expect(camera).toBeDefined();
    expect(camera?.importance).toBeGreaterThanOrEqual(2);
  });
});

describe("parseShoppingQuery observability", () => {
  const originalEnv = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_MODEL: process.env.AI_MODEL,
  };

  afterEach(() => {
    process.env.AI_PROVIDER = originalEnv.AI_PROVIDER;
    process.env.AI_API_KEY = originalEnv.AI_API_KEY;
    process.env.AI_MODEL = originalEnv.AI_MODEL;
  });

  it("reports no AI attempt when AI is not configured", async () => {
    delete process.env.AI_PROVIDER;
    delete process.env.AI_API_KEY;
    delete process.env.AI_MODEL;

    const result = await parseShoppingQuery("best phone under 30000", makeContext());

    expect(result.success).toBe(true);
    expect(result.source).toBe("fallback");
    expect(result.fallbackUsed).toBe(true);
    expect(result.aiAttempted).toBe(false);
    expect(result.aiAvailable).toBe(false);
    expect(result.aiProvider).toBeUndefined();
    expect(result.aiFailureClass).toBeUndefined();
    expect(result.intent).toBeDefined();
  });

  it("reports AI unavailable when provider is configured with a placeholder key", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_API_KEY = "your_ai_api_key_here";
    process.env.AI_MODEL = "gemini-2.0-flash";

    const result = await parseShoppingQuery(
      "best phone under 30000",
      makeContext()
    );

    expect(result.source).toBe("fallback");
    expect(result.fallbackUsed).toBe(true);
    expect(result.aiAttempted).toBe(false);
    expect(result.aiAvailable).toBe(false);
    expect(result.aiProvider).toBeUndefined();
  });

  it("reports fallback used with AI failure class when AI fails and fallback succeeds", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "gemini-2.0-flash";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("fetch aborted: timeout"));

    try {
      const result = await parseShoppingQuery(
        "best phone under 30000",
        makeContext()
      );

      expect(result.source).toBe("fallback");
      expect(result.fallbackUsed).toBe(true);
      expect(result.aiAttempted).toBe(true);
      expect(result.aiAvailable).toBe(true);
      expect(result.aiProvider).toBe("gemini");
      expect(result.aiFailureClass).toBe("timeout");
      expect(result.intent).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
