// ============================================================
// DecisionCart — Vitest Global Setup
// Mocks server-only to prevent throws outside Next.js server context.
// Forces InMemoryPurchaseRepository so existing tests don't need
// Supabase credentials or a live database.
// ============================================================

import { vi, beforeAll } from "vitest";

vi.mock("server-only", () => ({}));

// Force the purchase repository to use InMemory in all tests.
// This prevents auto-selecting Supabase when .env.local has credentials.
import { forceInMemoryRepository } from "./src/engine/purchase-repository";

beforeAll(() => {
  forceInMemoryRepository();
});
