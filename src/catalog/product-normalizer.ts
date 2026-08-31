// ============================================================
// DecisionCart — Product Normalization Layer
// Converts heterogeneous raw provider data into the normalized
// Product model. Category-agnostic: driven entirely by
// CategoryConfig and AttributeAliasMap.
// ============================================================

import type { Product, CategoryConfig, AttributeConfig, DataConfidence } from "@/types";

// --- Raw Product Contract ---

/**
 * Flexible raw product data from external providers.
 * Specifications may use inconsistent field names across providers.
 * The alias system maps these to canonical attribute keys.
 */
export interface RawProduct {
  id?: string;
  name?: string;
  brand?: string;
  category?: string;
  price?: number | string;
  imageUrl?: string;
  /** Provider-specific specifications with arbitrary key names. */
  specifications?: Record<string, number | boolean | string | null | undefined>;
}

// --- Alias System ---

/**
 * Maps canonical attribute keys to possible source field names.
 * Case-insensitive matching is applied during lookup.
 * Extensible: new categories can add aliases without changing
 * the normalization algorithm.
 */
export type AttributeAliasMap = Record<string, string[]>;

/**
 * Options for customizing normalization behavior.
 */
export interface ProductNormalizationOptions {
  /** Override or extend the default alias map for this normalization call. */
  aliases?: AttributeAliasMap;
  /** Human-readable name of the data source (used in evidence strings). */
  sourceName?: string;
  /** Override confidence for specific attributes. */
  confidenceOverrides?: Record<string, DataConfidence>;
  /** Prefix for evidence strings (default: "Source specification"). */
  evidencePrefix?: string;
}

// --- Error Types ---

/** Error codes for product normalization failures. */
export type ProductNormalizationErrorCode =
  | "invalid_product"
  | "invalid_price"
  | "missing_name"
  | "category_mismatch";

/**
 * Typed error thrown when product normalization fails at the
 * core product identity level. Individual attribute failures
 * do NOT throw — they produce null values with unknown confidence.
 */
export class ProductNormalizationError extends Error {
  constructor(
    message: string,
    public readonly code: ProductNormalizationErrorCode,
  ) {
    super(message);
    this.name = "ProductNormalizationError";
  }
}

// --- Normalization Result ---

/** Result of normalizing a single product. */
export interface NormalizationResult {
  /** The normalized product, or null if normalization failed. */
  product: Product | null;
  /** Error if normalization failed. */
  error?: ProductNormalizationError;
  /** Number of attributes successfully normalized. */
  normalizedCount: number;
  /** Number of attributes with unknown/missing data. */
  unknownCount: number;
}

// --- Default Alias Maps ---

/**
 * Default alias map for smartphones.
 * Maps canonical attribute keys to common provider specification names.
 */
export const DEFAULT_SMARTPHONE_ALIASES: AttributeAliasMap = {
  camera_score: ["camera_score", "camera", "camera_quality", "cameras"],
  battery_mah: ["battery", "battery_capacity", "battery_mah", "battery_life"],
  display_inches: ["display", "screen", "screen_size", "display_size", "display_inches"],
  ram_gb: ["ram", "memory", "ram_gb", "system_memory"],
  storage_gb: ["storage", "internal_storage", "storage_gb", "capacity"],
  five_g: ["5g", "five_g", "network_5g", "network"],
};

/**
 * Default alias map for laptops.
 */
export const DEFAULT_LAPTOP_ALIASES: AttributeAliasMap = {
  processor_score: ["processor", "processor_score", "cpu", "cpu_score", "benchmark"],
  ram_gb: ["ram", "memory", "ram_gb", "system_memory"],
  battery_hours: ["battery", "battery_hours", "battery_life", "battery_capacity"],
  display_inches: ["display", "screen", "screen_size", "display_size", "display_inches"],
  weight_kg: ["weight", "weight_kg", "mass"],
  ssd_gb: ["ssd", "ssd_gb", "storage", "internal_storage", "capacity"],
};

/** Combined default alias map covering all known categories. */
export const DEFAULT_ALIAS_MAP: AttributeAliasMap = {
  ...DEFAULT_SMARTPHONE_ALIASES,
  ...DEFAULT_LAPTOP_ALIASES,
};

// --- Value Extraction Helpers ---

/**
 * Safely extract a numeric value from a raw specification value.
 * Handles numbers, numeric strings, and strings with unit suffixes.
 * Returns null for unparseable values — never throws.
 *
 * Examples:
 *   8          → 8
 *   "8 GB"     → 8
 *   "256GB"    → 256
 *   "5000 mAh" → 5000
 *   "6.7 inches" → 6.7
 *   "unknown"  → null
 *   null       → null
 */
export function extractNumericValue(
  value: number | boolean | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;

  // Direct number passthrough
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    // Trim whitespace
    const trimmed = value.trim();
    if (trimmed === "" || trimmed.toLowerCase() === "unknown") return null;

    // Try direct parse first (handles "8", "256", "6.7")
    const direct = Number(trimmed);
    if (Number.isFinite(direct)) return direct;

    // Extract first numeric value from string (handles "8 GB", "5000 mAh")
    const match = trimmed.match(/[-+]?\d*\.?\d+/);
    if (match) {
      const parsed = Number(match[0]);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  // Boolean — technically numeric but not meaningful as a product spec
  return null;
}

/**
 * Normalize a value to a boolean for binary attributes.
 * Supports common representations: true/false, "true"/"false",
 * "yes"/"no", "supported"/"not supported", "5G", etc.
 * Returns null for ambiguous values.
 *
 * Examples:
 *   true                    → true
 *   "yes"                   → true
 *   "5G"                    → true
 *   "supported"             → true
 *   false                   → false
 *   "no"                    → false
 *   "not supported"         → false
 *   null                    → null
 */
export function extractBinaryValue(
  value: number | boolean | string | null | undefined,
): boolean | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }

  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "") return null;

    // Truthy representations
    if (
      lower === "true" ||
      lower === "yes" ||
      lower === "supported" ||
      lower === "1"
    ) {
      return true;
    }

    // Check for presence-based truthiness (e.g., "5G" = true for five_g)
    // Only match if the value contains a meaningful positive signal
    if (lower === "5g" || lower === "5g+") {
      return true;
    }

    // Falsy representations
    if (
      lower === "false" ||
      lower === "no" ||
      lower === "not supported" ||
      lower === "0"
    ) {
      return false;
    }

    return null;
  }

  return null;
}

/**
 * Normalize a value for enum attributes.
 * Preserves the string value as-is.
 * Returns null for non-string values.
 */
export function extractEnumValue(
  value: number | boolean | string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed !== "" ? trimmed : null;
  }
  // Non-string values are not valid enums
  return null;
}

// --- Alias Resolution ---

/**
 * Find the matching canonical attribute key for a raw specification key.
 * Uses case-insensitive lookup against the alias map.
 *
 * @param specKey - The raw specification key to look up
 * @param aliasMap - The alias map for the current normalization
 * @returns The canonical attribute key, or null if no match
 */
export function resolveAttributeKey(
  specKey: string,
  aliasMap: AttributeAliasMap,
): string | null {
  const normalizedKey = specKey.trim().toLowerCase();
  for (const [canonicalKey, aliases] of Object.entries(aliasMap)) {
    for (const alias of aliases) {
      if (alias.toLowerCase() === normalizedKey) {
        return canonicalKey;
      }
    }
  }
  return null;
}

/**
 * Find the raw value for a canonical attribute key by trying all aliases.
 * Returns the first matching value found in the specifications.
 *
 * @param canonicalKey - The canonical attribute key
 * @param specifications - The raw specifications object
 * @param aliasMap - The alias map for the current normalization
 * @returns A tuple of [rawValue, rawSpecKey] or [null, null] if not found
 */
export function findRawValue(
  canonicalKey: string,
  specifications: Record<string, number | boolean | string | null | undefined>,
  aliasMap: AttributeAliasMap,
): [value: number | boolean | string | null | undefined, rawKey: string | null] {
  const aliases = aliasMap[canonicalKey];
  if (!aliases) return [null, null];

  for (const alias of aliases) {
    // Case-insensitive search through specification keys
    for (const [specKey, specValue] of Object.entries(specifications)) {
      if (specKey.trim().toLowerCase() === alias.toLowerCase()) {
        return [specValue, specKey];
      }
    }
  }

  return [null, null];
}

// --- Deterministic Fallback ID ---

/**
 * Generate a deterministic fallback ID based on available product fields.
 * Uses a simple hash of name + brand + category — never uses random values.
 *
 * @param name - Product name
 * @param brand - Product brand
 * @param category - Product category
 * @returns A deterministic ID string
 */
export function generateDeterministicId(
  name: string,
  brand: string,
  category: string,
): string {
  // Simple deterministic hash using string combination
  // This is intentionally simple — no crypto needed for IDs
  const input = `${brand}:${name}:${category}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `normalized-${Math.abs(hash).toString(36)}`;
}

// --- Price Normalization ---

/**
 * Normalize price to a valid finite number.
 * Returns the numeric price or null if invalid.
 */
export function normalizePrice(
  price: number | string | null | undefined,
): number | null {
  if (price === null || price === undefined) return null;

  if (typeof price === "number") {
    return Number.isFinite(price) && price >= 0 ? price : null;
  }

  if (typeof price === "string") {
    const trimmed = price.trim();
    if (trimmed === "") return null;

    // Extract numeric value, ignoring currency symbols
    const match = trimmed.match(/[\d,.]+/);
    if (match) {
      // Remove commas for thousand separators (e.g., "29,999" → "29999")
      const cleaned = match[0].replace(/,/g, "");
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    }

    return null;
  }

  return null;
}

// --- Core Normalization ---

/**
 * Normalize a single attribute based on its AttributeConfig type.
 * Returns the normalized value, confidence, and evidence.
 */
function normalizeAttribute(
  attributeConfig: AttributeConfig,
  rawValue: number | boolean | string | null | undefined,
  rawKey: string | null,
  options: ProductNormalizationOptions,
): {
  value: number | boolean | string | null;
  confidence: DataConfidence;
  evidence: string | null;
} {
  // Check for confidence overrides
  const overrideConfidence = options.confidenceOverrides?.[attributeConfig.key];

  // If the raw value is null/undefined, it's missing
  if (rawValue === null || rawValue === undefined) {
    return {
      value: null,
      confidence: "unknown",
      evidence: null,
    };
  }

  let normalizedValue: number | boolean | string | null;
  let confidence: DataConfidence = "high";
  let evidence: string | null = null;

  switch (attributeConfig.type) {
    case "numeric": {
      normalizedValue = extractNumericValue(rawValue);
      if (normalizedValue === null) {
        confidence = "unknown";
      }
      break;
    }
    case "binary": {
      normalizedValue = extractBinaryValue(rawValue);
      if (normalizedValue === null) {
        confidence = "unknown";
      }
      break;
    }
    case "enum": {
      normalizedValue = extractEnumValue(rawValue);
      if (normalizedValue === null) {
        confidence = "unknown";
      }
      break;
    }
    default: {
      // Unknown attribute type — treat as unknown
      normalizedValue = null;
      confidence = "unknown";
    }
  }

  // Build evidence if successfully parsed
  if (normalizedValue !== null && confidence === "high") {
    const sourceKey = rawKey ?? attributeConfig.key;
    const prefix = options.evidencePrefix ?? "Source specification";
    evidence = `${prefix}: ${sourceKey} = ${String(rawValue)}`;
  }

  // Apply confidence overrides if provided
  if (overrideConfidence !== undefined) {
    confidence = overrideConfidence;
  }

  return { value: normalizedValue, confidence, evidence };
}

/**
 * Normalize a raw product into the normalized Product model.
 *
 * This is the main entry point for the normalization layer.
 * It works with any CategoryConfig — no category-specific logic.
 *
 * The function:
 * 1. Validates core product identity (name, price)
 * 2. Iterates CategoryConfig attributes
 * 3. Resolves aliases to find raw values
 * 4. Normalizes values based on attribute type
 * 5. Assigns confidence levels
 * 6. Preserves evidence
 *
 * @param rawProduct - The raw provider product data
 * @param categoryConfig - The category configuration defining expected attributes
 * @param options - Optional normalization options
 * @returns NormalizationResult with the normalized product or error
 * @throws Never throws — returns error in result
 */
export function normalizeProduct(
  rawProduct: RawProduct,
  categoryConfig: CategoryConfig,
  options: ProductNormalizationOptions = {},
): NormalizationResult {
  // --- Validate core product identity ---

  // Name is required
  const name =
    typeof rawProduct.name === "string" && rawProduct.name.trim() !== ""
      ? rawProduct.name.trim()
      : null;

  if (!name) {
    return {
      product: null,
      error: new ProductNormalizationError(
        "Product name is required for normalization",
        "missing_name",
      ),
      normalizedCount: 0,
      unknownCount: 0,
    };
  }

  // Price must be valid
  const price = normalizePrice(rawProduct.price);
  if (price === null) {
    return {
      product: null,
      error: new ProductNormalizationError(
        `Invalid or missing price for product "${name}"`,
        "invalid_price",
      ),
      normalizedCount: 0,
      unknownCount: 0,
    };
  }

  // Category must match the config
  const rawCategory =
    typeof rawProduct.category === "string" && rawProduct.category.trim() !== ""
      ? rawProduct.category.trim().toLowerCase()
      : null;

  if (rawCategory && rawCategory !== categoryConfig.category.toLowerCase()) {
    return {
      product: null,
      error: new ProductNormalizationError(
        `Category mismatch: raw product category "${rawCategory}" does not match config category "${categoryConfig.category}"`,
        "category_mismatch",
      ),
      normalizedCount: 0,
      unknownCount: 0,
    };
  }

  // --- Resolve base fields ---

  const id =
    typeof rawProduct.id === "string" && rawProduct.id.trim() !== ""
      ? rawProduct.id.trim()
      : generateDeterministicId(name, rawProduct.brand ?? "Unknown", categoryConfig.category);

  const brand =
    typeof rawProduct.brand === "string" && rawProduct.brand.trim() !== ""
      ? rawProduct.brand.trim()
      : "Unknown";

  const category = categoryConfig.category;
  const imageUrl =
    typeof rawProduct.imageUrl === "string" && rawProduct.imageUrl.trim() !== ""
      ? rawProduct.imageUrl.trim()
      : undefined;

  // --- Normalize attributes ---

  const specifications = rawProduct.specifications ?? {};
  const mergedAliases: AttributeAliasMap = {
    ...DEFAULT_ALIAS_MAP,
    ...options.aliases,
  };

  const attributes: Record<string, number | boolean | string | null> = {};
  const confidence: Record<string, DataConfidence> = {};
  const evidence: Record<string, string> = {};

  let normalizedCount = 0;
  let unknownCount = 0;

  for (const attrConfig of categoryConfig.attributes) {
    // Find the raw value using alias resolution
    const [rawValue, rawKey] = findRawValue(
      attrConfig.key,
      specifications,
      mergedAliases,
    );

    // Normalize the attribute
    const result = normalizeAttribute(attrConfig, rawValue, rawKey, options);

    // Set the normalized value — always set, even if null
    attributes[attrConfig.key] = result.value;
    confidence[attrConfig.key] = result.confidence;

    if (result.confidence === "unknown") {
      unknownCount++;
    } else {
      normalizedCount++;
    }

    // Only add evidence for successfully parsed values
    if (result.evidence !== null) {
      evidence[attrConfig.key] = result.evidence;
    }
  }

  // --- Build normalized product ---

  const product: Product = {
    id,
    name,
    brand,
    category,
    price,
    attributes,
    confidence,
  };

  // Only add imageUrl and evidence if they have content
  if (imageUrl !== undefined) {
    product.imageUrl = imageUrl;
  }
  if (Object.keys(evidence).length > 0) {
    product.evidence = evidence;
  }

  return {
    product,
    normalizedCount,
    unknownCount,
  };
}

/**
 * Normalize multiple raw products for a given category.
 * Returns all successfully normalized products and any errors.
 *
 * @param rawProducts - Array of raw provider product data
 * @param categoryConfig - The category configuration
 * @param options - Optional normalization options
 * @returns Object with normalized products and errors
 */
export function normalizeProducts(
  rawProducts: RawProduct[],
  categoryConfig: CategoryConfig,
  options: ProductNormalizationOptions = {},
): {
  products: Product[];
  errors: { index: number; error: ProductNormalizationError }[];
  stats: { total: number; succeeded: number; failed: number };
} {
  const products: Product[] = [];
  const errors: { index: number; error: ProductNormalizationError }[] = [];

  for (let i = 0; i < rawProducts.length; i++) {
    const result = normalizeProduct(rawProducts[i], categoryConfig, options);
    if (result.product) {
      products.push(result.product);
    }
    if (result.error) {
      errors.push({ index: i, error: result.error });
    }
  }

  return {
    products,
    errors,
    stats: {
      total: rawProducts.length,
      succeeded: products.length,
      failed: errors.length,
    },
  };
}
