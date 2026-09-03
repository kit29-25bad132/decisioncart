// ============================================================
// DecisionCart — Agent Orchestrator (Step 4: search_catalog + run_decision + compare_products)
// Deterministic execution of bounded commerce tools.
// No LLM-driven reasoning. No payment. No catalog mutation.
// ============================================================

import type {
  AgentInput,
  AgentResult,
  AgentStep,
  AgentToolName,
  ToolStepStatus,
} from "./agent-types";
import type { Product } from "@/types";
import { executeCatalogSearch } from "./tools/catalog-search";
import { executeReviewAnalyzer } from "./tools/review-analyzer";
import { executeDecisionRunner } from "./tools/decision-runner";
import { executeConstraintRelaxation } from "./tools/constraint-relaxation";
import { executeProductComparison } from "./tools/product-comparison";
import { executePriceInventoryCheck } from "./tools/price-inventory-check";
import { executeMerchantOffers } from "./tools/merchant-offers";
import { resolveCategoryConfig } from "@/catalog/category-resolver";

// --- Deterministic Step Plan ---

/**
 * Ordered list of tool steps for a standard commerce query.
 * This is the fixed execution plan — not decided by an LLM.
 * All three tools are now executed in sequence.
 */
interface StepPlanEntry {
  tool: AgentToolName;
  label: string;
}

const DEFAULT_STEP_PLAN: StepPlanEntry[] = [
  { tool: "search_catalog", label: "Search catalog for matching products" },
  { tool: "analyze_reviews", label: "Analyze product review intelligence" },
  { tool: "run_decision", label: "Run deterministic decision engine" },
  { tool: "get_merchant_offers", label: "Evaluate merchant offers for ranked products" },
  { tool: "relax_constraints", label: "Explore constraint alternatives" },
  { tool: "compare_products", label: "Compare top products and generate insights" },
  { tool: "verify_purchase", label: "Verify product price and availability" },
];

// --- ID Generation ---

let stepCounter = 0;

/**
 * Generate a deterministic, unique step ID.
 * Resolves across multiple orchestrator invocations within a process.
 */
function generateStepId(tool: AgentToolName): string {
  stepCounter += 1;
  return `step-${stepCounter}-${tool}`;
}

// --- Orchestrator ---

/**
 * Run the agent orchestrator.
 *
 * Step 4 implementation:
 * - Creates a deterministic execution plan with observable step entries.
 * - Executes search_catalog via the bounded tool.
 * - If search_catalog succeeds, executes run_decision.
 * - If run_decision succeeds, executes compare_products.
 * - Returns "completed" on full success, "failed" on any failure.
 */
export async function runAgent(input: AgentInput): Promise<AgentResult> {
  // Validate input
  if (!input.intent) {
    return {
      status: "failed",
      parsedIntent: input.intent,
      steps: [],
      error: "Missing parsed intent",
    };
  }

  // Build the execution plan — all steps start as pending.
  const steps = buildSteps(DEFAULT_STEP_PLAN);

  // Find the search_catalog step
  const searchStep = steps.find((s) => s.tool === "search_catalog");

  if (!searchStep) {
    return {
      status: "failed",
      parsedIntent: input.intent,
      steps,
      error: "Internal error: search_catalog step not found in plan.",
    };
  }

  // --- Execute search_catalog ---

  // Transition: pending → running
  searchStep.status = "running";
  searchStep.startedAt = Date.now();
  searchStep.inputSummary = buildSearchInputSummary(input);

  let catalogResult;
  try {
    catalogResult = await executeCatalogSearch({
      intent: input.intent,
      categoryOverride: input.category,
    });

    // Transition: running → completed or failed
    searchStep.completedAt = Date.now();

    if (catalogResult.success) {
      searchStep.status = "completed";
      searchStep.outputSummary = catalogResult.outputSummary;
    } else {
      searchStep.status = "failed";
      searchStep.error = catalogResult.error;
      searchStep.outputSummary = catalogResult.outputSummary;

      return {
        status: "failed",
        parsedIntent: input.intent,
        steps,
        catalogSearchResult: catalogResult,
        error: catalogResult.error,
      };
    }
  } catch (err: unknown) {
    // Unexpected error — should not happen since executeCatalogSearch catches internally
    searchStep.completedAt = Date.now();
    searchStep.status = "failed";

    const errorMessage =
      err instanceof Error ? err.message : "Unexpected orchestrator error";
    searchStep.error = errorMessage;
    searchStep.outputSummary = `Catalog search failed: ${errorMessage}.`;

    return {
      status: "failed",
      parsedIntent: input.intent,
      steps,
      error: errorMessage,
    };
  }

  // --- Execute analyze_reviews ---

  const reviewStep = steps.find((s) => s.tool === "analyze_reviews");

  if (!reviewStep) {
    return {
      status: "failed",
      parsedIntent: input.intent,
      steps,
      catalogSearchResult: catalogResult,
      error: "Internal error: analyze_reviews step not found in plan.",
    };
  }

  // Transition: pending → running
  reviewStep.status = "running";
  reviewStep.startedAt = Date.now();
  reviewStep.inputSummary = `${catalogResult.products.length} product${catalogResult.products.length === 1 ? "" : "s"} from catalog`;

  let reviewAnalysisResult: import("./agent-types").ReviewAnalysisToolResult = {
    success: true,
    reviews: {},
    analyzedCount: 0,
    outputSummary: "Review analysis skipped.",
  };
  try {
    reviewAnalysisResult = await executeReviewAnalyzer({
      products: catalogResult.products,
    });

    // Transition: running → completed or failed
    reviewStep.completedAt = Date.now();

    if (reviewAnalysisResult.success) {
      reviewStep.status = "completed";
      reviewStep.outputSummary = reviewAnalysisResult.outputSummary;
    } else {
      // Review analysis failure is non-fatal — continue without reviews
      reviewStep.status = "completed";
      reviewStep.degraded = true;
      reviewStep.outputSummary = reviewAnalysisResult.outputSummary;
    }
  } catch (err: unknown) {
    // Unexpected error — non-fatal, continue without reviews
    reviewStep.completedAt = Date.now();
    reviewStep.status = "completed";
    reviewStep.degraded = true;

    const errorMessage =
      err instanceof Error ? err.message : "Unexpected review analysis error";
    reviewStep.outputSummary = `Review analysis skipped: ${errorMessage}.`;
  }

  // --- Execute run_decision ---

  const decisionStep = steps.find((s) => s.tool === "run_decision");

  if (!decisionStep) {
    return {
      status: "failed",
      parsedIntent: input.intent,
      steps,
      catalogSearchResult: catalogResult,
      error: "Internal error: run_decision step not found in plan.",
    };
  }

  // Transition: pending → running
  decisionStep.status = "running";
  decisionStep.startedAt = Date.now();
  decisionStep.inputSummary = buildDecisionInputSummary(
    catalogResult.products,
    input
  );

  let decisionToolResult;
  try {
    decisionToolResult = await executeDecisionRunner({
      intent: input.intent,
      products: catalogResult.products,
      categoryOverride: input.category,
    });

    // Transition: running → completed or failed
    decisionStep.completedAt = Date.now();

    if (decisionToolResult.success) {
      decisionStep.status = "completed";
      decisionStep.outputSummary = decisionToolResult.outputSummary;
    } else {
      decisionStep.status = "failed";
      decisionStep.error = decisionToolResult.error;
      decisionStep.outputSummary = decisionToolResult.outputSummary;

      return {
        status: "failed",
        parsedIntent: input.intent,
        steps,
        catalogSearchResult: catalogResult,
        reviewAnalysisResult,
        decisionResult: decisionToolResult,
        error: decisionToolResult.error,
      };
    }
  } catch (err: unknown) {
    // Unexpected error — should not happen since executeDecisionRunner catches internally
    decisionStep.completedAt = Date.now();
    decisionStep.status = "failed";

    const errorMessage =
      err instanceof Error ? err.message : "Unexpected decision runner error";
    decisionStep.error = errorMessage;
    decisionStep.outputSummary = `Decision runner failed: ${errorMessage}.`;

    return {
      status: "failed",
      parsedIntent: input.intent,
      steps,
      catalogSearchResult: catalogResult,
      reviewAnalysisResult,
      decisionResult: decisionToolResult,
      error: errorMessage,
    };
  }

  // --- Execute get_merchant_offers (non-fatal: degraded on failure) ---

  const merchantStep = steps.find((s) => s.tool === "get_merchant_offers");

  if (!merchantStep) {
    return {
      status: "failed",
      parsedIntent: input.intent,
      steps,
      catalogSearchResult: catalogResult,
      reviewAnalysisResult,
      decisionResult: decisionToolResult,
      error: "Internal error: get_merchant_offers step not found in plan.",
    };
  }

  let merchantOffersResult: import("./agent-types").MerchantOffersToolResult = {
    success: true,
    selectionsByProductId: {},
    selectionCount: 0,
    outputSummary: "Merchant offers evaluation skipped.",
  };

  // Only run merchant evaluation when decision engine has scored products
  const hasScoredProducts =
    decisionToolResult.success &&
    decisionToolResult.decisionResult &&
    decisionToolResult.decisionResult.scoredProducts.length > 0;

  if (hasScoredProducts) {
    // Transition: pending → running
    merchantStep.status = "running";
    merchantStep.startedAt = Date.now();

    const scoredProducts = decisionToolResult.decisionResult!.scoredProducts.map(
      (sp) => sp.product
    );
    merchantStep.inputSummary = `${scoredProducts.length} product${scoredProducts.length === 1 ? "" : "s"} ranked by decision engine`;

    try {
      merchantOffersResult = await executeMerchantOffers({
        products: scoredProducts,
        priorities: input.intent.priorities,
      });

      // Transition: running → completed (non-fatal on degraded)
      merchantStep.completedAt = Date.now();

      if (merchantOffersResult.success) {
        merchantStep.status = "completed";
        merchantStep.outputSummary = merchantOffersResult.outputSummary;
      } else {
        // Merchant evaluation failure is non-fatal — continue without merchant data
        merchantStep.status = "completed";
        merchantStep.degraded = true;
        merchantStep.outputSummary = merchantOffersResult.outputSummary;
      }
    } catch (err: unknown) {
      // Non-fatal: continue without merchant offers
      merchantStep.completedAt = Date.now();
      merchantStep.status = "completed";
      merchantStep.degraded = true;

      const errorMessage =
        err instanceof Error ? err.message : "Unexpected merchant evaluation error";
      merchantStep.outputSummary = `Merchant evaluation skipped: ${errorMessage}.`;
    }
  } else {
    // Skip merchant step — no scored products to evaluate
    merchantStep.status = "skipped";
    merchantStep.startedAt = Date.now();
    merchantStep.completedAt = Date.now();
    merchantStep.inputSummary = "No scored products to evaluate";
    merchantStep.outputSummary = "Merchant evaluation skipped: no scored products.";
  }

  // --- Execute relax_constraints (conditional: only when zero results) ---

  const relaxationStep = steps.find((s) => s.tool === "relax_constraints");

  if (!relaxationStep) {
    return {
      status: "failed",
      parsedIntent: input.intent,
      steps,
      catalogSearchResult: catalogResult,
      reviewAnalysisResult,
      decisionResult: decisionToolResult,
      error: "Internal error: relax_constraints step not found in plan.",
    };
  }

  // Only run relaxation when decision engine returns zero scored products
  const needsRelaxation =
    decisionToolResult.success &&
    decisionToolResult.decisionResult &&
    decisionToolResult.decisionResult.scoredProducts.length === 0;

  let relaxationResult: import("./agent-types").ConstraintRelaxationToolResult = {
    success: true,
    result: {
      exactMatchFound: false,
      alternatives: [],
      relaxedConstraints: [],
      explanation: "Relaxation not needed — products found.",
      alternativeCount: 0,
    },
    outputSummary: "Relaxation skipped: products matched original constraints.",
  };

  if (needsRelaxation) {
    // Transition: pending → running
    relaxationStep.status = "running";
    relaxationStep.startedAt = Date.now();
    relaxationStep.inputSummary = "0 products matched — testing bounded constraint relaxation";

    // Resolve category config for relaxation
    const effectiveCategory = decisionToolResult.effectiveCategory;
    const categoryResolution = resolveCategoryConfig(effectiveCategory);

    if (categoryResolution && catalogResult.products.length > 0) {
      const preference: import("@/types").UserPreference = {
        category: effectiveCategory,
        budget: input.intent.budget,
        priorities: input.intent.priorities,
        constraints: input.intent.constraints,
      };

      try {
        relaxationResult = await executeConstraintRelaxation({
          products: catalogResult.products,
          preference,
          categoryConfig: categoryResolution.config,
        });

        // Transition: running → completed
        relaxationStep.completedAt = Date.now();
        relaxationStep.status = "completed";
        relaxationStep.outputSummary = relaxationResult.outputSummary;
      } catch (err: unknown) {
        // Non-fatal: continue without relaxation
        relaxationStep.completedAt = Date.now();
        relaxationStep.status = "completed";
        const errorMessage =
          err instanceof Error ? err.message : "Unexpected relaxation error";
        relaxationStep.outputSummary = `Relaxation analysis skipped: ${errorMessage}.`;
      }
    } else {
      // No category config or no products — skip relaxation
      relaxationStep.completedAt = Date.now();
      relaxationStep.status = "completed";
      relaxationStep.outputSummary = categoryResolution
        ? "Relaxation skipped: no products available."
        : `Relaxation skipped: category config not found for "${effectiveCategory}".`;
    }
  } else {
    // Skip relaxation step entirely
    relaxationStep.status = "skipped";
    relaxationStep.startedAt = Date.now();
    relaxationStep.completedAt = Date.now();
    relaxationStep.inputSummary = "Products matched original constraints";
    relaxationStep.outputSummary = "Relaxation not needed — products matched original constraints.";
  }

  // --- Execute compare_products ---

  const comparisonStep = steps.find((s) => s.tool === "compare_products");

  if (!comparisonStep) {
    return {
      status: "failed",
      parsedIntent: input.intent,
      steps,
      catalogSearchResult: catalogResult,
      decisionResult: decisionToolResult,
      merchantOffersResult,
      error: "Internal error: compare_products step not found in plan.",
    };
  }

  // Transition: pending → running
  comparisonStep.status = "running";
  comparisonStep.startedAt = Date.now();
  comparisonStep.inputSummary = buildComparisonInputSummary(decisionToolResult);

  let comparisonResult: import("./agent-types").ProductComparisonResult = {
    success: true,
    comparison: undefined,
    productCount: 0,
    outputSummary: "Comparison not executed.",
  };

  try {
    comparisonResult = await executeProductComparison({
      decisionToolResult,
    });

    // Transition: running → completed or failed
    comparisonStep.completedAt = Date.now();

    if (!comparisonResult.success) {
      comparisonStep.status = "failed";
      comparisonStep.error = comparisonResult.error;
      comparisonStep.outputSummary = comparisonResult.outputSummary;

      return {
        status: "failed",
        parsedIntent: input.intent,
        steps,
        catalogSearchResult: catalogResult,
        reviewAnalysisResult,
        decisionResult: decisionToolResult,
        merchantOffersResult,
        relaxationResult,
        comparisonResult,
        error: comparisonResult.error,
      };
    }

    comparisonStep.status = "completed";
    comparisonStep.outputSummary = comparisonResult.outputSummary;
  } catch (err: unknown) {
    // Unexpected error — should not happen since executeProductComparison catches internally
    comparisonStep.completedAt = Date.now();
    comparisonStep.status = "failed";

    const errorMessage =
      err instanceof Error ? err.message : "Unexpected comparison error";
    comparisonStep.error = errorMessage;
    comparisonStep.outputSummary = `Comparison failed: ${errorMessage}.`;

    return {
      status: "failed",
      parsedIntent: input.intent,
      steps,
      catalogSearchResult: catalogResult,
      reviewAnalysisResult,
      decisionResult: decisionToolResult,
      merchantOffersResult,
      relaxationResult,
      error: errorMessage,
    };
  }

  // --- Execute verify_purchase (verify top-ranked product) ---

  const verifyStep = steps.find((s) => s.tool === "verify_purchase");

  if (!verifyStep) {
    // Verification step missing — non-fatal, skip
  } else {
    // Determine which product to verify: top-ranked from decision, or first catalog product
    const topScored = decisionToolResult.decisionResult?.scoredProducts?.[0];
    const verifyProductId = topScored?.product?.id ?? catalogResult.products[0]?.id;
    const verifyCategory = decisionToolResult.effectiveCategory || input.category || input.intent.category || "";

    if (verifyProductId && verifyCategory) {
      // Transition: pending → running
      verifyStep.status = "running";
      verifyStep.startedAt = Date.now();
      verifyStep.inputSummary = `productId="${verifyProductId}", category="${verifyCategory}"`;

      try {
        const verifyResult = await executePriceInventoryCheck({
          productId: verifyProductId,
          category: verifyCategory,
        });

        // Transition: running → completed or failed
        verifyStep.completedAt = Date.now();

        if (verifyResult.success) {
          verifyStep.status = "completed";
          verifyStep.outputSummary =
            `Price verified: ₹${verifyResult.verifiedPrice?.toLocaleString() ?? "unknown"}, ` +
            `Availability: ${verifyResult.available ? "Available" : "Unknown"}`;
        } else {
          // Verification failure is non-fatal — we still return the result
          verifyStep.status = "completed";
          verifyStep.degraded = true;
          verifyStep.outputSummary = `Verification failed: ${verifyResult.error}`;
        }

        return {
          status: "completed",
          parsedIntent: input.intent,
          steps,
          catalogSearchResult: catalogResult,
          reviewAnalysisResult,
          decisionResult: decisionToolResult,
          merchantOffersResult,
          relaxationResult,
          comparisonResult,
          priceInventoryResult: verifyResult,
        };
      } catch (err: unknown) {
        // Unexpected error — non-fatal
        verifyStep.completedAt = Date.now();
        verifyStep.status = "completed";
        verifyStep.degraded = true;

        const errorMessage =
          err instanceof Error ? err.message : "Unexpected verification error";
        verifyStep.outputSummary = `Verification skipped: ${errorMessage}.`;

        return {
          status: "completed",
          parsedIntent: input.intent,
          steps,
          catalogSearchResult: catalogResult,
          reviewAnalysisResult,
          decisionResult: decisionToolResult,
          merchantOffersResult,
          relaxationResult,
          comparisonResult,
        };
      }
    } else {
      // No product to verify — skip
      verifyStep.status = "skipped";
      verifyStep.startedAt = Date.now();
      verifyStep.completedAt = Date.now();
      verifyStep.inputSummary = "No product available to verify";
      verifyStep.outputSummary = "Verification skipped: no product to verify.";
    }
  }

  // Final return if verification was skipped or missing
  return {
    status: "completed",
    parsedIntent: input.intent,
    steps,
    catalogSearchResult: catalogResult,
    reviewAnalysisResult,
    decisionResult: decisionToolResult,
    merchantOffersResult,
    relaxationResult,
    comparisonResult,
  };
}

// --- Internal Helpers ---

/**
 * Build deterministic AgentStep entries from a step plan.
 * Each step gets a unique ID and a pending initial status.
 */
function buildSteps(plan: StepPlanEntry[]): AgentStep[] {
  return plan.map((entry) => ({
    id: generateStepId(entry.tool),
    tool: entry.tool,
    status: "pending" as ToolStepStatus,
    label: entry.label,
  }));
}

/**
 * Build a brief input summary for the catalog search step.
 * No secrets — only observable metadata.
 */
function buildSearchInputSummary(input: AgentInput): string {
  const parts: string[] = [];

  const category = input.category ?? input.intent.category;
  if (category) {
    parts.push(`category="${category}"`);
  }

  const budget = input.intent.budget;
  if (budget?.max !== undefined) {
    parts.push(`maxBudget=${budget.max}`);
  }
  if (budget?.min !== undefined) {
    parts.push(`minBudget=${budget.min}`);
  }

  return parts.length > 0 ? parts.join(", ") : "no parameters";
}

/**
 * Build a brief input summary for the decision step.
 * No secrets — only observable metadata.
 */
function buildDecisionInputSummary(
  products: Product[],
  input: AgentInput
): string {
  const parts: string[] = [];

  const productCount = Array.isArray(products) ? products.length : 0;
  parts.push(`${productCount} product${productCount === 1 ? "" : "s"}`);

  const category = input.category ?? input.intent.category;
  if (category) {
    parts.push(`category="${category}"`);
  }

  return parts.join(", ");
}

/**
 * Build a brief input summary for the comparison step.
 * No secrets — only observable metadata.
 */
function buildComparisonInputSummary(
  decisionResult: import("./agent-types").DecisionToolResult
): string {
  const parts: string[] = [];

  const scoredCount = decisionResult.decisionResult?.scoredProducts?.length ?? 0;
  parts.push(`${scoredCount} scored product${scoredCount === 1 ? "" : "s"}`);

  const category = decisionResult.effectiveCategory;
  if (category) {
    parts.push(`category="${category}"`);
  }

  return parts.join(", ");
}
