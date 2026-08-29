"use client";

import Link from "next/link";

interface HeaderProps {
  categoryLabel: string;
}

export function Header({ categoryLabel }: HeaderProps) {
  return (
    <header className="border-b border-zinc-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-zinc-400 hover:text-zinc-600 transition-colors text-sm"
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
            Home
          </Link>
          <span className="text-zinc-200">|</span>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-zinc-900 flex items-center justify-center">
              <span className="text-white font-semibold text-xs">DC</span>
            </div>
            <span className="font-semibold text-base tracking-tight">
              DecisionCart
            </span>
          </div>
        </div>
        <span className="text-xs font-medium text-zinc-400 bg-zinc-50 px-3 py-1 rounded-full border border-zinc-100">
          {categoryLabel}
        </span>
      </div>
    </header>
  );
}
