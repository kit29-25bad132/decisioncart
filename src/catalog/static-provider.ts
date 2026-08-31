// ============================================================
// DecisionCart — Static Catalog Provider
// Wraps the existing demo/fixture catalog behind the provider
// interface. No product data is duplicated.
// ============================================================

import type {
  ProductDataProvider,
  ProductDataRequest,
  ProductDataResult,
} from "./provider";
import { ProductProviderError } from "./provider";
import { getCatalog, DEMO_CATALOGS } from "./demo-data";

/** Provider ID for the static demo catalog. */
export const STATIC_CATALOG_PROVIDER_ID = "demo-catalog";

/** Human-readable label for the static catalog. */
export const STATIC_CATALOG_PROVIDER_LABEL = "Demo Catalog";

/**
 * Product data provider backed by static demo/fixture data.
 *
 * This wraps the existing `getCatalog()` function behind the
 * `ProductDataProvider` interface, preserving all current behavior
 * while adding the provider abstraction layer.
 *
 * Responsibilities:
 * - Retrieve products from the existing demo catalog
 * - Filter by category
 * - Apply optional budget pre-filtering
 * - Return normalized Product[] with provider metadata
 */
export class StaticCatalogProvider implements ProductDataProvider {
  readonly id = STATIC_CATALOG_PROVIDER_ID;
  readonly label = STATIC_CATALOG_PROVIDER_LABEL;

  async getProducts(request: ProductDataRequest): Promise<ProductDataResult> {
    const { category, maxBudget, minBudget, limit } = request;

    // Validate category support
    const supportedCategories = Object.keys(DEMO_CATALOGS);
    if (!supportedCategories.includes(category)) {
      throw new ProductProviderError(
        `Unsupported category "${category}". Available: ${supportedCategories.join(", ")}`,
        this.id,
        "unsupported_category"
      );
    }

    // Fetch from existing catalog (reuses getCatalog, no duplication)
    let products = getCatalog(category);

    // Apply optional budget pre-filtering at provider level
    let budgetFiltered = false;
    if (maxBudget !== undefined || minBudget !== undefined) {
      const beforeCount = products.length;
      products = products.filter((p) => {
        if (maxBudget !== undefined && p.price > maxBudget) return false;
        if (minBudget !== undefined && p.price < minBudget) return false;
        return true;
      });
      budgetFiltered = products.length !== beforeCount;
    }

    const totalCount = products.length;

    // Apply optional limit
    if (limit !== undefined && limit > 0 && products.length > limit) {
      products = products.slice(0, limit);
    }

    return {
      products,
      provider: {
        id: this.id,
        label: this.label,
      },
      fetchedAt: new Date().toISOString(),
      metadata: {
        totalCount,
        budgetFiltered,
        note: "Static demo data — prices are illustrative, not live marketplace data.",
      },
    };
  }
}
