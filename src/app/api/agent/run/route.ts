// ============================================================
// DecisionCart — Agent Run API Route
// Server-side only. Never exposes secrets to client.
// Connects: Query → Parser → runAgent() → AgentResult
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { parseShoppingQuery } from "@/lib/ai/parse";
import { getAllCategoryConfigs } from "@/catalog/category-resolver";
import { runAgent } from "@/agent/orchestrator";
import type { ParserContext } from "@/lib/ai/types";
import type { AgentResult } from "@/agent/agent-types";
import {
  buildAgentTrace,
  saveAgentTrace,
  getAgentTrace,
  type AgentTracePersistResult,
} from "@/agent/agent-trace";

const MAX_QUERY_LENGTH = 500;

export async function POST(request: NextRequest) {
  // Every agent run gets a server-generated trace ID, including failed parses.
  const runId = crypto.randomUUID();

  try {
    // 1. Parse and validate request body
    const body = await request.json();
    const { query, currentCategory, currentPreferences } = body;

    if (!query || typeof query !== "string") {
      await saveAgentTrace(
        buildAgentTrace({
          runId,
          query: "",
          parseSource: "fallback",
          agentResult: {
            status: "failed",
            parsedIntent: { category: "", budget: undefined, priorities: [], constraints: [], confidence: 0, originalQuery: "" },
            steps: [],
            error: "Query is required",
          },
        })
      );
      return NextResponse.json(
        { success: false, source: "fallback", error: "Query is required", agentResult: null },
        { status: 400 }
      );
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      await saveAgentTrace(
        buildAgentTrace({
          runId,
          query: "",
          parseSource: "fallback",
          agentResult: {
            status: "failed",
            parsedIntent: { category: "", budget: undefined, priorities: [], constraints: [], confidence: 0, originalQuery: "" },
            steps: [],
            error: "Query cannot be empty",
          },
        })
      );
      return NextResponse.json(
        { success: false, source: "fallback", error: "Query cannot be empty", agentResult: null },
        { status: 400 }
      );
    }

    if (trimmedQuery.length > MAX_QUERY_LENGTH) {
      await saveAgentTrace(
        buildAgentTrace({
          runId,
          query: trimmedQuery,
          parseSource: "fallback",
          agentResult: {
            status: "failed",
            parsedIntent: { category: "", budget: undefined, priorities: [], constraints: [], confidence: 0, originalQuery: trimmedQuery },
            steps: [],
            error: `Query too long (max ${MAX_QUERY_LENGTH} characters)`,
          },
        })
      );
      return NextResponse.json(
        {
          success: false,
          source: "fallback",
          error: `Query too long (max ${MAX_QUERY_LENGTH} characters)`,
          agentResult: null,
        },
        { status: 400 }
      );
    }

    // 2. Build parser context (same pattern as /api/decision/parse)
    const allCategories = getAllCategoryConfigs();

    const context: ParserContext = {
      categories: allCategories,
      currentCategory:
        typeof currentCategory === "string" ? currentCategory : undefined,
      currentPreferences:
        currentPreferences &&
        typeof currentPreferences === "object" &&
        typeof currentPreferences.category === "string"
          ? {
              category: currentPreferences.category,
              budget: currentPreferences.budget,
              priorities: Array.isArray(currentPreferences.priorities)
                ? currentPreferences.priorities
                : [],
              constraints: Array.isArray(currentPreferences.constraints)
                ? currentPreferences.constraints
                : undefined,
            }
          : undefined,
    };

    // 3. Parse the query
    const parseResult = await parseShoppingQuery(trimmedQuery, context);

    // 4. If parsing failed, stop — do NOT execute the agent.
    // Still record the attempt in the trace for honest auditability.
    if (!parseResult.success || !parseResult.intent) {
      await saveAgentTrace(
        buildAgentTrace({
          runId,
          query: trimmedQuery,
          parseSource: parseResult.source,
          ...(parseResult.aiFailureClass ? { aiFailureClass: parseResult.aiFailureClass } : {}),
          agentResult: {
            status: "failed",
            parsedIntent: { category: "", budget: undefined, priorities: [], constraints: [], confidence: 0, originalQuery: trimmedQuery },
            steps: [],
            error: parseResult.error ?? "Failed to parse query",
          },
        })
      );
      return NextResponse.json({
        success: false,
        source: parseResult.source,
        agentResult: null,
        error: parseResult.error ?? "Failed to parse query",
      });
    }

    // 5. Execute the bounded agent pipeline
    // Category precedence: parsed intent category is PRIMARY.
    // currentCategory is only a fallback when the parser doesn't provide one.
    const effectiveCategory =
      parseResult.intent.category ??
      (typeof currentCategory === "string" ? currentCategory : undefined);

    const agentResult = await runAgent({
      intent: parseResult.intent,
      category: effectiveCategory,
      currentPreferences: context.currentPreferences,
    });

    // 6. Persist the agent execution trace (honest persistence result)
    const trace = buildAgentTrace({
      runId,
      query: trimmedQuery,
      parseSource: parseResult.source,
      ...(parseResult.aiFailureClass ? { aiFailureClass: parseResult.aiFailureClass } : {}),
      agentResult,
    });
    const tracePersistResult = await saveAgentTrace(trace);

    // 7. Return structured response
    // success reflects whether the complete request succeeded
    const requestSucceeded = agentResult.status === "completed";

    return NextResponse.json({
      success: requestSucceeded,
      source: parseResult.source,
      agentResult,
      error: agentResult.error ?? null,
      trace: buildTraceResponseMeta(tracePersistResult),
      parseMeta: {
        aiAttempted: parseResult.aiAttempted ?? false,
        aiAvailable: parseResult.aiAvailable ?? false,
        aiProvider: parseResult.aiProvider ?? null,
        fallbackUsed: parseResult.fallbackUsed ?? false,
        aiFailureClass: parseResult.aiFailureClass ?? null,
      },
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        source: "fallback",
        error: "Internal agent execution error",
        agentResult: null,
      },
      { status: 500 }
    );
  }
}

// --- Helpers ---

/**
 * Build the client-safe trace metadata from an honest persistence result.
 * `persisted` reflects the actual write outcome — never a claimed success.
 */
function buildTraceResponseMeta(
  result: AgentTracePersistResult
): { runId: string; persisted: boolean; error?: string } {
  const meta: { runId: string; persisted: boolean; error?: string } = {
    runId: result.runId,
    persisted: result.persisted,
  };
  if (!result.persisted && result.error) {
    meta.error = result.error;
  }
  return meta;
}

/**
 * GET /api/agent/run?runId=...
 *
 * Returns the persisted agent execution trace for a run.
 * Response: { success: true, trace: AgentTraceRecord } or 404 when unknown.
 */
export async function GET(request: NextRequest) {
  const runId = request.nextUrl.searchParams.get("runId");

  if (!runId || runId.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: "runId query parameter is required." },
      { status: 400 }
    );
  }

  try {
    const trace = await getAgentTrace(runId.trim());

    if (!trace) {
      return NextResponse.json(
        { success: false, error: "Agent trace not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, trace });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to retrieve agent trace." },
      { status: 500 }
    );
  }
}
