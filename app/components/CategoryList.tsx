"use client";

import { useRouter } from "next/navigation";
import CategoryItem from "./CategoryItem";
import { CATEGORY_ITEMS } from "./categoryIcons";

// Home page strip: a tap opens that category's listings
export default function CategoryList() {
  const router = useRouter();
  return (
    <div className="flex justify-between">
      {CATEGORY_ITEMS.map((category) => (
        <CategoryItem
          key={category.value}
          category={category}
          isActive={false}
          onClick={() => router.push(`/categories?category=${category.value}`)}
        />
      ))}
    </div>
  );
}
