// ============================================================
// DecisionCart — Category Configurations
// Adding a new category = adding a config entry. Zero code changes.
// ============================================================

import type { CategoryConfig } from "@/types";

export const SMARTPHONE_CONFIG: CategoryConfig = {
  category: "smartphone",
  label: "Smartphone",
  attributes: [
    {
      key: "camera_score",
      label: "Camera Quality",
      type: "numeric",
      comparisonDirection: "higher_is_better",
      description: "Overall camera quality score (composite of resolution, features, low-light performance)",
      defaultImportance: 3,
    },
    {
      key: "battery_mah",
      label: "Battery Life",
      type: "numeric",
      unit: "mAh",
      comparisonDirection: "higher_is_better",
      description: "Battery capacity in milliamp-hours",
      defaultImportance: 2,
    },
    {
      key: "display_inches",
      label: "Display Size",
      type: "numeric",
      unit: "inches",
      comparisonDirection: "higher_is_better",
      description: "Screen diagonal size",
      defaultImportance: 2,
    },
    {
      key: "ram_gb",
      label: "Performance (RAM)",
      type: "numeric",
      unit: "GB",
      comparisonDirection: "higher_is_better",
      description: "Random access memory capacity",
      defaultImportance: 3,
    },
    {
      key: "storage_gb",
      label: "Storage",
      type: "numeric",
      unit: "GB",
      comparisonDirection: "higher_is_better",
      description: "Internal storage capacity",
      defaultImportance: 2,
    },
    {
      key: "five_g",
      label: "5G Support",
      type: "binary",
      comparisonDirection: "higher_is_better",
      description: "Whether the device supports 5G connectivity",
      defaultImportance: 1,
    },
  ],
};

export const LAPTOP_CONFIG: CategoryConfig = {
  category: "laptop",
  label: "Laptop",
  attributes: [
    {
      key: "processor_score",
      label: "Processor Performance",
      type: "numeric",
      comparisonDirection: "higher_is_better",
      description: "CPU performance score based on benchmark",
      defaultImportance: 3,
    },
    {
      key: "ram_gb",
      label: "RAM",
      type: "numeric",
      unit: "GB",
      comparisonDirection: "higher_is_better",
      description: "Random access memory capacity",
      defaultImportance: 3,
    },
    {
      key: "battery_hours",
      label: "Battery Life",
      type: "numeric",
      unit: "hours",
      comparisonDirection: "higher_is_better",
      description: "Estimated battery life under typical use",
      defaultImportance: 2,
    },
    {
      key: "display_inches",
      label: "Display Size",
      type: "numeric",
      unit: "inches",
      comparisonDirection: "higher_is_better",
      description: "Screen diagonal size",
      defaultImportance: 2,
    },
    {
      key: "weight_kg",
      label: "Portability",
      type: "numeric",
      unit: "kg",
      comparisonDirection: "lower_is_better",
      description: "Device weight (lighter is better for portability)",
      defaultImportance: 2,
    },
    {
      key: "ssd_gb",
      label: "Storage",
      type: "numeric",
      unit: "GB",
      comparisonDirection: "higher_is_better",
      description: "SSD storage capacity",
      defaultImportance: 2,
    },
  ],
};

export const CATEGORY_CONFIGS: Record<string, CategoryConfig> = {
  smartphone: SMARTPHONE_CONFIG,
  laptop: LAPTOP_CONFIG,
};

export function getCategoryConfig(category: string): CategoryConfig | undefined {
  return CATEGORY_CONFIGS[category];
}
