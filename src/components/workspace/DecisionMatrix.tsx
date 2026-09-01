"use client";

import type { DecisionMatrix as DecisionMatrixType, AttributeConfig } from "@/types";

interface DecisionMatrixProps {
  matrix: DecisionMatrixType;
}

export function DecisionMatrix({ matrix }: DecisionMatrixProps) {
  if (matrix.rows.length === 0) return null;

  function formatValue(
    value: number | boolean | string | null,
    attr: AttributeConfig
  ): string {
    if (value === null || value === undefined) return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") {
      if (attr.unit) return `${value.toLocaleString()} ${attr.unit}`;
      return value.toLocaleString();
    }
    return String(value);
  }

  function getBarWidth(normalized: number | null): number {
    if (normalized === null || normalized === undefined) return 0;
    return Math.round(normalized * 100);
  }

  // Compute ranks for row highlighting
  const sortedByScore = [...matrix.rows]
    .sort((a, b) => b.score - a.score);
  const rankMap = new Map(sortedByScore.map((r, i) => [r.product.id, i + 1]));

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm overflow-x-auto">
      <h2 className="text-sm font-semibold text-zinc-800 mb-1">
        Decision Matrix
      </h2>
      <p className="text-xs text-zinc-400 mb-5">
        Comparing products across {matrix.attributes.length} criteria
      </p>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-100">
            <th className="text-left py-2 pr-4 text-[10px] font-medium text-zinc-400 uppercase tracking-wider sticky left-0 bg-white z-10">
              Product
            </th>
            {matrix.attributes.map((attr) => (
              <th
                key={attr.key}
                className="text-left py-2 px-3 text-[10px] font-medium text-zinc-400 uppercase tracking-wider min-w-[120px]"
              >
                {attr.label}
              </th>
            ))}
            <th className="text-right py-2 pl-4 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
              Score
            </th>
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => {
            const rank = rankMap.get(row.product.id) ?? 0;
            const isTop = rank === 1;

            return (
              <tr
                key={row.product.id}
                className={`border-b border-zinc-50 last:border-0 ${
                  isTop ? "bg-zinc-50/50" : ""
                }`}
              >
                <td className="py-3 pr-4 sticky left-0 bg-white z-10">
                  <div className="flex items-center gap-2">
                    <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                      isTop
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-100 text-zinc-600"
                    }`}>
                      {rank || "—"}
                    </span>
                    <div>
                      <p className="font-medium text-zinc-900 text-xs">
                        {row.product.name}
                      </p>
                      <p className="text-[10px] text-zinc-400">₹{row.product.price.toLocaleString()}</p>
                    </div>
                  </div>
                </td>
                {matrix.attributes.map((attr) => {
                  const cell = row.cells[attr.key];
                  const barWidth = getBarWidth(cell?.normalized ?? null);
                  return (
                    <td key={attr.key} className="py-3 px-3">
                      <div className="mb-1">
                        <span
                          className={`text-xs font-mono ${
                            cell?.available ? "text-zinc-700" : "text-zinc-300"
                          }`}
                        >
                          {formatValue(cell?.value ?? null, attr)}
                        </span>
                      </div>
                      {cell?.available && (
                        <div className="w-full bg-zinc-100 rounded-full h-1">
                          <div
                            className={`h-1 rounded-full transition-all duration-500 ${
                              isTop ? "bg-zinc-800" : "bg-zinc-400"
                            }`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="py-3 pl-4 text-right">
                  <span className={`font-mono text-sm tabular-nums ${
                    isTop ? "font-bold text-zinc-900" : "font-semibold text-zinc-700"
                  }`}>
                    {row.score}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
