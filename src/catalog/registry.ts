// ============================================================
// DecisionCart — Product Provider Registry
// Manages provider selection and registration.
// Allows adding providers without modifying the Decision Engine.
// ============================================================

import type {
  ProductDataProvider,
  ProductDataRequest,
  ProductDataResult,
} from "./provider";
import { ProductProviderError } from "./provider";
import { StaticCatalogProvider } from "./static-provider";

/**
 * Registry of product data providers.
 *
 * Strategy:
 * - Development / default: StaticCatalogProvider
 * - Future: external API, merchant catalog, marketplace
 *
 * Usage:
 *   const result = await getProviderForCategory("smartphone")
 *     .getProducts({ category: "smartphone", maxBudget: 30000 });
 */

/** All registered providers by ID. */
const providers: Map<string, ProductDataProvider> = new Map();

/** Category-to-provider mapping overrides. */
const categoryOverrides: Map<string, string> = new Map();

/** Default provider ID for all categories. */
let defaultProviderId: string | null = null;

// --- Registration ---

/**
 * Register a product data provider.
 * If this is the first provider registered, it becomes the default.
 */
export function registerProvider(provider: ProductDataProvider): void {
  providers.set(provider.id, provider);
  if (defaultProviderId === null) {
    defaultProviderId = provider.id;
  }
}

/**
 * Set the default provider for all categories.
 * Must be a previously registered provider ID.
 */
export function setDefaultProvider(providerId: string): void {
  if (!providers.has(providerId)) {
    throw new Error(
      `Cannot set default provider: "${providerId}" is not registered.`
    );
  }
  defaultProviderId = providerId;
}

/**
 * Override the provider for a specific category.
 * Useful for routing certain categories to specialized providers.
 */
export function setCategoryProvider(
  category: string,
  providerId: string
): void {
  if (!providers.has(providerId)) {
    throw new Error(
      `Cannot set category provider: "${providerId}" is not registered.`
    );
  }
  categoryOverrides.set(category, providerId);
}

/**
 * Get the registered provider for a specific category.
 * Falls back to the default provider if no category-specific override exists.
 */
export function getProviderForCategory(
  category: string
): ProductDataProvider {
  // Check category-specific override first
  const overrideId = categoryOverrides.get(category);
  if (overrideId) {
    const provider = providers.get(overrideId);
    if (provider) return provider;
  }

  // Fall back to default provider
  if (defaultProviderId) {
    const provider = providers.get(defaultProviderId);
    if (provider) return provider;
  }

  throw new ProductProviderError(
    `No provider available for category "${category}".`,
    "registry",
    "unavailable"
  );
}

/**
 * Convenience function: fetch products for a category.
 * Resolves the provider and delegates the request.
 */
export async function fetchProducts(
  request: ProductDataRequest
): Promise<ProductDataResult> {
  const provider = getProviderForCategory(request.category);
  return provider.getProducts(request);
}

// --- Initialization ---

/**
 * Initialize the registry with the default static catalog provider.
 * Called once at startup. Additional providers can be registered later.
 */
export function initializeProviders(): void {
  registerProvider(new StaticCatalogProvider());
}

// --- Introspection ---

/** Get all registered provider IDs. */
export function getRegisteredProviderIds(): string[] {
  return Array.from(providers.keys());
}

/** Check if a provider is registered. */
export function isProviderRegistered(providerId: string): boolean {
  return providers.has(providerId);
}

/** Reset the registry (for testing). */
export function resetRegistry(): void {
  providers.clear();
  categoryOverrides.clear();
  defaultProviderId = null;
}

// Auto-initialize with default provider on import
initializeProviders();
