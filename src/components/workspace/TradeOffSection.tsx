"use client";

import type { TradeOff } from "@/types";

interface TradeOffSectionProps {
  tradeOffs: TradeOff[];
}

const CRITERION_ICONS: Record<string, string> = {
  camera_score: "📷",
  battery_mah: "🔋",
  battery_hours: "🔋",
  display_inches: "🖥",
  ram_gb: "⚡",
  performance_ram: "⚡",
  processor_score: "⚡",
  storage_gb: "💾",
  ssd_gb: "💾",
  five_g: "📶",
  weight_kg: "⚖",
};

const DEFAULT_ICON = "✦";

export function TradeOffSection({ tradeOffs }: TradeOffSectionProps) {
  if (tradeOffs.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
      <h2 className="text-sm font-medium text-zinc-400 mb-1 tracking-wide uppercase">
        Trade-Off Analysis
      </h2>
      <p className="text-xs text-zinc-400 mb-5">
        Different priorities lead to different winners
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tradeOffs.map((to) => {
          const icon = CRITERION_ICONS[to.criterionKey] ?? DEFAULT_ICON;
          return (
            <div
              key={to.criterionKey}
              className="p-4 rounded-xl border border-zinc-100 hover:border-zinc-200 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{icon}</span>
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                  Best {to.criterionLabel}
                </span>
              </div>
              <p className="font-medium text-zinc-900 text-sm mb-1">
                {to.winnerProductName}
              </p>
              <p className="text-xs text-zinc-400">
                Score: {to.score}/100 in this criterion
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
