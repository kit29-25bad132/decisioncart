// ============================================================
// DecisionCart — Demo Review Intelligence Data
// Structured review intelligence for catalog products.
// NOT live web scraping. NOT external API data.
// Clearly modeled as demo/fixture review intelligence.
// ============================================================

import type { ProductReviewIntelligence } from "./types";

// --- Smartphones ---

const SMARTPHONE_REVIEWS: ProductReviewIntelligence[] = [
  {
    productId: "phone-001",
    overallSentiment: "positive",
    sentimentScore: 78,
    summary:
      "Samsung Galaxy S24 FE offers solid all-round performance with a great camera and long battery life. Users appreciate the premium feel at a mid-range price.",
    strengths: [
      { attributeKey: "camera_score", description: "Excellent camera quality with versatile shooting modes", frequency: 5 },
      { attributeKey: "battery_mah", description: "Strong battery life easily lasts a full day", frequency: 4 },
      { attributeKey: "display_inches", description: "Vibrant AMOLED display with smooth refresh rate", frequency: 4 },
    ],
    concerns: [
      { attributeKey: "storage_gb", description: "Base 128GB storage fills up quickly for heavy users", frequency: 3 },
      { attributeKey: "ram_gb", description: "8GB RAM can struggle with heavy multitasking", frequency: 2 },
    ],
    confidence: "high",
  },
  {
    productId: "phone-002",
    overallSentiment: "very_positive",
    sentimentScore: 86,
    summary:
      "Google Pixel 8a is praised for its exceptional camera and clean software experience. Users love the guaranteed Android updates and AI features.",
    strengths: [
      { attributeKey: "camera_score", description: "Best-in-class camera with computational photography", frequency: 5 },
      { attributeKey: "display_inches", description: "Compact and comfortable 6.1-inch display", frequency: 3 },
    ],
    concerns: [
      { attributeKey: "battery_mah", description: "Battery life is adequate but not class-leading", frequency: 3 },
      { attributeKey: "storage_gb", description: "128GB base storage with no expansion option", frequency: 2 },
    ],
    confidence: "high",
  },
  {
    productId: "phone-003",
    overallSentiment: "positive",
    sentimentScore: 80,
    summary:
      "OnePlus Nord 4 delivers impressive performance and battery life at an aggressive price. The large RAM and storage are standout features.",
    strengths: [
      { attributeKey: "battery_mah", description: "Massive 5500mAh battery with fast charging", frequency: 5 },
      { attributeKey: "ram_gb", description: "12GB RAM handles multitasking effortlessly", frequency: 4 },
      { attributeKey: "storage_gb", description: "Generous 256GB storage for media and apps", frequency: 4 },
    ],
    concerns: [
      { attributeKey: "camera_score", description: "Camera is good but falls short of flagships", frequency: 3 },
    ],
    confidence: "high",
  },
  {
    productId: "phone-004",
    overallSentiment: "mixed",
    sentimentScore: 68,
    summary:
      "Realme GT 6T offers excellent value with fast charging and display quality. Camera and brand perception are common trade-offs at this price.",
    strengths: [
      { attributeKey: "battery_mah", description: "Excellent 5500mAh battery with ultra-fast charging", frequency: 5 },
      { attributeKey: "display_inches", description: "Bright and smooth AMOLED display", frequency: 4 },
      { attributeKey: "storage_gb", description: "256GB storage at budget price is generous", frequency: 3 },
    ],
    concerns: [
      { attributeKey: "camera_score", description: "Average camera performance in low light", frequency: 4 },
      { attributeKey: "ram_gb", description: "8GB RAM can lag during intensive gaming", frequency: 2 },
    ],
    confidence: "medium",
  },
  {
    productId: "phone-005",
    overallSentiment: "positive",
    sentimentScore: 75,
    summary:
      "Nothing Phone (2a) Plus stands out with its unique design and Glyph interface. Users love the display and battery but note camera limitations.",
    strengths: [
      { attributeKey: "battery_mah", description: "Reliable 5000mAh battery with solid screen-on time", frequency: 4 },
      { attributeKey: "display_inches", description: "Beautiful 6.7-inch display with unique Glyph notifications", frequency: 4 },
      { attributeKey: "storage_gb", description: "256GB storage is plenty for most users", frequency: 3 },
    ],
    concerns: [
      { attributeKey: "camera_score", description: "Camera quality is decent but not competitive", frequency: 3 },
    ],
    confidence: "medium",
  },
  {
    productId: "phone-006",
    overallSentiment: "mixed",
    sentimentScore: 55,
    summary:
      "iPhone SE (2022) appeals to iOS fans on a budget. The compact design and A15 chip are praised, but the small battery and dated design are frequent complaints.",
    strengths: [
      { attributeKey: "camera_score", description: "Reliable iPhone camera with consistent processing", frequency: 3 },
      { attributeKey: "five_g", description: "5G connectivity at an accessible iPhone price", frequency: 3 },
    ],
    concerns: [
      { attributeKey: "battery_mah", description: "Very small 2018mAh battery drains quickly", frequency: 5 },
      { attributeKey: "display_inches", description: "Small 4.7-inch display feels outdated", frequency: 5 },
      { attributeKey: "storage_gb", description: "Only 64GB base storage is restrictive", frequency: 4 },
      { attributeKey: "ram_gb", description: "4GB RAM struggles with modern apps", frequency: 3 },
    ],
    confidence: "high",
  },
];

// --- Laptops ---

const LAPTOP_REVIEWS: ProductReviewIntelligence[] = [
  {
    productId: "laptop-001",
    overallSentiment: "very_positive",
    sentimentScore: 92,
    summary:
      "MacBook Air M3 is widely regarded as the best ultraportable laptop. Users rave about the fanless design, battery life, and build quality.",
    strengths: [
      { attributeKey: "processor_score", description: "M3 chip delivers exceptional performance and efficiency", frequency: 5 },
      { attributeKey: "battery_hours", description: "Industry-leading 18-hour battery life", frequency: 5 },
      { attributeKey: "weight_kg", description: "Incredibly light at 1.24kg, perfect for travel", frequency: 5 },
    ],
    concerns: [
      { attributeKey: "ssd_gb", description: "Base 256GB SSD fills up quickly for developers", frequency: 3 },
      { attributeKey: "display_inches", description: "13.6-inch screen may feel small for some workflows", frequency: 2 },
    ],
    confidence: "high",
  },
  {
    productId: "laptop-002",
    overallSentiment: "positive",
    sentimentScore: 76,
    summary:
      "Lenovo IdeaPad Slim 5 offers strong value with good performance and a spacious display. Users appreciate the keyboard and upgrade options.",
    strengths: [
      { attributeKey: "ram_gb", description: "16GB RAM handles development workloads well", frequency: 4 },
      { attributeKey: "ssd_gb", description: "Fast 512GB SSD provides ample storage", frequency: 4 },
      { attributeKey: "display_inches", description: "Large 15.6-inch display great for productivity", frequency: 3 },
    ],
    concerns: [
      { attributeKey: "weight_kg", description: "At 1.65kg, it is heavier than ultrabooks", frequency: 3 },
      { attributeKey: "battery_hours", description: "10-hour battery is adequate but not exceptional", frequency: 2 },
    ],
    confidence: "high",
  },
  {
    productId: "laptop-003",
    overallSentiment: "mixed",
    sentimentScore: 65,
    summary:
      "ASUS VivoBook 15 is a budget-friendly option with decent storage. Users note the display quality and build materials could be better.",
    strengths: [
      { attributeKey: "ssd_gb", description: "512GB SSD at this price point is excellent value", frequency: 4 },
      { attributeKey: "display_inches", description: "Spacious 15.6-inch screen for multitasking", frequency: 3 },
    ],
    concerns: [
      { attributeKey: "processor_score", description: "Processor struggles with demanding applications", frequency: 4 },
      { attributeKey: "battery_hours", description: "Only 7 hours of battery limits portable use", frequency: 4 },
      { attributeKey: "weight_kg", description: "Heavy at 1.7kg, not ideal for daily commuting", frequency: 3 },
    ],
    confidence: "medium",
  },
  {
    productId: "laptop-004",
    overallSentiment: "positive",
    sentimentScore: 72,
    summary:
      "HP Pavilion 14 balances performance and portability well. Users praise the build quality and keyboard but note battery can be inconsistent.",
    strengths: [
      { attributeKey: "ram_gb", description: "16GB RAM supports smooth multitasking", frequency: 4 },
      { attributeKey: "ssd_gb", description: "512GB fast storage for files and applications", frequency: 3 },
      { attributeKey: "weight_kg", description: "Reasonably light at 1.41kg for a 14-inch laptop", frequency: 3 },
    ],
    concerns: [
      { attributeKey: "battery_hours", description: "Real-world battery falls short of the advertised 9 hours", frequency: 3 },
      { attributeKey: "processor_score", description: "Processor is adequate but not powerful for heavy workloads", frequency: 2 },
    ],
    confidence: "medium",
  },
  {
    productId: "laptop-005",
    overallSentiment: "mixed",
    sentimentScore: 58,
    summary:
      "Acer Aspire 5 is the most affordable option but makes significant trade-offs. Users find it acceptable for basic tasks but limited for anything demanding.",
    strengths: [
      { attributeKey: "ssd_gb", description: "512GB SSD is generous at this price point", frequency: 3 },
      { attributeKey: "display_inches", description: "Large 15.6-inch screen for the budget", frequency: 3 },
    ],
    concerns: [
      { attributeKey: "processor_score", description: "Entry-level processor struggles with multitasking", frequency: 5 },
      { attributeKey: "battery_hours", description: "8-hour battery is below average for the class", frequency: 3 },
      { attributeKey: "weight_kg", description: "Heaviest option at 1.8kg, not portable", frequency: 4 },
    ],
    confidence: "medium",
  },
];

// --- Lookup Map ---

const ALL_REVIEWS: ProductReviewIntelligence[] = [
  ...SMARTPHONE_REVIEWS,
  ...LAPTOP_REVIEWS,
];

const REVIEW_MAP = new Map<string, ProductReviewIntelligence>(
  ALL_REVIEWS.map((r) => [r.productId, r])
);

/**
 * Get review intelligence for a product by ID.
 * Returns undefined if no review data exists.
 */
export function getReviewForProduct(
  productId: string
): ProductReviewIntelligence | undefined {
  return REVIEW_MAP.get(productId);
}

/**
 * Get review intelligence for multiple products.
 * Returns a map of productId → review intelligence.
 * Products without review data are omitted.
 */
export function getReviewsForProducts(
  productIds: string[]
): Record<string, ProductReviewIntelligence> {
  const result: Record<string, ProductReviewIntelligence> = {};
  for (const id of productIds) {
    const review = REVIEW_MAP.get(id);
    if (review) {
      result[id] = review;
    }
  }
  return result;
}
