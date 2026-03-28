"use client";

import { POST_CATEGORIES, type PostCategory } from "@/types/post";

const CATEGORY_COLORS: Record<PostCategory, string> = {
  frage: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  empfehlungen: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  verloren_gefunden: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  hilfe_gebraucht: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  im_angebot: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  generell: "bg-muted text-muted-foreground",
};

interface CategoryBadgeProps {
  category: PostCategory;
}

export function CategoryBadge({ category }: CategoryBadgeProps) {
  const label = POST_CATEGORIES.find((c) => c.id === category)?.label || category;
  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS.generell;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${colors}`}>
      {label}
    </span>
  );
}
