// ============================================================
// DecisionCart — Refinement Intelligence Tests
// Verifies conversational preference refinement behaviors.
// ============================================================

import { describe, it, expect } from "vitest";
import { detectRefinementMode, mergeWithCurrent } from "./parse";
import { detectRefinementMode as fallbackDetectRefinementMode } from "./fallback-parser";
import { CATEGORY_CONFIGS } from "@/catalog/categories";
import type { ParsedShoppingIntent } from "./types";

const smartphoneConfig = CATEGORY_CONFIGS.smartphone!;
const laptopConfig = CATEGORY_CONFIGS.laptop!;

function makeIntent(overrides: Partial<ParsedShoppingIntent>): ParsedShoppingIntent {
  return {
    category: "smartphone",
    priorities: [],
    constraints: [],
    confidence: 0.5,
    originalQuery: "",
    ...overrides,
  };
}

function getCurrentPrefs() {
  return {
    category: "smartphone",
    budget: { max: 30000 },
    priorities: [
      { attributeKey: "camera_score", importance: 2 },
      { attributeKey: "battery_mah", importance: 2 },
      { attributeKey: "display_inches", importance: 2 },
      { attributeKey: "ram_gb", importance: 2 },
      { attributeKey: "storage_gb", importance: 2 },
      { attributeKey: "five_g", importance: 2 },
    ],
  };
}

// ============================================================
// detectRefinementMode — Parse Dispatcher
// ============================================================

describe("detectRefinementMode (parse.ts)", () => {
  // --- Exclusive ---
  it("detects exclusive: \"just focus on camera\"", () => {
    expect(detectRefinementMode("just focus on camera")).toBe("exclusive");
  });

  it("detects exclusive: \"only care about battery\"", () => {
    expect(detectRefinementMode("only care about battery")).toBe("exclusive");
  });

  it("detects exclusive: \"camera is all that matters\"", () => {
    expect(detectRefinementMode("camera is all that matters")).toBe("exclusive");
  });

  it("detects exclusive: \"focus only on performance\"", () => {
    expect(detectRefinementMode("focus only on performance")).toBe("exclusive");
  });

  // --- Ignore ---
  it("detects ignore: \"I don't care about battery\"", () => {
    expect(detectRefinementMode("I don't care about battery")).toBe("ignore");
  });

  it("detects ignore: \"camera doesn't matter\"", () => {
    expect(detectRefinementMode("camera doesn't matter")).toBe("ignore");
  });

  it("detects ignore: \"ignore battery\"", () => {
    expect(detectRefinementMode("ignore battery")).toBe("ignore");
  });

  it("detects ignore: \"display is not important\"", () => {
    expect(detectRefinementMode("display is not important")).toBe("ignore");
  });

  // --- Increase ---
  it("detects increase: \"care more about camera\"", () => {
    expect(detectRefinementMode("care more about camera")).toBe("increase");
  });

  it("detects increase: \"camera matters more\"", () => {
    expect(detectRefinementMode("camera matters more")).toBe("increase");
  });

  it("detects increase: \"increase battery priority\"", () => {
    expect(detectRefinementMode("increase battery priority")).toBe("increase");
  });

  it("detects increase: \"boost camera quality\"", () => {
    expect(detectRefinementMode("boost camera quality")).toBe("increase");
  });

  // --- Decrease ---
  it("detects decrease: \"care less about battery\"", () => {
    expect(detectRefinementMode("care less about battery")).toBe("decrease");
  });

  it("detects decrease: \"battery is less important\"", () => {
    expect(detectRefinementMode("battery is less important")).toBe("decrease");
  });

  it("detects decrease: \"reduce focus on display\"", () => {
    expect(detectRefinementMode("reduce focus on display")).toBe("decrease");
  });

  // --- Budget ---
  it("detects budget: \"make it 35000\"", () => {
    expect(detectRefinementMode("make it 35000")).toBe("budget");
  });

  it("detects budget: \"increase budget to 40k\"", () => {
    expect(detectRefinementMode("increase budget to 40k")).toBe("budget");
  });

  // --- Normal (fresh queries) ---
  it("detects normal: \"Best laptop under 60000\"", () => {
    expect(detectRefinementMode("Best laptop under 60000")).toBe("normal");
  });

  it("detects normal: \"Best phone under ₹30,000 with great camera\"", () => {
    expect(detectRefinementMode("Best phone under ₹30,000 with great camera")).toBe("normal");
  });

  it("detects normal: \"Phone with best battery life\"", () => {
    expect(detectRefinementMode("Phone with best battery life")).toBe("normal");
  });
});

// ============================================================
// detectRefinementMode — Fallback Parser
// ============================================================

describe("detectRefinementMode (fallback-parser.ts)", () => {
  it("detects exclusive: \"just focus on camera\"", () => {
    expect(fallbackDetectRefinementMode("just focus on camera")).toBe("exclusive");
  });

  it("detects ignore: \"I don't care about battery\"", () => {
    expect(fallbackDetectRefinementMode("I don't care about battery")).toBe("ignore");
  });

  it("detects increase: \"care more about camera\"", () => {
    expect(fallbackDetectRefinementMode("care more about camera")).toBe("increase");
  });

  it("detects decrease: \"care less about battery\"", () => {
    expect(fallbackDetectRefinementMode("care less about battery")).toBe("decrease");
  });

  it("detects budget: \"make it 35000\"", () => {
    expect(fallbackDetectRefinementMode("make it 35000")).toBe("budget");
  });

  it("detects normal: \"Best laptop under 60000\"", () => {
    expect(fallbackDetectRefinementMode("Best laptop under 60000")).toBe("normal");
  });
});

// ============================================================
// mergeWithCurrent — Exclusive Refinement
// ============================================================

describe("mergeWithCurrent: exclusive", () => {
  it("\"just focus on camera\" → camera=3, all others=1", () => {
    const current = getCurrentPrefs();
    const newIntent = makeIntent({
      priorities: [{ attributeKey: "camera_score", importance: 3 }],
    });

    const merged = mergeWithCurrent(newIntent, current, smartphoneConfig, "exclusive");

    // Camera should be high
    const camera = merged.priorities.find((p) => p.attributeKey === "camera_score");
    expect(camera?.importance).toBe(3);

    // All others should be low (1)
    for (const p of merged.priorities) {
      if (p.attributeKey !== "camera_score") {
        expect(p.importance).toBe(1);
      }
    }
  });

  it("preserves budget during exclusive refinement", () => {
    const current = getCurrentPrefs();
    const newIntent = makeIntent({
      priorities: [{ attributeKey: "battery_mah", importance: 3 }],
    });

    const merged = mergeWithCurrent(newIntent, current, smartphoneConfig, "exclusive");

    expect(merged.budget).toEqual({ max: 30000 });
  });

  it("preserves category during exclusive refinement", () => {
    const current = getCurrentPrefs();
    const newIntent = makeIntent({
      priorities: [{ attributeKey: "camera_score", importance: 3 }],
    });

    const merged = mergeWithCurrent(newIntent, current, smartphoneConfig, "exclusive");

    expect(merged.category).toBe("smartphone");
  });

  it("marks refinementMode on the merged intent", () => {
    const current = getCurrentPrefs();
    const newIntent = makeIntent({
      priorities: [{ attributeKey: "camera_score", importance: 3 }],
    });

    const merged = mergeWithCurrent(newIntent, current, smartphoneConfig, "exclusive");

    expect(merged.refinementMode).toBe("exclusive");
  });
});

// ============================================================
// mergeWithCurrent — Increase Refinement
// ============================================================

describe("mergeWithCurrent: increase", () => {
  it("\"care more about camera\" → camera goes from 2 to 3", () => {
    const current = getCurrentPrefs();
    const newIntent = makeIntent({
      priorities: [{ attributeKey: "camera_score", importance: 3 }],
    });

    const merged = mergeWithCurrent(newIntent, current, smartphoneConfig, "increase");

    const camera = merged.priorities.find((p) => p.attributeKey === "camera_score");
    expect(camera?.importance).toBe(3);

    // Other priorities should stay at 2
    const battery = merged.priorities.find((p) => p.attributeKey === "battery_mah");
    expect(battery?.importance).toBe(2);
  });

  it("does not decrease when increasing", () => {
    const current = getCurrentPrefs();
    // New intent says importance 1 (lower than current 2), but mode is "increase"
    // Should keep at 2 (the max of current and new)
    const newIntent = makeIntent({
      priorities: [{ attributeKey: "camera_score", importance: 1 }],
    });

    const merged = mergeWithCurrent(newIntent, current, smartphoneConfig, "increase");

    const camera = merged.priorities.find((p) => p.attributeKey === "camera_score");
    expect(camera?.importance).toBe(2); // stays at 2, not reduced
  });
});

// ============================================================
// mergeWithCurrent — Decrease Refinement
// ============================================================

describe("mergeWithCurrent: decrease", () => {
  it("\"care less about battery\" → battery goes from 2 to 1", () => {
    const current = getCurrentPrefs();
    const newIntent = makeIntent({
      priorities: [{ attributeKey: "battery_mah", importance: 1 }],
    });

    const merged = mergeWithCurrent(newIntent, current, smartphoneConfig, "decrease");

    const battery = merged.priorities.find((p) => p.attributeKey === "battery_mah");
    expect(battery?.importance).toBe(1);

    // Camera stays at 2
    const camera = merged.priorities.find((p) => p.attributeKey === "camera_score");
    expect(camera?.importance).toBe(2);
  });

  it("does not increase when decreasing", () => {
    const current = getCurrentPrefs();
    // New intent says importance 3 (higher than current 2), but mode is "decrease"
    // Should keep at 2 (the min of current and new)
    const newIntent = makeIntent({
      priorities: [{ attributeKey: "battery_mah", importance: 3 }],
    });

    const merged = mergeWithCurrent(newIntent, current, smartphoneConfig, "decrease");

    const battery = merged.priorities.find((p) => p.attributeKey === "battery_mah");
    expect(battery?.importance).toBe(2); // stays at 2, not increased
  });
});

// ============================================================
// mergeWithCurrent — Ignore Refinement
// ============================================================

describe("mergeWithCurrent: ignore", () => {
  it("\"I don't care about battery\" → battery=1", () => {
    const current = getCurrentPrefs();
    const newIntent = makeIntent({
      priorities: [{ attributeKey: "battery_mah", importance: 1 }],
    });

    const merged = mergeWithCurrent(newIntent, current, smartphoneConfig, "ignore");

    const battery = merged.priorities.find((p) => p.attributeKey === "battery_mah");
    expect(battery?.importance).toBe(1);

    // Camera stays unchanged
    const camera = merged.priorities.find((p) => p.attributeKey === "camera_score");
    expect(camera?.importance).toBe(2);
  });
});

// ============================================================
// mergeWithCurrent — Budget Refinement
// ============================================================

describe("mergeWithCurrent: budget", () => {
  it("\"make it 35000\" → budget max becomes 35000", () => {
    const current = getCurrentPrefs();
    const newIntent = makeIntent({
      budget: { max: 35000 },
    });

    const merged = mergeWithCurrent(newIntent, current, smartphoneConfig, "budget");

    expect(merged.budget?.max).toBe(35000);
  });

  it("preserves all priorities during budget refinement", () => {
    const current = getCurrentPrefs();
    const newIntent = makeIntent({
      budget: { max: 35000 },
    });

    const merged = mergeWithCurrent(newIntent, current, smartphoneConfig, "budget");

    expect(merged.priorities).toEqual(current.priorities);
  });

  it("preserves category during budget refinement", () => {
    const current = getCurrentPrefs();
    const newIntent = makeIntent({
      budget: { max: 35000 },
    });

    const merged = mergeWithCurrent(newIntent, current, smartphoneConfig, "budget");

    expect(merged.category).toBe("smartphone");
  });
});

// ============================================================
// Full Integration: Test Case Flows
// ============================================================

describe("Integration: refinement flows", () => {
  it("Flow 1: Initial query → exclusive refinement on camera", () => {
    // Initial: "Best phone under 30000 with battery"
    const initial = getCurrentPrefs();

    // Refinement: "Actually just focus on camera"
    const refinement = makeIntent({
      priorities: [{ attributeKey: "camera_score", importance: 3 }],
    });

    const merged = mergeWithCurrent(refinement, initial, smartphoneConfig, "exclusive");

    // Camera dominates
    const camera = merged.priorities.find((p) => p.attributeKey === "camera_score");
    expect(camera?.importance).toBe(3);

    // Others are low, not medium
    const battery = merged.priorities.find((p) => p.attributeKey === "battery_mah");
    const display = merged.priorities.find((p) => p.attributeKey === "display_inches");
    const ram = merged.priorities.find((p) => p.attributeKey === "ram_gb");
    expect(battery?.importance).toBe(1);
    expect(display?.importance).toBe(1);
    expect(ram?.importance).toBe(1);
  });

  it("Flow 2: Initial query → budget refinement", () => {
    // Initial: "Phone under 30000"
    const initial = getCurrentPrefs();

    // Refinement: "Make it 35000"
    const refinement = makeIntent({
      budget: { max: 35000 },
    });

    const merged = mergeWithCurrent(refinement, initial, smartphoneConfig, "budget");

    expect(merged.budget?.max).toBe(35000);
    // All priorities preserved
    expect(merged.priorities.length).toBe(6);
  });

  it("Flow 3: Initial query → increase battery priority", () => {
    // Initial: "Best laptop for programming"
    const laptopCurrent = {
      category: "laptop",
      budget: { max: 60000 },
      priorities: [
        { attributeKey: "processor_score", importance: 2 },
        { attributeKey: "ram_gb", importance: 2 },
        { attributeKey: "battery_hours", importance: 2 },
        { attributeKey: "display_inches", importance: 2 },
        { attributeKey: "weight_kg", importance: 2 },
        { attributeKey: "ssd_gb", importance: 2 },
      ],
    };

    // Refinement: "Care more about battery"
    const refinement = makeIntent({
      priorities: [{ attributeKey: "battery_hours", importance: 3 }],
    });

    const merged = mergeWithCurrent(refinement, laptopCurrent, laptopConfig, "increase");

    const battery = merged.priorities.find((p) => p.attributeKey === "battery_hours");
    expect(battery?.importance).toBe(3);

    // Other laptop priorities stay at 2
    const processor = merged.priorities.find((p) => p.attributeKey === "processor_score");
    expect(processor?.importance).toBe(2);
  });

  it("Flow 4: Initial query → ignore battery", () => {
    const initial = getCurrentPrefs();

    // Refinement: "I don't care about battery"
    const refinement = makeIntent({
      priorities: [{ attributeKey: "battery_mah", importance: 1 }],
    });

    const merged = mergeWithCurrent(refinement, initial, smartphoneConfig, "ignore");

    const battery = merged.priorities.find((p) => p.attributeKey === "battery_mah");
    expect(battery?.importance).toBe(1);

    // Camera stays at 2
    const camera = merged.priorities.find((p) => p.attributeKey === "camera_score");
    expect(camera?.importance).toBe(2);
  });

  it("Flow 5: New query is NOT treated as refinement", () => {
    const mode = detectRefinementMode("Best laptop under 60000");
    expect(mode).toBe("normal");
  });
});
