"use client";

import type { UserPreference } from "@/types";
import type { CategoryConfig } from "@/types";

interface QueryInputProps {
  preference: UserPreference;
  categoryConfig: CategoryConfig;
  onBudgetChange: (max: number) => void;
  onCategoryChange: (category: string) => void;
  categories: { key: string; label: string }[];
}

export function QueryInput({
  preference,
  categoryConfig,
  onBudgetChange,
  onCategoryChange,
  categories,
}: QueryInputProps) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-800 mb-4">
        Manual Controls
      </h2>

      {/* Category Selector */}
      <div className="mb-5">
        <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">
          Category
        </label>
        <div className="flex gap-2">
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => onCategoryChange(cat.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                preference.category === cat.key
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "bg-zinc-50 text-zinc-600 hover:bg-zinc-100 border border-zinc-200"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Budget */}
      <div className="mb-5">
        <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">
          Budget (₹)
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={10000}
            max={150000}
            step={1000}
            value={preference.budget?.max ?? 50000}
            onChange={(e) => onBudgetChange(Number(e.target.value))}
            className="flex-1 h-2 bg-zinc-100 rounded-full appearance-none cursor-pointer accent-zinc-900"
          />
          <span className="text-sm font-mono font-semibold text-zinc-900 min-w-[100px] text-right">
            Up to ₹{(preference.budget?.max ?? 50000).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Structured Summary */}
      <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-100">
        <p className="text-[10px] font-medium text-zinc-400 mb-2 uppercase tracking-wider">
          Search Criteria
        </p>
        <p className="text-sm text-zinc-700">
          {preference.budget?.max
            ? `Looking for a ${categoryConfig.label} under ₹${preference.budget.max.toLocaleString()}`
            : `Looking for a ${categoryConfig.label}`}
          {preference.priorities.length > 0 && (
            <>
              {" "}
              — prioritizing{" "}
              {[...preference.priorities]
                .sort((a, b) => b.importance - a.importance)
                .map((p) => {
                  const attr = categoryConfig.attributes.find(
                    (a) => a.key === p.attributeKey
                  );
                  return attr?.label ?? p.attributeKey;
                })
                .join(", ")}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
