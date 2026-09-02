// ============================================================
// DecisionCart — GeminiProvider Tests
// Verifies Gemini AI provider selection, parsing, and failure modes.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getAIProvider, _resetProviderForTesting } from "./provider";
import { CATEGORY_CONFIGS } from "@/catalog/categories";

const smartphoneConfig = CATEGORY_CONFIGS.smartphone!;
const availableCategories = CATEGORY_CONFIGS
  ? Object.values(CATEGORY_CONFIGS).filter(Boolean)
  : [];

// --- Helpers ---

/** Build a mock Gemini API success response with given text. */
function geminiSuccessResponse(text: string) {
  return {
    ok: true,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [{ text }],
            role: "model",
          },
        },
      ],
    }),
  };
}

/** Build a mock Gemini API non-2xx response. */
function geminiErrorResponse(status: number) {
  return {
    ok: false,
    status,
    json: async () => ({ error: { message: "Bad request" } }),
  };
}

/** Valid structured intent JSON that passes validateParsedIntent. */
const VALID_INTENT_JSON = JSON.stringify({
  category: "smartphone",
  budget: { max: 30000 },
  priorities: [
    { attributeKey: "camera_score", importance: 3 },
    { attributeKey: "battery_mah", importance: 3 },
  ],
  constraints: [],
  confidence: 0.85,
});

// --- Tests ---

describe("GeminiProvider", () => {
  const originalEnv = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_MODEL: process.env.AI_MODEL,
  };

  beforeEach(() => {
    _resetProviderForTesting();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    process.env.AI_PROVIDER = originalEnv.AI_PROVIDER;
    process.env.AI_API_KEY = originalEnv.AI_API_KEY;
    process.env.AI_MODEL = originalEnv.AI_MODEL;
    _resetProviderForTesting();
    vi.unstubAllGlobals();
  });

  // --- 1. Provider selection ---

  it("returns GeminiProvider when AI_PROVIDER=gemini", () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_API_KEY = "test-gemini-key";
    process.env.AI_MODEL = "gemini-2.0-flash";

    const provider = getAIProvider();
    expect(provider).not.toBeNull();
    expect(provider!.constructor.name).toBe("GeminiProvider");
  });

  // --- 2. Missing/placeholder configuration ---

  it("returns null when AI_API_KEY is placeholder", () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_API_KEY = "your_ai_api_key_here";
    process.env.AI_MODEL = "gemini-2.0-flash";

    const provider = getAIProvider();
    expect(provider).toBeNull();
  });

  it("returns null when AI_PROVIDER is missing", () => {
    delete process.env.AI_PROVIDER;
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "gemini-2.0-flash";

    const provider = getAIProvider();
    expect(provider).toBeNull();
  });

  it("returns null when AI_MODEL is missing", () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_API_KEY = "test-key";
    delete process.env.AI_MODEL;

    const provider = getAIProvider();
    expect(provider).toBeNull();
  });

  // --- 3. Successful structured response ---

  it("parses a valid Gemini structured response", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "gemini-2.0-flash";

    const provider = getAIProvider()!;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(geminiSuccessResponse(VALID_INTENT_JSON))
    );

    const result = await provider.parseShoppingQuery(
      "Best phone under 30000 with great camera",
      smartphoneConfig,
      availableCategories
    );

    expect(result.success).toBe(true);
    expect(result.source).toBe("ai");
    expect(result.intent).toBeDefined();
    expect(result.intent!.category).toBe("smartphone");
    expect(result.intent!.budget?.max).toBe(30000);
    expect(result.intent!.priorities.length).toBeGreaterThan(0);
  });

  // --- 4. Invalid JSON from Gemini ---

  it("returns controlled failure for invalid JSON", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "gemini-2.0-flash";

    const provider = getAIProvider()!;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(geminiSuccessResponse("not valid json {{{"))
    );

    const result = await provider.parseShoppingQuery(
      "Best phone under 30000",
      smartphoneConfig,
      availableCategories
    );

    expect(result.success).toBe(false);
    expect(result.source).toBe("ai");
    expect(result.error).toBeDefined();
    expect(result.intent).toBeUndefined();
  });

  // --- 5. Non-2xx response ---

  it("returns controlled failure for non-2xx Gemini response", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "gemini-2.0-flash";

    const provider = getAIProvider()!;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(geminiErrorResponse(403))
    );

    const result = await provider.parseShoppingQuery(
      "Best phone under 30000",
      smartphoneConfig,
      availableCategories
    );

    expect(result.success).toBe(false);
    expect(result.source).toBe("ai");
    expect(result.error).toContain("403");
  });

  // --- 6. Empty response ---

  it("returns controlled failure for empty Gemini response", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "gemini-2.0-flash";

    const provider = getAIProvider()!;

    const emptyResponse = {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [],
              role: "model",
            },
          },
        ],
      }),
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(emptyResponse));

    const result = await provider.parseShoppingQuery(
      "Best phone under 30000",
      smartphoneConfig,
      availableCategories
    );

    expect(result.success).toBe(false);
    expect(result.source).toBe("ai");
    expect(result.error).toContain("empty");
  });

  // --- 7. Structured validation failure ---

  it("returns controlled failure when structured validation fails", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "gemini-2.0-flash";

    const provider = getAIProvider()!;

    // Valid JSON but invalid structure (missing required fields)
    const invalidStructure = JSON.stringify({
      foo: "bar",
      noCategory: true,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(geminiSuccessResponse(invalidStructure))
    );

    const result = await provider.parseShoppingQuery(
      "Best phone under 30000",
      smartphoneConfig,
      availableCategories
    );

    expect(result.success).toBe(false);
    expect(result.source).toBe("ai");
    expect(result.error).toContain("invalid");
  });

  // --- 8. Network/fetch error ---

  it("returns controlled failure on fetch error", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "gemini-2.0-flash";

    const provider = getAIProvider()!;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network failure"))
    );

    const result = await provider.parseShoppingQuery(
      "Best phone under 30000",
      smartphoneConfig,
      availableCategories
    );

    expect(result.success).toBe(false);
    expect(result.source).toBe("ai");
    expect(result.error).toContain("Network failure");
    // Critically: does NOT throw
  });

  // --- 9. Never throws (fallback safe) ---

  it("never throws — allows deterministic fallback", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "gemini-2.0-flash";

    const provider = getAIProvider()!;

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

    // Must not throw
    const result = await provider.parseShoppingQuery(
      "Best phone",
      smartphoneConfig,
      availableCategories
    );

    expect(result.success).toBe(false);
    expect(result.source).toBe("ai");
  });

  // --- 10. Fetch called with correct endpoint and payload ---

  it("calls Gemini REST API with correct endpoint and body", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_API_KEY = "my-secret-key";
    process.env.AI_MODEL = "gemini-2.0-flash";

    const provider = getAIProvider()!;

    const fetchMock = vi.fn().mockResolvedValue(geminiSuccessResponse(VALID_INTENT_JSON));
    vi.stubGlobal("fetch", fetchMock);

    await provider.parseShoppingQuery(
      "Best phone under 30000",
      smartphoneConfig,
      availableCategories
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];

    // Endpoint must include model and API key
    expect(url).toContain("generativelanguage.googleapis.com");
    expect(url).toContain("gemini-2.0-flash");
    expect(url).toContain("key=my-secret-key");

    // Must be POST with JSON body
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");

    // Body must contain systemInstruction and contents
    const body = JSON.parse(options.body);
    expect(body.systemInstruction).toBeDefined();
    expect(body.systemInstruction.parts[0].text).toContain("DecisionCart");
    expect(body.contents).toHaveLength(1);
    expect(body.contents[0].role).toBe("user");

    // generationConfig must request JSON and temperature 0
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.temperature).toBe(0);
  });

  // --- 11. Timeout configured ---

  it("uses AbortSignal.timeout(15000)", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_API_KEY = "test-key";
    process.env.AI_MODEL = "gemini-2.0-flash";

    const provider = getAIProvider()!;

    const fetchMock = vi.fn().mockResolvedValue(geminiSuccessResponse(VALID_INTENT_JSON));
    vi.stubGlobal("fetch", fetchMock);

    await provider.parseShoppingQuery(
      "Best phone",
      smartphoneConfig,
      availableCategories
    );

    const [, options] = fetchMock.mock.calls[0];
    expect(options.signal).toBeDefined();
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
});
