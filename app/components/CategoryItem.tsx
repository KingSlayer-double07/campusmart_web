"use client";

import type { CategoryItemData } from "./categoryIcons";

type Props = {
  category: Pick<CategoryItemData, "name" | "Icon">;
  isActive: boolean;
  onClick: () => void;
};

export default function CategoryItem({ category, isActive, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className="flex flex-col items-center gap-2 transition-all duration-150 active:scale-95 active:opacity-80"
    >
      <div
        className={`p-2 rounded-full border shadow-lg transition-all duration-300
                    ${
                      isActive
                        ? "bg-main border-main text-white"
                        : "border-border-default text-foreground"
                    }`}
      >
        <category.Icon size={20} strokeWidth={1.6} />
      </div>

      <span className="text-xs tracking-wide">{category.name}</span>
    </button>
  );
}
