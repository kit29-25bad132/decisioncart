// ============================================================
// DecisionCart — Fallback Product Provider
// Wraps a primary and fallback provider. If the primary fails
// with a ProductProviderError, the fallback is tried transparently.
// Metadata always truthfully indicates which provider served the result.
// ============================================================

import type {
  ProductDataProvider,
  ProductDataRequest,
  ProductDataResult,
} from "./provider";
import { ProductProviderError } from "./provider";

/**
 * Product data provider with automatic fallback behavior.
 *
 * Attempts the primary provider first. If the primary fails
 * with a `ProductProviderError`, the fallback provider is tried.
 * Metadata always truthfully records whether fallback occurred.
 *
 * Empty results from the primary provider are treated as valid
 * (not a failure) — only actual errors trigger the fallback.
 */
export class FallbackProductProvider implements ProductDataProvider {
  readonly id: string;
  readonly label: string;

  constructor(
    private readonly primaryProvider: ProductDataProvider,
    private readonly fallbackProvider: ProductDataProvider,
  ) {
    this.id = `fallback-${primaryProvider.id}-${fallbackProvider.id}`;
    this.label = `${primaryProvider.label} → ${fallbackProvider.label}`;
  }

  async getProducts(request: ProductDataRequest): Promise<ProductDataResult> {
    try {
      const result = await this.primaryProvider.getProducts(request);
      // Primary succeeded — return as-is (including valid empty results).
      // Enrich metadata with primary provider info and data source type.
      return {
        ...result,
        metadata: {
          ...result.metadata,
          fallbackUsed: false,
          primaryProviderId: this.primaryProvider.id,
          dataSourceType: result.metadata?.dataSourceType ?? "external",
        },
      };
    } catch (error) {
      // Only ProductProviderError triggers fallback.
      if (!(error instanceof ProductProviderError)) {
        // Unexpected error — wrap it and re-throw.
        throw new ProductProviderError(
          `Unexpected error from primary provider "${this.primaryProvider.id}": ${
            error instanceof Error ? error.message : String(error)
          }`,
          this.id,
          "unknown",
        );
      }

      // Primary failed — attempt fallback.
      try {
        const fallbackResult = await this.fallbackProvider.getProducts(request);
        return {
          ...fallbackResult,
          metadata: {
            ...fallbackResult.metadata,
            fallbackUsed: true,
            fallbackProviderId: this.fallbackProvider.id,
            primaryProviderId: this.primaryProvider.id,
            dataSourceType: "hybrid",
          },
        };
      } catch (fallbackError) {
        // Both providers failed — throw with context from both.
        const fallbackMsg =
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError);

        throw new ProductProviderError(
          `Both providers failed for category "${request.category}". ` +
            `Primary "${this.primaryProvider.id}" error: ${error.message}. ` +
            `Fallback "${this.fallbackProvider.id}" error: ${fallbackMsg}.`,
          this.id,
          error.code,
        );
      }
    }
  }
}
