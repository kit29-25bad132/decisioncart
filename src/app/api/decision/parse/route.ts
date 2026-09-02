// ============================================================
// DecisionCart — Parse API Route
// Server-side only. Never exposes secrets to client.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { parseShoppingQuery } from "@/lib/ai/parse";
import { getAllCategoryConfigs } from "@/catalog/category-resolver";
import type { ParserContext } from "@/lib/ai/types";

const MAX_QUERY_LENGTH = 500;

export async function POST(request: NextRequest) {
  try {
    // 1. Parse and validate request body
    const body = await request.json();
    const { query, currentCategory, currentPreferences } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { success: false, source: "fallback", error: "Query is required" },
        { status: 400 }
      );
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      return NextResponse.json(
        { success: false, source: "fallback", error: "Query cannot be empty" },
        { status: 400 }
      );
    }

    if (trimmedQuery.length > MAX_QUERY_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          source: "fallback",
          error: `Query too long (max ${MAX_QUERY_LENGTH} characters)`,
        },
        { status: 400 }
      );
    }

    // 2. Build parser context
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
    const result = await parseShoppingQuery(trimmedQuery, context);

    // 4. Return safe response (never expose internal details)
    return NextResponse.json({
      success: result.success,
      source: result.source,
      intent: result.intent ?? null,
      error: result.error ?? null,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        source: "fallback",
        error: "Internal parsing error",
      },
      { status: 500 }
    );
  }
}
