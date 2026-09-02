// ============================================================
// DecisionCart — Category Resolver
// Hybrid resolution: registered categories + dynamic categories.
// The decision engine remains category-agnostic.
// ============================================================

import type { CategoryConfig } from "@/types";
import { CATEGORY_CONFIGS } from "./categories";

// --- Constants ---

const VALID_ATTRIBUTE_TYPES = new Set(["numeric", "binary", "enum"]);
const VALID_COMPARISON_DIRECTIONS = new Set([
  "higher_is_better",
  "lower_is_better",
]);
const MIN_ATTRIBUTES = 1;
const MAX_ATTRIBUTES = 20;

// --- Dynamic Category Registry ---

/** In-memory registry of dynamically created category configs. */
const dynamicCategories = new Map<string, CategoryConfig>();

// --- Normalization ---

/**
 * Normalize a category key to a consistent lowercase, trimmed format.
 * Converts spaces/underscores/hyphens to underscores.
 * Example: "Washing Machine" → "washing_machine"
 */
export function normalizeCategoryKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

// --- Validation ---

/** Validation error details for a dynamic CategoryConfig. */
export interface ValidationError {
  field: string;
  message: string;
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: ValidationError[] };

/**
 * Validate a dynamic CategoryConfig for correctness.
 *
 * Checks:
 * - category and label are non-empty strings
 * - attributes array is non-empty with valid size
 * - each attribute has all required fields
 * - attribute types are valid
 * - comparison directions are valid
 * - no duplicate attribute keys
 */
export function validateDynamicCategoryConfig(
  config: CategoryConfig
): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate top-level fields
  if (!config.category || typeof config.category !== "string") {
    errors.push({ field: "category", message: "Category key is required" });
  }

  if (!config.label || typeof config.label !== "string") {
    errors.push({ field: "label", message: "Category label is required" });
  }

  if (!Array.isArray(config.attributes)) {
    errors.push({
      field: "attributes",
      message: "Attributes must be an array",
    });
    return { valid: false, errors };
  }

  if (config.attributes.length < MIN_ATTRIBUTES) {
    errors.push({
      field: "attributes",
      message: `At least ${MIN_ATTRIBUTES} attribute(s) required`,
    });
  }

  if (config.attributes.length > MAX_ATTRIBUTES) {
    errors.push({
      field: "attributes",
      message: `At most ${MAX_ATTRIBUTES} attributes allowed`,
    });
  }

  // Validate individual attributes
  const seenKeys = new Set<string>();

  for (let i = 0; i < config.attributes.length; i++) {
    const attr = config.attributes[i];
    const prefix = `attributes[${i}]`;

    if (!attr.key || typeof attr.key !== "string") {
      errors.push({ field: `${prefix}.key`, message: "Attribute key is required" });
      continue;
    }

    if (!attr.label || typeof attr.label !== "string") {
      errors.push({ field: `${prefix}.label`, message: "Attribute label is required" });
    }

    if (!attr.type || !VALID_ATTRIBUTE_TYPES.has(attr.type)) {
      errors.push({
        field: `${prefix}.type`,
        message: `Invalid type "${attr.type}". Must be one of: numeric, binary, enum`,
      });
    }

    if (
      !attr.comparisonDirection ||
      !VALID_COMPARISON_DIRECTIONS.has(attr.comparisonDirection)
    ) {
      errors.push({
        field: `${prefix}.comparisonDirection`,
        message: `Invalid comparison direction "${attr.comparisonDirection}". Must be one of: higher_is_better, lower_is_better`,
      });
    }

    if (!attr.description || typeof attr.description !== "string") {
      errors.push({
        field: `${prefix}.description`,
        message: "Attribute description is required",
      });
    }

    // Check for duplicate keys
    const normalizedKey = attr.key.toLowerCase().trim();
    if (seenKeys.has(normalizedKey)) {
      errors.push({
        field: `${prefix}.key`,
        message: `Duplicate attribute key "${attr.key}"`,
      });
    } else {
      seenKeys.add(normalizedKey);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

// --- Registration ---

/**
 * Register a dynamic CategoryConfig.
 *
 * Validates the config before registering. Throws if invalid.
 * Normalizes the category key before storage.
 */
export function registerDynamicCategory(
  config: CategoryConfig
): CategoryConfig {
  const normalizedKey = normalizeCategoryKey(config.category);
  if (!normalizedKey) {
    throw new Error("Category key cannot be empty after normalization");
  }

  // Validate the config
  const result = validateDynamicCategoryConfig(config);
  if (!result.valid) {
    const messages = result.errors.map((e) => `${e.field}: ${e.message}`);
    throw new Error(
      `Invalid dynamic category config: ${messages.join("; ")}`
    );
  }

  // Create a copy with the normalized key
  const normalizedConfig: CategoryConfig = {
    ...config,
    category: normalizedKey,
    label: config.label.trim(),
  };

  dynamicCategories.set(normalizedKey, normalizedConfig);
  return normalizedConfig;
}

/**
 * Remove a dynamic category from the registry.
 * Returns true if removed, false if not found.
 */
export function unregisterDynamicCategory(category: string): boolean {
  return dynamicCategories.delete(normalizeCategoryKey(category));
}

/**
 * Get all dynamically registered category keys.
 */
export function getDynamicCategoryKeys(): string[] {
  return Array.from(dynamicCategories.keys());
}

/**
 * Clear all dynamic categories (for testing).
 */
export function clearDynamicCategories(): void {
  dynamicCategories.clear();
}

// --- Resolution ---

export interface CategoryResolutionResult {
  config: CategoryConfig;
  source: "registered" | "dynamic";
}

/**
 * Resolve a CategoryConfig by category key.
 *
 * Resolution order:
 * 1. Registered categories (from CATEGORY_CONFIGS)
 * 2. Dynamic categories (from in-memory registry)
 *
 * Returns undefined only when the category is not found in either registry.
 * Use `resolveCategoryConfigStrict` for cases where a missing config is an error.
 */
export function resolveCategoryConfig(
  category: string
): CategoryResolutionResult | undefined {
  const normalizedKey = normalizeCategoryKey(category);

  // 1. Check registered categories first
  const registered = CATEGORY_CONFIGS[normalizedKey];
  if (registered) {
    return { config: registered, source: "registered" };
  }

  // 2. Check dynamic categories
  const dynamic = dynamicCategories.get(normalizedKey);
  if (dynamic) {
    return { config: dynamic, source: "dynamic" };
  }

  return undefined;
}

/**
 * Resolve a CategoryConfig, throwing if not found.
 * Use when a valid config is required (e.g., before running the decision engine).
 */
export function resolveCategoryConfigStrict(
  category: string
): CategoryResolutionResult {
  const result = resolveCategoryConfig(category);
  if (!result) {
    throw new Error(
      `No category config found for "${category}". ` +
        `Available registered categories: ${Object.keys(CATEGORY_CONFIGS).join(", ")}. ` +
        `Available dynamic categories: ${getDynamicCategoryKeys().join(", ") || "(none)"}.`
    );
  }
  return result;
}

/**
 * Get all available category configs (registered + dynamic).
 * Registered categories take precedence if keys overlap.
 */
export function getAllCategoryConfigs(): CategoryConfig[] {
  const configs: CategoryConfig[] = [];

  // Add registered categories
  for (const config of Object.values(CATEGORY_CONFIGS)) {
    configs.push(config);
  }

  // Add dynamic categories (skip any that overlap with registered)
  for (const [key, config] of dynamicCategories) {
    if (!(key in CATEGORY_CONFIGS)) {
      configs.push(config);
    }
  }

  return configs;
}

/**
 * Check if a category exists (registered or dynamic).
 */
export function categoryExists(category: string): boolean {
  const normalizedKey = normalizeCategoryKey(category);
  return normalizedKey in CATEGORY_CONFIGS || dynamicCategories.has(normalizedKey);
}
