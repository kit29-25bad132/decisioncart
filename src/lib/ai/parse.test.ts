// ============================================================
// DecisionCart — Parse Dispatcher Observability Tests
// Verifies AI/fallback metadata is produced deterministically.
// ============================================================

import { describe, it, expect, afterEach, vi } from "vitest";
import { parseShoppingQuery } from "./parse";
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
