// ============================================================
// DecisionCart — detectImportance Phrase Recognition Tests
// Verifies conversational priority statement understanding.
// ============================================================

import { describe, it, expect } from "vitest";
import { fallbackParse } from "./fallback-parser";
import { CATEGORY_CONFIGS } from "@/catalog/categories";
import type { ParserContext } from "./types";

function makeContext(category?: string): ParserContext {
  return {
    categories: Object.values(CATEGORY_CONFIGS),
    currentCategory: category,
  };
}

function getCameraPriority(query: string) {
  const intent = fallbackParse(query, makeContext());
  return intent.priorities.find((p) => p.attributeKey === "camera_score");
}

function getBatteryPriority(query: string) {
  const intent = fallbackParse(query, makeContext());
  return intent.priorities.find((p) => p.attributeKey === "battery_mah");
}

describe("detectImportance: high-priority phrases", () => {
  it('"I care more about camera" returns importance 3', () => {
    const priority = getCameraPriority("I care more about camera");
    expect(priority?.importance).toBe(3);
  });

  it('"more about battery" returns importance 3', () => {
    const priority = getBatteryPriority("more about battery");
    expect(priority?.importance).toBe(3);
  });

  it('"prioritize performance" returns importance 3', () => {
    const intent = fallbackParse("prioritize performance", makeContext());
    const ramPriority = intent.priorities.find(
      (p) => p.attributeKey === "ram_gb"
    );
    expect(ramPriority?.importance).toBe(3);
  });

  it('"prioritise performance" returns importance 3', () => {
    const intent = fallbackParse("prioritise performance", makeContext());
    const ramPriority = intent.priorities.find(
      (p) => p.attributeKey === "ram_gb"
    );
    expect(ramPriority?.importance).toBe(3);
  });

  it('"must have a good camera" returns importance 3', () => {
    const priority = getCameraPriority("must have a good camera");
    expect(priority?.importance).toBe(3);
  });

  it('"highest priority is battery" returns importance 3', () => {
    const priority = getBatteryPriority("highest priority is battery");
    expect(priority?.importance).toBe(3);
  });
});

describe("detectImportance: low-priority phrases", () => {
  it('"I care less about camera" returns importance 1', () => {
    const priority = getCameraPriority("I care less about camera");
    expect(priority?.importance).toBe(1);
  });

  it('"less about battery" returns importance 1', () => {
    const priority = getBatteryPriority("less about battery");
    expect(priority?.importance).toBe(1);
  });

  it('"I don\'t care about camera" returns importance 1', () => {
    const priority = getCameraPriority("I don't care about camera");
    expect(priority?.importance).toBe(1);
  });

  it('"camera is not important" returns importance 1', () => {
    const priority = getCameraPriority("camera is not important");
    expect(priority?.importance).toBe(1);
  });

  it('"battery low priority" returns importance 1', () => {
    const priority = getBatteryPriority("battery low priority");
    expect(priority?.importance).toBe(1);
  });
});

describe("detectImportance: existing IMPORTANCE_MAP behavior preserved", () => {
  it('"excellent camera" still returns importance 3', () => {
    const priority = getCameraPriority("excellent camera");
    expect(priority?.importance).toBe(3);
  });

  it('"good camera" still returns importance 2', () => {
    const priority = getCameraPriority("good camera");
    expect(priority?.importance).toBe(2);
  });

  it('"optional battery" still returns importance 1', () => {
    const priority = getBatteryPriority("optional battery");
    expect(priority?.importance).toBe(1);
  });

  it("returns default importance 2 when no importance keywords found", () => {
    const priority = getCameraPriority("phone with camera");
    expect(priority?.importance).toBe(2);
  });
});
