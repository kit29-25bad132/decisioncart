// ============================================================
// DecisionCart — Mock External Product Provider
// Demonstrates the external provider architecture safely.
// NOT connected to a real API. Exists only to prove the
// provider abstraction works and can be swapped for a real one.
// ============================================================

import type {
  ProductDataProvider,
  ProductDataRequest,
  ProductDataResult,
} from "./provider";
import { ProductProviderError } from "./provider";
import { getCatalog, DEMO_CATALOGS } from "./demo-data";

/** Provider ID for the mock external source. */
export const MOCK_EXTERNAL_PROVIDER_ID = "mock-external";

/** Human-readable label for the mock external provider. */
export const MOCK_EXTERNAL_PROVIDER_LABEL = "External Product Source (Mock)";

/**
 * Mock external product data provider.
 *
 * Reuses the same demo data as StaticCatalogProvider to demonstrate
 * the external provider architecture. In production, this would be
 * replaced with a real API client (e.g., a marketplace API).
 *
 * The provider intentionally behaves asynchronously to simulate
 * network latency and demonstrates that the fallback system works
 * with real-world async patterns.
 */
export class MockExternalProvider implements ProductDataProvider {
  readonly id = MOCK_EXTERNAL_PROVIDER_ID;
  readonly label = MOCK_EXTERNAL_PROVIDER_LABEL;

  async getProducts(request: ProductDataRequest): Promise<ProductDataResult> {
    const { category, maxBudget, minBudget, limit } = request;

    // Validate category support
    const supportedCategories = Object.keys(DEMO_CATALOGS);
    if (!supportedCategories.includes(category)) {
      throw new ProductProviderError(
        `Unsupported category "${category}". Available: ${supportedCategories.join(", ")}`,
        this.id,
        "unsupported_category",
      );
    }

    // Fetch products (reuses existing demo data — no fabrication)
    let products = getCatalog(category);

    // Apply optional budget pre-filtering
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
        dataSourceType: "external",
        note:
          "Mock external provider used for architecture demonstration. Not live marketplace data.",
      },
    };
  }
}
