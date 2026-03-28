"use client";

import { POST_CATEGORIES, type PostCategory } from "@/types/post";

interface CategorySelectorProps {
  value: PostCategory | null;
  onChange: (category: PostCategory) => void;
}

export function CategorySelector({ value, onChange }: CategorySelectorProps) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {POST_CATEGORIES.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => onChange(cat.id)}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            value === cat.id
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}
