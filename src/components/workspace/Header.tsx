"use client";

import Link from "next/link";

interface HeaderProps {
  categoryLabel: string;
}

export function Header({ categoryLabel }: HeaderProps) {
  return (
    <header className="border-b border-zinc-100/80 bg-white/80 backdrop-blur-xl sticky top-0 z-50">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-4 sm:px-6 py-3">
        {/* Left: Navigation + Brand */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-700 transition-colors text-sm"
            aria-label="Return to home page"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
            <span className="hidden sm:inline">Home</span>
          </Link>

          <span className="text-zinc-200 hidden sm:inline">|</span>

          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-zinc-900 flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-xs tracking-tight">
                DC
              </span>
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-[15px] tracking-tight leading-none">
                DecisionCart
              </span>
              <span className="text-[10px] text-zinc-400 leading-none mt-0.5 hidden sm:block">
                AI-Powered Decisions
              </span>
            </div>
          </div>
        </div>

        {/* Right: Category Badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 bg-zinc-50 px-3 py-1.5 rounded-full border border-zinc-100">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5" />
            {categoryLabel}
          </span>
        </div>
      </div>
    </header>
  );
}
