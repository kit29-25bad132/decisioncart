// ============================================================
// DecisionCart — Demo Catalog Data
// Clearly structured as DEMO / FIXTURE data.
// NOT live marketplace data. Prices are illustrative.
// ============================================================

import type { Product } from "@/types";

// --- Smartphones (Demo / Fixture Data) ---

export const DEMO_SMARTPHONES: Product[] = [
  {
    id: "phone-001",
    name: "Samsung Galaxy S24 FE",
    brand: "Samsung",
    category: "smartphone",
    price: 29999,
    attributes: {
      camera_score: 82,
      battery_mah: 4700,
      display_inches: 6.7,
      ram_gb: 8,
      storage_gb: 128,
      five_g: true,
    },
    confidence: {
      camera_score: "high",
      battery_mah: "high",
      display_inches: "high",
      ram_gb: "high",
      storage_gb: "high",
      five_g: "high",
    },
  },
  {
    id: "phone-002",
    name: "Google Pixel 8a",
    brand: "Google",
    category: "smartphone",
    price: 37999,
    attributes: {
      camera_score: 88,
      battery_mah: 4500,
      display_inches: 6.1,
      ram_gb: 8,
      storage_gb: 128,
      five_g: true,
    },
    confidence: {
      camera_score: "high",
      battery_mah: "high",
      display_inches: "high",
      ram_gb: "high",
      storage_gb: "high",
      five_g: "high",
    },
  },
  {
    id: "phone-003",
    name: "OnePlus Nord 4",
    brand: "OnePlus",
    category: "smartphone",
    price: 26999,
    attributes: {
      camera_score: 74,
      battery_mah: 5500,
      display_inches: 6.74,
      ram_gb: 12,
      storage_gb: 256,
      five_g: true,
    },
    confidence: {
      camera_score: "high",
      battery_mah: "high",
      display_inches: "high",
      ram_gb: "high",
      storage_gb: "high",
      five_g: "high",
    },
  },
  {
    id: "phone-004",
    name: "Realme GT 6T",
    brand: "Realme",
    category: "smartphone",
    price: 21999,
    attributes: {
      camera_score: 70,
      battery_mah: 5500,
      display_inches: 6.78,
      ram_gb: 8,
      storage_gb: 256,
      five_g: true,
    },
    confidence: {
      camera_score: "medium",
      battery_mah: "high",
      display_inches: "high",
      ram_gb: "high",
      storage_gb: "high",
      five_g: "high",
    },
  },
  {
    id: "phone-005",
    name: "Nothing Phone (2a) Plus",
    brand: "Nothing",
    category: "smartphone",
    price: 27999,
    attributes: {
      camera_score: 76,
      battery_mah: 5000,
      display_inches: 6.7,
      ram_gb: 8,
      storage_gb: 256,
      five_g: true,
    },
    confidence: {
      camera_score: "medium",
      battery_mah: "high",
      display_inches: "high",
      ram_gb: "high",
      storage_gb: "high",
      five_g: "high",
    },
  },
  {
    id: "phone-006",
    name: "iPhone SE (2022)",
    brand: "Apple",
    category: "smartphone",
    price: 49900,
    attributes: {
      camera_score: 72,
      battery_mah: 2018,
      display_inches: 4.7,
      ram_gb: 4,
      storage_gb: 64,
      five_g: true,
    },
    confidence: {
      camera_score: "high",
      battery_mah: "high",
      display_inches: "high",
      ram_gb: "high",
      storage_gb: "high",
      five_g: "high",
    },
  },
];

// --- Laptops (Demo / Fixture Data) ---

export const DEMO_LAPTOPS: Product[] = [
  {
    id: "laptop-001",
    name: "MacBook Air M3",
    brand: "Apple",
    category: "laptop",
    price: 99900,
    attributes: {
      processor_score: 90,
      ram_gb: 16,
      battery_hours: 18,
      display_inches: 13.6,
      weight_kg: 1.24,
      ssd_gb: 256,
    },
    confidence: {
      processor_score: "high",
      ram_gb: "high",
      battery_hours: "high",
      display_inches: "high",
      weight_kg: "high",
      ssd_gb: "high",
    },
  },
  {
    id: "laptop-002",
    name: "Lenovo IdeaPad Slim 5",
    brand: "Lenovo",
    category: "laptop",
    price: 54999,
    attributes: {
      processor_score: 72,
      ram_gb: 16,
      battery_hours: 10,
      display_inches: 15.6,
      weight_kg: 1.65,
      ssd_gb: 512,
    },
    confidence: {
      processor_score: "medium",
      ram_gb: "high",
      battery_hours: "medium",
      display_inches: "high",
      weight_kg: "high",
      ssd_gb: "high",
    },
  },
  {
    id: "laptop-003",
    name: "ASUS VivoBook 15",
    brand: "ASUS",
    category: "laptop",
    price: 42999,
    attributes: {
      processor_score: 65,
      ram_gb: 8,
      battery_hours: 7,
      display_inches: 15.6,
      weight_kg: 1.7,
      ssd_gb: 512,
    },
    confidence: {
      processor_score: "medium",
      ram_gb: "high",
      battery_hours: "medium",
      display_inches: "high",
      weight_kg: "high",
      ssd_gb: "high",
    },
  },
  {
    id: "laptop-004",
    name: "HP Pavilion 14",
    brand: "HP",
    category: "laptop",
    price: 51999,
    attributes: {
      processor_score: 70,
      ram_gb: 16,
      battery_hours: 9,
      display_inches: 14,
      weight_kg: 1.41,
      ssd_gb: 512,
    },
    confidence: {
      processor_score: "medium",
      ram_gb: "high",
      battery_hours: "medium",
      display_inches: "high",
      weight_kg: "high",
      ssd_gb: "high",
    },
  },
  {
    id: "laptop-005",
    name: "Acer Aspire 5",
    brand: "Acer",
    category: "laptop",
    price: 38999,
    attributes: {
      processor_score: 58,
      ram_gb: 8,
      battery_hours: 8,
      display_inches: 15.6,
      weight_kg: 1.8,
      ssd_gb: 512,
    },
    confidence: {
      processor_score: "low",
      ram_gb: "high",
      battery_hours: "low",
      display_inches: "high",
      weight_kg: "high",
      ssd_gb: "high",
    },
  },
];

export const DEMO_CATALOGS: Record<string, Product[]> = {
  smartphone: DEMO_SMARTPHONES,
  laptop: DEMO_LAPTOPS,
};

export function getCatalog(category: string): Product[] {
  return DEMO_CATALOGS[category] ?? [];
}
