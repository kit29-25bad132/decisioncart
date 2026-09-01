"use client";

import Link from "next/link";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-zinc-200 p-8 shadow-sm max-w-md w-full text-center">
        <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-6 h-6 text-amber-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h2 className="text-lg font-semibold text-zinc-900 mb-2">
          Something went wrong while preparing your decision.
        </h2>
        <p className="text-sm text-zinc-500 mb-6">
          An unexpected error occurred. You can try again or return to the home
          page.
        </p>

        {error.digest && (
          <p className="text-xs text-zinc-300 mb-4 font-mono">
            Error ID: {error.digest}
          </p>
        )}

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors shadow-sm"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-xl border border-zinc-200 text-zinc-600 text-sm font-medium hover:border-zinc-300 hover:text-zinc-900 transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
