// ============================================================
// DecisionCart — Agent Run API Route
// Server-side only. Never exposes secrets to client.
// Connects: Query → Parser → runAgent() → AgentResult
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { parseShoppingQuery } from "@/lib/ai/parse";
import { getAllCategoryConfigs } from "@/catalog/category-resolver";
import { runAgent } from "@/agent/orchestrator";
import type { ParserContext } from "@/lib/ai/types";

const MAX_QUERY_LENGTH = 500;

export async function POST(request: NextRequest) {
  try {
    // 1. Parse and validate request body
    const body = await request.json();
    const { query, currentCategory, currentPreferences } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { success: false, source: "fallback", error: "Query is required", agentResult: null },
        { status: 400 }
      );
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      return NextResponse.json(
        { success: false, source: "fallback", error: "Query cannot be empty", agentResult: null },
        { status: 400 }
      );
    }

    if (trimmedQuery.length > MAX_QUERY_LENGTH) {
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

    // 4. If parsing failed, stop — do NOT execute the agent
    if (!parseResult.success || !parseResult.intent) {
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

    // 6. Return structured response
    // success reflects whether the complete request succeeded
    const requestSucceeded = agentResult.status === "completed";

    return NextResponse.json({
      success: requestSucceeded,
      source: parseResult.source,
      agentResult,
      error: agentResult.error ?? null,
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
