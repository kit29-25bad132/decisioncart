# DecisionCart — Decision Engine

## Overview

The Decision Engine is the **deterministic core** of DecisionCart. It takes structured intent and catalog data, then produces scored, ranked products with full explainability. It contains **zero AI inference** — every calculation is reproducible, auditable, and testable.

---

## Core Principles

1. **Deterministic**: Same inputs always produce the same outputs.
2. **Category-agnostic**: No hard-coded product fields. All comparison logic is driven by configuration.
3. **Evidence-based**: Only uses data that exists in the catalog. Missing data is represented honestly.
4. **Transparent**: Every score can be decomposed into its component contributions.
5. **Auditable**: The full scoring log is recorded for every decision.

---

## Category Configuration

Each product category has a `categoryConfig` that defines:

```typescript
interface CategoryConfig {
  category: string;              // e.g., "smartphone", "laptop", "running_shoe"
  attributes: AttributeConfig[]; // What to compare and how
}

interface AttributeConfig {
  key: string;                   // Unique identifier, e.g., "camera_megapixels"
  label: string;                 // Human-readable, e.g., "Camera (MP)"
  type: "numeric" | "binary" | "enum";
  unit?: string;                 // e.g., "MP", "hours", "GB"
  comparisonDirection: "higher_is_better" | "lower_is_better";
  description: string;           // What this attribute means
}
```

**Example** — Smartphone category config:

| Attribute Key | Label | Type | Direction |
|---|---|---|---|
| `camera_score` | Camera Quality | numeric | higher_is_better |
| `battery_mah` | Battery (mAh) | numeric | higher_is_better |
| `display_inches` | Display Size | numeric | higher_is_better |
| `ram_gb` | RAM (GB) | numeric | higher_is_better |
| `storage_gb` | Storage (GB) | numeric | higher_is_better |
| `price` | Price (₹) | numeric | lower_is_better |
| `5g_support` | 5G Support | binary | higher_is_better |

**Example** — Running shoe category config:

| Attribute Key | Label | Type | Direction |
|---|---|---|---|
| `cushioning_level` | Cushioning | numeric | higher_is_better |
| `weight_grams` | Weight (g) | numeric | lower_is_better |
| `drop_mm` | Heel-to-Toe Drop | numeric | varies |
| `price` | Price (₹) | numeric | lower_is_better |
| `waterproof` | Waterproof | binary | higher_is_better |

Adding a new category requires **zero code changes** — only a new config entry and catalog data.

---

## Decision Matrix Construction

The Decision Matrix is a table where:
- **Rows** = products from the catalog that pass hard constraints
- **Columns** = category-specific comparison parameters
- **Cells** = attribute values (normalized)

### Normalization

All numeric attributes are normalized to a 0–1 scale within the current product set:

```
For higher_is_better:
  normalized = (value - min) / (max - min)

For lower_is_better:
  normalized = (max - value) / (max - min)
```

Binary attributes: `1` (true) or `0` (false).

Enum attributes: Mapped to ordinal values based on a predefined order.

---

## Deterministic Scoring

### Weight Assignment

The user's stated priorities determine weights. If the user says "I care most about camera and battery," the engine assigns:

- `camera_score`: weight = 0.6
- `battery_mah`: weight = 0.4
- All other attributes: weight = 0

Weights are derived deterministically from priority ordering:
1. User lists priorities in order of importance.
2. Higher-ranked priorities get exponentially more weight.
3. Total weights sum to 1.0.

### Score Calculation

```
DecisionScore(product) = Σ (weight_i × normalized_value_i)
```

Where `i` iterates over all attributes with non-zero weights.

### Ranking

Products are sorted by DecisionScore in descending order. Ties are broken by:
1. Price (lower is better)
2. Catalog ID (alphabetical, for stability)

---

## Evidence & Hallucination Boundaries

This is one of the most important design constraints in DecisionCart.

### What the Engine CAN Do
- Use all attributes present in the catalog.
- Normalize and compare numeric, binary, and enum attributes.
- Calculate scores with full mathematical transparency.
- Report when an attribute is missing for a product.

### What the Engine MUST NOT Do
- **Invent missing data.** If a product has no `camera_score` in the catalog, the engine does not guess or interpolate.
- **Assume defaults.** Missing ≠ 0. Missing ≠ average. Missing = unknown.
- **Infer attributes.** The engine never creates attributes that aren't in the `categoryConfig`.

### Handling Missing Data

When an attribute is missing for a product:

1. The cell in the Decision Matrix shows "—" (unknown).
2. The product's score only considers attributes that exist.
3. The weight of missing attributes is **redistributed proportionally** to present attributes.
4. The explanation explicitly states: *"This product's [attribute] data was not available in the catalog."*

This ensures:
- No product is penalized or rewarded for missing data.
- The user is always informed about data gaps.
- Scores remain comparable across products.

---

## Explanation Generation

For each product, the engine produces a structured explanation:

```typescript
interface ScoreExplanation {
  product: Product;
  totalScore: number;
  contributions: {
    attribute: string;
    rawValue: any;
    normalizedValue: number;
    weight: number;
    contribution: number;
  }[];
  missingAttributes: string[];
  strengths: string[];    // Top 2-3 contributing attributes
  weaknesses: string[];   // Lowest contributing attributes
}
```

The AI layer wraps this structured explanation in natural language for the user.

---

## Re-Ranking

When the user changes preferences:

1. Updated weights are calculated from new priority ordering.
2. Scores are recalculated deterministically.
3. Products are re-ranked.
4. Only products with changed rankings are re-explained.
5. The full matrix and new rankings are returned.

This happens in milliseconds — no AI inference required.

---

## Bounded Purchase Flow

When the user requests a purchase:

1. The engine selects the top-ranked product (or the user's explicit choice).
2. It produces a `PurchaseIntent` with:
   - Product ID and details
   - Price (from catalog, never from AI inference)
   - Seller information
   - Session ID
   - Timestamp
3. The payment service takes over from here (see [payment-security.md](./payment-security.md)).
