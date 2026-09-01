"use client";

interface ProductVisualProps {
  category: string;
  brand?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const CATEGORY_ICONS: Record<string, { bg: string; icon: string }> = {
  smartphone: { bg: "bg-blue-50", icon: "📱" },
  laptop: { bg: "bg-violet-50", icon: "💻" },
};

const DEFAULT_CATEGORY = { bg: "bg-zinc-50", icon: "✦" };

const SIZE_CLASSES: Record<string, string> = {
  sm: "w-8 h-8 text-xs",
  md: "w-12 h-12 text-sm",
  lg: "w-16 h-16 text-xl",
};

/**
 * Category-aware product visual with graceful fallback.
 * Shows a category icon when no imageUrl is available.
 * Safe if category is unknown — falls back to a neutral design.
 */
export function ProductVisual({
  category,
  size = "md",
  className = "",
}: ProductVisualProps) {
  const catStyle = CATEGORY_ICONS[category] ?? DEFAULT_CATEGORY;
  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;

  return (
    <div
      className={`${sizeClass} ${catStyle.bg} rounded-xl flex items-center justify-center shrink-0 shadow-sm border border-black/[0.03] ${className}`}
    >
      <span className={size === "lg" ? "drop-shadow-sm" : ""}>{catStyle.icon}</span>
    </div>
  );
}
