// ============================================================
// DecisionCart — Product Data Provider Interface
// Category-agnostic abstraction for retrieving product data.
// The Decision Engine must NOT know where products come from.
// ============================================================

import type { Product } from "@/types";

// --- Provider Metadata ---

/** Identifies where product data came from. */
export interface ProviderInfo {
  /** Stable provider identifier (e.g. "demo-catalog", "merchant", "external-api"). */
  id: string;
  /** Human-readable provider name (e.g. "Demo Catalog", "Merchant API"). */
  label: string;
}

// --- Product Data Request ---

/** Request to fetch products from a provider. Category-agnostic. */
export interface ProductDataRequest {
  /** The product category to fetch (e.g. "smartphone", "laptop"). */
  category: string;
  /** Optional maximum budget — providers may pre-filter for efficiency. */
  maxBudget?: number;
  /** Optional minimum budget — providers may pre-filter for efficiency. */
  minBudget?: number;
  /** Optional free-text search query for provider-side filtering. */
  query?: string;
  /** Maximum number of products to return. Providers may cap this. */
  limit?: number;
}

// --- Product Data Result ---

/** Result from a product data provider. Always returns normalized Product[]. */
export interface ProductDataResult {
  /** Normalized products ready for the Decision Engine. */
  products: Product[];
  /** Information about which provider supplied the data. */
  provider: ProviderInfo;
  /** When the data was fetched (ISO 8601 timestamp). */
  fetchedAt: string;
  /** Optional metadata about the fetch operation. */
  metadata?: {
    /** Total matching products before limit was applied. */
    totalCount?: number;
    /** Whether the provider applied any budget pre-filtering. */
    budgetFiltered?: boolean;
    /** Whether the result was served from cache. */
    cached?: boolean;
    /** Human-readable note about the fetch. */
    note?: string;
  };
}

// --- Provider Error ---

/** Typed error from a product data provider. */
export class ProductProviderError extends Error {
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly code:
      | "unavailable"
      | "empty"
      | "unsupported_category"
      | "invalid_request"
      | "timeout"
      | "unknown"
  ) {
    super(message);
    this.name = "ProductProviderError";
  }
}

// --- Product Data Provider Interface ---

/**
 * Abstraction for retrieving product data from any source.
 *
 * Implementations must:
 * - Return normalized Product[] matching the existing contract
 * - Never fabricate missing data (use null for unknown attributes)
 * - Handle errors gracefully (throw ProductProviderError on failure)
 * - Remain category-agnostic (no smartphone/laptop-specific logic)
 *
 * The Decision Engine depends only on Product[] — it never
 * calls this interface directly.
 */
export interface ProductDataProvider {
  /** Unique identifier for this provider. */
  readonly id: string;

  /** Human-readable provider name. */
  readonly label: string;

  /**
   * Fetch products matching the given request.
   * Returns normalized products ready for the Decision Engine.
   *
   * @throws {ProductProviderError} on provider failure
   */
  getProducts(request: ProductDataRequest): Promise<ProductDataResult>;
}
