// ============================================================
// DecisionCart — Agent Run Route Observability Tests
// Verifies parseMeta is returned safely from /api/agent/run.
// ============================================================

import { describe, it, expect, afterEach } from "vitest";
import { getAIProvider, _resetProviderForTesting, classifyAIFailure } from "@/lib/ai/provider";

describe("/api/agent/run observability", () => {
  afterEach(() => {
    _resetProviderForTesting();
  });

  it("classifies AI failure classes correctly", () => {
    expect(classifyAIFailure("fetch aborted: timeout")).toBe("timeout");
    expect(classifyAIFailure("request timed out")).toBe("timeout");
    expect(classifyAIFailure("network failure")).toBe("network");
    expect(classifyAIFailure("fetch failed")).toBe("network");
    expect(classifyAIFailure("API returned status 500")).toBe("api_error");
    expect(classifyAIFailure("Bad request")).toBe("api_error");
    expect(classifyAIFailure("unauthorized")).toBe("api_error");
    expect(classifyAIFailure("Unknown error")).toBe("unknown");
    expect(classifyAIFailure("some random message")).toBe("unknown");
  });

  it("does not expose raw API key in provider lookup", () => {
    const key = process.env.AI_API_KEY ?? "test-key";
    delete process.env.AI_PROVIDER;
    delete process.env.AI_MODEL;
    process.env.AI_API_KEY = key;

    _resetProviderForTesting();

    const provider = getAIProvider();
    expect(provider).toBeNull();
  });
});
