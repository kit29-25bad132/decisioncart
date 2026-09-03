// ============================================================
// DecisionCart — Agent Tools Index
// Minimal registry of bounded agent tools.
// search_catalog, analyze_reviews, run_decision, compare_products,
// verify_purchase (price & inventory check).
// ============================================================

export { executeCatalogSearch } from "./catalog-search";
export type { CatalogSearchInput } from "./catalog-search";

export { executeDecisionRunner } from "./decision-runner";
export type { DecisionRunnerInput } from "./decision-runner";

export { executeProductComparison } from "./product-comparison";
export type { ProductComparisonInput } from "./product-comparison";

export { executePriceInventoryCheck } from "./price-inventory-check";
export type { PriceInventoryCheckInput } from "./price-inventory-check";

export { executeMerchantOffers } from "./merchant-offers";
export type { MerchantOffersInput } from "./merchant-offers";
