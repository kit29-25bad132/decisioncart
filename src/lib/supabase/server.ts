// ============================================================
// DecisionCart — Supabase Server Client
// Server-side only. Uses the service role key for privileged
// operations. Never import this from client components.
//
// Environment variables required:
//   NEXT_PUBLIC_SUPABASE_URL — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — Server-only service role key
//
// The client is created lazily so that tests and code that
// never touches Supabase are not affected by missing env vars.
// ============================================================

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let clientInstance: SupabaseClient | null = null;

/**
 * Returns a server-side Supabase client configured with the
 * service role key. The client is created once and reused.
 *
 * @throws {Error} If required environment variables are missing.
 */
export function getSupabaseServerClient(): SupabaseClient {
  if (clientInstance) {
    return clientInstance;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Supabase server configuration error: missing ${missing.join(", ")}. ` +
        "Set these environment variables before using the Supabase client."
    );
  }

  clientInstance = createClient(url!, serviceRoleKey!, {
    auth: {
      // Disable auth for the service-role client — it operates
      // outside user session context.
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return clientInstance;
}

/**
 * Reset the singleton client. Primarily for testing.
 * Call this to ensure a fresh client is created on next access.
 */
export function resetSupabaseServerClient(): void {
  clientInstance = null;
}
