// ============================================================
// DecisionCart — Agent Trace Tests
// Verifies factual trace building, honest persistence, and
// secret/reasoning hygiene.
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import {
  buildAgentTrace,
  buildDecisionTraceSummary,
  saveAgentTrace,
  getAgentTrace,
  clearAgentTraces,
  _agentTraceStoreInternal,
  _MAX_AGENT_TRACES,
} from "./agent-trace";
import type { AgentResult, AgentStep } from "./agent-types";

// --- Helpers ---

/** Build a minimal successful AgentResult with the standard 7 tools. */
function successfulAgentResult(overrides?: Partial<AgentResult>): AgentResult {
  const steps: AgentStep[] = [
    {
      id: "step-1-search_catalog",
      tool: "search_catalog",
      status: "completed",
      label: "Search catalog for matching products",
      startedAt: 1000,
      completedAt: 1050,
      inputSummary: 'category="smartphone", maxBudget=30000',
      outputSummary: "6 products found",
    },
    {
      id: "step-2-analyze_reviews",
      tool: "analyze_reviews",
      status: "completed",
      label: "Analyze product review intelligence",
      startedAt: 1050,
      completedAt: 1060,
      inputSummary: "6 products from catalog",
      outputSummary: "✓ 6 products analyzed",
    },
    {
      id: "step-3-run_decision",
      tool: "run_decision",
      status: "completed",
      label: "Run deterministic decision engine",
      startedAt: 1060,
      completedAt: 1070,
      inputSummary: '6 products, category="smartphone"',
      outputSummary: "6 products scored, top ranked",
    },
  ];

  return {
    status: "completed",
    parsedIntent: {
      category: "smartphone",
      budget: { max: 30000 },
      priorities: [{ attributeKey: "camera_score", importance: 3 }],
      constraints: [],
      confidence: 0.85,
      originalQuery: "Best phone under 30000",
    },
    steps,
    decisionResult: {
      success: true,
      effectiveCategory: "smartphone",
      outputSummary: "6 products scored",
      decisionResult: {
        scoredProducts: [
          {
            product: {
              id: "phone-003",
              name: "OnePlus Nord 4",
              brand: "OnePlus",
              category: "smartphone",
              price: 26999,
              attributes: { ram_gb: 12 },
              confidence: { ram_gb: "high" },
            },
            totalScore: 78.5,
            rank: 1,
            contributions: [],
            missingAttributes: [],
            strengths: ["Camera Quality", "Battery Life"],
            weaknesses: ["Display Size"],
            dataConfidence: "high",
          },
        ],
        tradeOffs: [
          {
            criterionKey: "camera_score",
            criterionLabel: "Camera Quality",
            winnerProductId: "phone-003",
            winnerProductName: "OnePlus Nord 4",
            score: 92,
          },
        ],
        querySummary: "Category: Smartphone · Budget: Under ₹30,000",
        categoryLabel: "Smartphone",
        weights: {},
        priorities: [{ attributeKey: "camera_score", importance: 3 }],
        budget: { max: 30000 },
      },
    },
    ...overrides,
  };
}

/** Build a failed tool step for a run that fails at run_decision. */
function failedToolResult(): AgentResult {
  const base = successfulAgentResult();
  const steps: AgentStep[] = [
    base.steps[0],
    {
      id: "step-3-run_decision",
      tool: "run_decision",
      status: "failed",
      label: "Run deterministic decision engine",
      startedAt: 1060,
      completedAt: 1075,
      inputSummary: "6 products, category=\"smartphone\"",
      outputSummary: "Decision runner failed",
      error: "No category config found for \"smartphone\"",
    },
  ];
  return { ...base, status: "failed", steps, error: "No category config found", decisionResult: undefined };
}

// --- Tests ---

describe("buildAgentTrace", () => {
  beforeEach(() => {
    clearAgentTraces();
  });

  it("generates the full event sequence for a successful run", () => {
    const trace = buildAgentTrace({
      runId: "run-1",
      query: "Best phone under 30000",
      parseSource: "fallback",
      agentResult: successfulAgentResult(),
    });

    const types = trace.events.map((e) => e.eventType);

    expect(types[0]).toBe("AGENT_STARTED");
    expect(types).toContain("AGENT_TOOL_STARTED");
    expect(types).toContain("AGENT_TOOL_COMPLETED");
    expect(types).toContain("AGENT_DECISION_COMPLETED");
    expect(types[types.length - 1]).toBe("AGENT_COMPLETED");

    // No failure events on a successful run
    expect(types).not.toContain("AGENT_TOOL_FAILED");
    expect(types).not.toContain("AGENT_FAILED");

    expect(trace.agentStatus).toBe("completed");
    expect(trace.runId).toBe("run-1");
    expect(trace.query).toBe("Best phone under 30000");
    expect(trace.parseSource).toBe("fallback");
  });

  it("produces AGENT_TOOL_FAILED and AGENT_FAILED for a failed tool", () => {
    const trace = buildAgentTrace({
      runId: "run-2",
      query: "q",
      parseSource: "fallback",
      agentResult: failedToolResult(),
    });

    const types = trace.events.map((e) => e.eventType);
    expect(types).toContain("AGENT_TOOL_FAILED");
    expect(types[types.length - 1]).toBe("AGENT_FAILED");
    expect(trace.agentStatus).toBe("failed");

    // The failed event carries the tool name and error
    const failedEvent = trace.events.find((e) => e.eventType === "AGENT_TOOL_FAILED");
    expect(failedEvent?.tool).toBe("run_decision");
    expect(failedEvent?.error).toContain("No category config");
  });

  it("records duration for steps with start and end timestamps", () => {
    const trace = buildAgentTrace({
      runId: "run-3",
      query: "q",
      parseSource: "ai",
      agentResult: successfulAgentResult(),
    });

    const searchCompleted = trace.events.find(
      (e) => e.eventType === "AGENT_TOOL_COMPLETED" && e.tool === "search_catalog"
    );
    expect(searchCompleted?.durationMs).toBe(50);
  });

  it("represents degraded steps with the degraded flag", () => {
    const result = successfulAgentResult();
    result.steps = [
      ...result.steps,
      {
        id: "step-4-merchant",
        tool: "get_merchant_offers",
        status: "completed",
        degraded: true,
        label: "Evaluate merchant offers",
        startedAt: 1070,
        completedAt: 1080,
        outputSummary: "Merchant evaluation skipped: no offers.",
      },
    ];

    const trace = buildAgentTrace({
      runId: "run-4",
      query: "q",
      parseSource: "ai",
      agentResult: result,
    });

    const degradedEvents = trace.events.filter((e) => e.tool === "get_merchant_offers");
    expect(degradedEvents.length).toBeGreaterThan(0);
    for (const e of degradedEvents) {
      expect(e.degraded).toBe(true);
    }
  });

  it("marks parseSource=fallback so the UI never claims AI was used", () => {
    const trace = buildAgentTrace({
      runId: "run-5",
      query: "q",
      parseSource: "fallback",
      agentResult: successfulAgentResult(),
    });

    expect(trace.parseSource).toBe("fallback");

    const started = trace.events.find((e) => e.eventType === "AGENT_STARTED");
    expect(started?.metadata.parseSource).toBe("fallback");
  });

  it("never persists secrets, API keys, or chain-of-thought", () => {
    const result = successfulAgentResult({
      // Inject hostile-looking content into every free-text field
      error: "RAZORPAY_KEY_SECRET=supersecret AI_API_KEY=sk-abc123",
    } as Partial<AgentResult>);
    result.steps = result.steps.map((s) => ({
      ...s,
      inputSummary: "category=smartphone", // orchestrator summaries only
      outputSummary: "6 products found",
    }));

    const trace = buildAgentTrace({
      runId: "run-6",
      query: "my query",
      parseSource: "ai",
      agentResult: result,
    });

    const serialized = JSON.stringify(trace);

    // The trace only contains what the builder put in — no secret env values
    expect(serialized).not.toContain("sk-");
    expect(serialized.toLowerCase()).not.toContain("razorpay_key_secret=");
    expect(serialized.toLowerCase()).not.toContain("ai_api_key=");

    // No raw tool payloads or model output fields exist on events.
    // Filter by defined values on both sides: JSON.stringify drops
    // undefined-valued keys, so this matches what is actually persisted.
    const allowedKeys = [
      "degraded",
      "durationMs",
      "error",
      "eventId",
      "eventType",
      "inputSummary",
      "metadata",
      "outputSummary",
      "runId",
      "status",
      "timestamp",
      "tool",
    ];
    for (const event of trace.events) {
      const eventRecord = event as unknown as Record<string, unknown>;
      const presentKeys = Object.keys(event).filter(
        (k) => eventRecord[k] !== undefined
      );
      expect(presentKeys.sort()).toEqual(
        allowedKeys.filter((k) => eventRecord[k] !== undefined).sort()
      );
    }
  });

  it("handles a malformed agent result without throwing", () => {
    const trace = buildAgentTrace({
      runId: "run-7",
      query: "q",
      parseSource: "fallback",
      agentResult: {
        status: "failed",
        parsedIntent: { category: "", budget: undefined, priorities: [], constraints: [], confidence: 0, originalQuery: "" },
        steps: [],
        error: "Missing parsed intent",
      },
    });

    expect(trace.events[0].eventType).toBe("AGENT_STARTED");
    expect(trace.events[trace.events.length - 1].eventType).toBe("AGENT_FAILED");
    expect(trace.agentStatus).toBe("failed");
  });
});

describe("buildDecisionTraceSummary", () => {
  it("extracts factual decision data from a successful result", () => {
    const summary = buildDecisionTraceSummary(successfulAgentResult());

    expect(summary).not.toBeNull();
    expect(summary!.topProductId).toBe("phone-003");
    expect(summary!.topScore).toBe(78.5);
    expect(summary!.scoredProductCount).toBe(1);
    expect(summary!.categoryLabel).toBe("Smartphone");
    expect(summary!.budgetMax).toBe(30000);
    expect(summary!.topStrengths).toContain("Camera Quality");
    expect(summary!.topWeaknesses).toContain("Display Size");
    expect(summary!.tradeOffs[0].winnerProductName).toBe("OnePlus Nord 4");
    expect(summary!.priorityCount).toBe(1);
    expect(summary!.constraintCount).toBe(0);
  });

  it("returns null when the decision engine produced nothing", () => {
    const result = successfulAgentResult();
    result.decisionResult = undefined;

    expect(buildDecisionTraceSummary(result)).toBeNull();
  });

  it("returns null when scored products are empty", () => {
    const result = successfulAgentResult();
    result.decisionResult!.decisionResult!.scoredProducts = [];

    expect(buildDecisionTraceSummary(result)).toBeNull();
  });
});

describe("agent trace persistence (honest)", () => {
  beforeEach(() => {
    clearAgentTraces();
  });

  it("reports persisted=true when the write succeeds", async () => {
    const trace = buildAgentTrace({
      runId: "persist-1",
      query: "q",
      parseSource: "ai",
      agentResult: successfulAgentResult(),
    });

    const result = await saveAgentTrace(trace);

    expect(result.persisted).toBe(true);
    expect(result.runId).toBe("persist-1");
    expect(result.error).toBeUndefined();

    const retrieved = await getAgentTrace("persist-1");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.events.length).toBe(trace.events.length);
  });

  it("returns null for an unknown runId (no fake trace)", async () => {
    const retrieved = await getAgentTrace("never-persisted-id");
    expect(retrieved).toBeNull();
  });

  it("evicts the oldest trace when the store cap is reached", async () => {
    // Fill beyond the cap
    for (let i = 0; i < _MAX_AGENT_TRACES + 5; i++) {
      const trace = buildAgentTrace({
        runId: `cap-${i}`,
        query: "q",
        parseSource: "fallback",
        agentResult: successfulAgentResult(),
      });
      await saveAgentTrace(trace);
    }

    expect(_agentTraceStoreInternal.size()).toBe(_MAX_AGENT_TRACES);

    // Oldest records must be evicted
    expect(await getAgentTrace("cap-0")).toBeNull();
    // Newest records must survive
    expect(await getAgentTrace(`cap-${_MAX_AGENT_TRACES + 4}`)).not.toBeNull();
  });
});
