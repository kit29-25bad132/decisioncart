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

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm overflow-x-auto">
      <h2 className="text-sm font-medium text-zinc-400 mb-1 tracking-wide uppercase">
        Decision Matrix
      </h2>
      <p className="text-xs text-zinc-400 mb-5">
        Comparing products across {matrix.attributes.length} criteria
      </p>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-100">
            <th className="text-left py-2 pr-4 text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Product
            </th>
            {matrix.attributes.map((attr) => (
              <th
                key={attr.key}
                className="text-left py-2 px-3 text-xs font-medium text-zinc-400 uppercase tracking-wide min-w-[120px]"
              >
                {attr.label}
              </th>
            ))}
            <th className="text-right py-2 pl-4 text-xs font-medium text-zinc-400 uppercase tracking-wide">
              Score
            </th>
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr
              key={row.product.id}
              className="border-b border-zinc-50 last:border-0"
            >
              <td className="py-3 pr-4">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-zinc-100 text-zinc-600 text-xs font-bold flex items-center justify-center">
                    {row.score > 0
                      ? [...matrix.rows]
                          .sort((a, b) => b.score - a.score)
                          .findIndex((r) => r.product.id === row.product.id) + 1
                      : "—"}
                  </span>
                  <div>
                    <p className="font-medium text-zinc-900 text-xs">
                      {row.product.name}
                    </p>
                    <p className="text-xs text-zinc-400">₹{row.product.price.toLocaleString()}</p>
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
                          className="bg-zinc-400 h-1 rounded-full transition-all duration-500"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    )}
                  </td>
                );
              })}
              <td className="py-3 pl-4 text-right">
                <span className="font-mono font-semibold text-zinc-900 text-sm">
                  {row.score}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
