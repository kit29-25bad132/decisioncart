"use client";

import type { AttributeConfig, PriorityItem } from "@/types";

interface PriorityControlsProps {
  attributes: AttributeConfig[];
  priorities: PriorityItem[];
  onPriorityChange: (attributeKey: string, importance: number) => void;
}

const IMPORTANCE_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "Low", color: "text-zinc-400 bg-zinc-50 border-zinc-200" },
  2: {
    label: "Medium",
    color: "text-amber-700 bg-amber-50 border-amber-200",
  },
  3: {
    label: "High",
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
};

export function PriorityControls({
  attributes,
  priorities,
  onPriorityChange,
}: PriorityControlsProps) {
  function getImportance(key: string): number {
    return priorities.find((p) => p.attributeKey === key)?.importance ?? 1;
  }

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-800 mb-1">
        Priority Controls
      </h2>
      <p className="text-xs text-zinc-400 mb-5">
        Adjust importance to see rankings change in real time
      </p>

      <div className="space-y-4">
        {attributes.map((attr) => {
          const importance = getImportance(attr.key);
          const impStyle = IMPORTANCE_LABELS[importance];

          return (
            <div key={attr.key}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-zinc-700">
                  {attr.label}
                </span>
                <span
                  className={`text-[10px] font-medium px-2.5 py-0.5 rounded-full border ${impStyle.color}`}
                >
                  {impStyle.label}
                </span>
              </div>
              <div className="flex gap-2">
                {[1, 2, 3].map((level) => (
                  <button
                    key={level}
                    onClick={() => onPriorityChange(attr.key, level)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                      importance === level
                        ? level === 3
                          ? "bg-emerald-600 text-white shadow-sm"
                          : level === 2
                            ? "bg-amber-500 text-white shadow-sm"
                            : "bg-zinc-300 text-white shadow-sm"
                        : "bg-zinc-50 text-zinc-500 hover:bg-zinc-100 border border-zinc-200"
                    }`}
                  >
                    {level === 1 ? "Low" : level === 2 ? "Med" : "High"}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
