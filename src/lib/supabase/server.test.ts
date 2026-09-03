// ============================================================
// DecisionCart — Supabase Server Client Tests
// Tests environment validation without requiring real credentials.
//
// Original environment variables are saved before the suite
// and restored after all tests complete, so the host process
// environment is never permanently altered.
//
// server-only is mocked because it throws outside a Next.js
// server context, which Vitest is not.
// ============================================================

import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  getSupabaseServerClient,
  resetSupabaseServerClient,
} from "./server";

// --- Save original env values before any tests run ---
const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// --- Restore originals after the entire suite ---
afterAll(() => {
  resetSupabaseServerClient();

  if (originalUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }

  if (originalKey === undefined) {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  } else {
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

describe("Supabase Server Client", () => {
  beforeEach(() => {
    // Reset singleton between tests so each test starts fresh.
    resetSupabaseServerClient();

    // Clear Supabase env vars for test isolation.
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("should fail with a clear error when env vars are missing", () => {
    expect(() => getSupabaseServerClient()).toThrow(
      /missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY/
    );
  });

  it("should fail when only URL is set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";

    expect(() => getSupabaseServerClient()).toThrow(
      /missing SUPABASE_SERVICE_ROLE_KEY/
    );
  });

  it("should fail when only service role key is set", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

    expect(() => getSupabaseServerClient()).toThrow(
      /missing NEXT_PUBLIC_SUPABASE_URL/
    );
  });

  it("should return a client when both env vars are set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

    const client = getSupabaseServerClient();
    expect(client).toBeDefined();
    expect(typeof client.from).toBe("function");
  });

  it("should return the same client instance on repeated calls (singleton)", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

    const first = getSupabaseServerClient();
    const second = getSupabaseServerClient();
    expect(first).toBe(second);
  });

  it("should create a new client after reset", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

    const first = getSupabaseServerClient();
    resetSupabaseServerClient();
    const second = getSupabaseServerClient();

    expect(first).not.toBe(second);
  });

  it("should be test-safe without env vars (no side effects)", () => {
    // This test verifies that importing and not calling
    // getSupabaseServerClient does not throw.
    expect(() => {
      // Just importing and referencing the function — no invocation.
      const fn = getSupabaseServerClient;
      expect(typeof fn).toBe("function");
    }).not.toThrow();
  });
});
