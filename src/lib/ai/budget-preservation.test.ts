// ============================================================
// DecisionCart — Budget Preservation Across Refinements
// Verify budget constraints persist through conversational refinements
// ============================================================

import { describe, it, expect } from "vitest";
import { parseShoppingQuery } from "@/lib/ai/parse";
import { CATEGORY_CONFIGS } from "@/catalog/categories";
import type { ParserContext } from "@/lib/ai/types";

describe("budget preservation in refinements", () => {
  it('Initial query "Phone under ₹30,000 with 5G" followed by "Just focus on camera" preserves budget', async () => {
    const allCategories = Object.values(CATEGORY_CONFIGS);

    // Step 1: Initial query
    const step1Context: ParserContext = {
      categories: allCategories,
      currentCategory: undefined,
      currentPreferences: undefined,
    };

    const step1Result = await parseShoppingQuery("Phone under ₹30,000 with 5G", step1Context);
    expect(step1Result.success).toBe(true);
    expect(step1Result.intent?.budget?.max).toBe(30000);
    expect(step1Result.intent?.category).toBe("smartphone");

    const step1Budget = step1Result.intent?.budget;

    // Step 2: Refinement query
    const step2Context: ParserContext = {
      categories: allCategories,
      currentCategory: "smartphone",
      currentPreferences: {
        category: "smartphone",
        budget: step1Budget,
        priorities: step1Result.intent?.priorities ?? [],
      },
    };

    const step2Result = await parseShoppingQuery(
      "Actually I just focus on camera",
      step2Context
    );
    expect(step2Result.success).toBe(true);

    // Budget should be preserved from step 1
    expect(step2Result.intent?.budget?.max).toBe(30000);

    // Category should remain smartphone
    expect(step2Result.intent?.category).toBe("smartphone");

    // Camera should now be high priority (from exclusive detection)
    const cameraPriority = step2Result.intent?.priorities?.find(
      (p) => p.attributeKey === "camera_score"
    );
    expect(cameraPriority).toBeDefined();
    expect(cameraPriority?.importance).toBeGreaterThanOrEqual(2);
  });

  it("Refinement without budget mention preserves existing budget", async () => {
    const allCategories = Object.values(CATEGORY_CONFIGS);

    const currentPreferences = {
      category: "smartphone",
      budget: { max: 25000 },
      priorities: [
        { attributeKey: "processor_score", importance: 2 },
        { attributeKey: "ram_gb", importance: 2 },
      ],
    };

    const context: ParserContext = {
      categories: allCategories,
      currentCategory: "smartphone",
      currentPreferences,
    };

    // Refinement that changes priority but not budget
    const result = await parseShoppingQuery("Actually battery is more important", context);

    expect(result.success).toBe(true);
    expect(result.intent?.budget?.max).toBe(25000);
    expect(result.intent?.category).toBe("smartphone");
  });

  it("Explicit budget change in refinement updates the budget", async () => {
    const allCategories = Object.values(CATEGORY_CONFIGS);

    const currentPreferences = {
      category: "smartphone",
      budget: { max: 25000 },
      priorities: [{ attributeKey: "camera_score", importance: 3 }],
    };

    const context: ParserContext = {
      categories: allCategories,
      currentCategory: "smartphone",
      currentPreferences,
    };

    // Budget change refinement
    const result = await parseShoppingQuery("Actually make it ₹35000", context);

    expect(result.success).toBe(true);
    // Budget should be updated to 35000
    expect(result.intent?.budget?.max).toBe(35000);
  });
});
