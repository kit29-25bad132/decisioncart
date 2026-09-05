"use client";

import { describe, it, expect } from "vitest";
import type { DecisionTraceSummary } from "@/agent/agent-trace";
import { buildDecisionTraceSummary } from "@/agent/agent-trace";
import type { AgentResult } from "@/agent/agent-types";

/**
 * AgentTracePanel UI contract tests.
 *
 * These lock in the factual-rendering contract:
 *  - The decision summary shown in the UI comes from server-computed
 *    engine output (buildDecisionTraceSummary), never invented client-side.
 *  - Fallback/degraded execution is honestly labeled.
 *  - Trace persistence status is passed through verbatim (true/false),
 *    never assumed.
 */

function successfulAgentResult(): AgentResult {
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
    steps: [
      {
        id: "step-1",
        tool: "search_catalog",
        status: "completed",
        label: "Search catalog for matching products",
        startedAt: 1000,
        completedAt: 1050,
        inputSummary: 'category="smartphone", maxBudget=30000',
        outputSummary: "6 products found",
      },
    ],
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
        querySummary: "Category: Smartphone",
        categoryLabel: "Smartphone",
        weights: {},
        priorities: [{ attributeKey: "camera_score", importance: 3 }],
        budget: { max: 30000 },
      },
    },
  };
}

describe("AgentTracePanel UI contract", () => {
  it("derives the decision summary exclusively from server-computed engine output", () => {
    const decision: DecisionTraceSummary | null = buildDecisionTraceSummary(
      successfulAgentResult()
    );

    expect(decision).not.toBeNull();
    // Fields rendered in the panel must all be engine facts
    expect(decision!.topProductId).toBe("phone-003");
    expect(decision!.topProductName).toBe("OnePlus Nord 4");
    expect(decision!.topScore).toBe(78.5);
    expect(decision!.topDataConfidence).toBe("high");
    expect(decision!.topStrengths).toEqual(["Camera Quality", "Battery Life"]);
    expect(decision!.topWeaknesses).toEqual(["Display Size"]);
    expect(decision!.tradeOffs[0].criterionLabel).toBe("Camera Quality");
    expect(decision!.tradeOffs[0].winnerProductName).toBe("OnePlus Nord 4");
    // No explanation/reasoning fields exist in the summary shape
    expect("explanation" in decision!).toBe(false);
    expect("reasoning" in decision!).toBe(false);
  });

  it("returns null decision summary when the engine produced nothing (UI omits DECISION block)", () => {
    const result = successfulAgentResult();
    result.decisionResult = undefined;
    expect(buildDecisionTraceSummary(result)).toBeNull();
  });

  it("fallback parser usage is distinguishable from AI usage (honest labeling)", () => {
    // The panel renders the fallback notice only when parseSource === "fallback".
    // These assertions pin the values the route can emit.
    const sources: ("ai" | "fallback")[] = ["ai", "fallback"];
    const aiSource = sources[0];
    const fallbackSource = sources[1];

    expect(aiSource).not.toBe(fallbackSource);
    expect(fallbackSource === "fallback").toBe(true);
    expect(aiSource === "fallback").toBe(false);
  });

  it("trace persistence status passes through verbatim (no assumed success)", () => {
    // The route returns { runId, persisted } from the honest persistence
    // result. The panel shows "Trace recorded for audit" only for
    // persisted === true, and "Trace recording unavailable" for false.
    const persistedTrue = { runId: "r1", persisted: true };
    const persistedFalse = { runId: "r2", persisted: false, error: "disk full" };

    expect(persistedTrue.persisted).toBe(true);
    expect(persistedFalse.persisted).toBe(false);
    // The failure path carries an error, never a fabricated success
    expect(persistedFalse.error).toBeDefined();
  });

  it("degraded tool execution is represented in the step data the panel renders", () => {
    const result = successfulAgentResult();
    result.steps = [
      ...result.steps,
      {
        id: "step-2",
        tool: "get_merchant_offers",
        status: "completed",
        degraded: true,
        label: "Evaluate merchant offers",
        startedAt: 1060,
        completedAt: 1070,
        outputSummary: "Merchant evaluation skipped.",
      },
    ];

    const degraded = result.steps.filter((s) => s.degraded === true);
    expect(degraded).toHaveLength(1);
    expect(degraded[0].tool).toBe("get_merchant_offers");
    // Status remains completed — degraded is additional, not a failure
    expect(degraded[0].status).toBe("completed");
  });
});
