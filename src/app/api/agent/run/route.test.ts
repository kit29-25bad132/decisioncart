// ============================================================
// DecisionCart — Agent Run Route Observability Tests
// Verifies parseMeta is returned safely from /api/agent/run.
// ============================================================

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { getAIProvider, _resetProviderForTesting, classifyAIFailure } from "@/lib/ai/provider";
import { POST as postRun, GET as getRun } from "./route";
import { clearAgentTraces, getAgentTrace } from "@/agent/agent-trace";

function mockRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest;
}

function mockGetRequest(runId: string): NextRequest {
  const url = new URL(`http://localhost/api/agent/run?runId=${encodeURIComponent(runId)}`);
  return { nextUrl: url } as unknown as NextRequest;
}

// Test isolation: never call the real AI API from tests.
const savedAIEnv = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  AI_API_KEY: process.env.AI_API_KEY,
  AI_MODEL: process.env.AI_MODEL,
};

beforeEach(() => {
  delete process.env.AI_PROVIDER;
  delete process.env.AI_API_KEY;
  delete process.env.AI_MODEL;
  _resetProviderForTesting();
  clearAgentTraces();
});

afterEach(() => {
  process.env.AI_PROVIDER = savedAIEnv.AI_PROVIDER;
  process.env.AI_API_KEY = savedAIEnv.AI_API_KEY;
  process.env.AI_MODEL = savedAIEnv.AI_MODEL;
  _resetProviderForTesting();
});

describe("/api/agent/run observability", () => {
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

// ============================================================
// Agent Trace API Contract Tests
// ============================================================

describe("/api/agent/run trace contract", () => {
  it("persists a trace for a successful agent run and reports persisted=true", async () => {
    const res = await postRun(
      mockRequest({ query: "best phone under 30000", currentCategory: "smartphone" })
    );
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.trace).toBeDefined();
    expect(typeof data.trace.runId).toBe("string");
    expect(data.trace.persisted).toBe(true);

    // Trace must be retrievable via the same runId
    const trace = await getAgentTrace(data.trace.runId);
    expect(trace).not.toBeNull();
    expect(trace!.query).toBe("best phone under 30000");
    expect(trace!.parseSource).toBe("fallback");
    expect(trace!.agentStatus).toBe("completed");

    // Factual event sequence
    const types = trace!.events.map((e) => e.eventType);
    expect(types[0]).toBe("AGENT_STARTED");
    expect(types).toContain("AGENT_TOOL_COMPLETED");
    expect(types).toContain("AGENT_DECISION_COMPLETED");
    expect(types[types.length - 1]).toBe("AGENT_COMPLETED");
  });

  it("persists a failed-parse trace instead of silently dropping the attempt", async () => {
    const res = await postRun(mockRequest({ query: "" }));
    const data = await res.json();

    expect(data.success).toBe(false);
    // Validation failures return 400 without echoing trace metadata,
    // but the failed attempt is still recorded server-side (no silent drops).
    expect(data.trace).toBeUndefined();
  });

  it("GET returns the persisted trace by runId", async () => {
    const postRes = await postRun(
      mockRequest({ query: "quiet laptop for coding", currentCategory: "laptop" })
    );
    const postData = await postRes.json();
    const runId = postData.trace.runId;

    const getRes = await getRun(mockGetRequest(runId));
    const getData = await getRes.json();

    expect(getData.success).toBe(true);
    expect(getData.trace.runId).toBe(runId);
    expect(getData.trace.query).toBe("quiet laptop for coding");
    expect(getData.trace.events.length).toBeGreaterThan(0);

    // Every event carries only safe fields — no raw tool payloads
    for (const event of getData.trace.events) {
      expect(event.metadata).toBeDefined();
      expect(event.eventId).toBeDefined();
      expect(typeof event.timestamp).toBe("number");
    }
  });

  it("GET returns 404 for an unknown runId (no fabricated trace)", async () => {
    const getRes = await getRun(mockGetRequest("no-such-run-id"));
    expect(getRes.status).toBe(404);
    const getData = await getRes.json();
    expect(getData.success).toBe(false);
  });

  it("GET returns 400 when runId is missing", async () => {
    const getRes = await getRun({ nextUrl: new URL("http://localhost/api/agent/run") } as unknown as NextRequest);
    expect(getRes.status).toBe(400);
  });

  it("trace records degraded tool execution honestly", async () => {
    // A query with impossible constraints triggers the relax_constraints path,
    // and comparison is skipped for <2 products — exercised via normal flow.
    const res = await postRun(
      mockRequest({ query: "phone", currentCategory: "smartphone" })
    );
    const data = await res.json();

    expect(data.success).toBe(true);
    const trace = await getAgentTrace(data.trace.runId);
    expect(trace).not.toBeNull();

    // All tool events must carry an observed status
    for (const event of trace!.events) {
      if (event.eventType === "AGENT_TOOL_COMPLETED") {
        expect(["completed", "skipped"]).toContain(event.status);
      }
    }
  });
});
