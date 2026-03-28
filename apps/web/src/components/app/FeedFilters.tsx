"use client";

import { POST_CATEGORIES } from "@/types/post";

const filters = [
  { id: "all", label: "Für dich" },
  { id: "latest", label: "Neueste" },
  { id: "posts", label: "Beiträge" },
  { id: "events", label: "Veranstaltungen" },
  { id: "news", label: "Neuigkeiten" },
  { id: "ads", label: "Angebote" },
  { id: "brett", label: "Schwarzes Brett" },
];

const categoryFilters = [
  { id: "all", label: "Alle" },
  ...POST_CATEGORIES,
];

interface FeedFiltersProps {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  activeCategory?: string;
  onCategoryChange?: (category: string) => void;
}

export function FeedFilters({
  activeFilter,
  onFilterChange,
  activeCategory = "all",
  onCategoryChange,
}: FeedFiltersProps) {
  return (
    <div className="space-y-2">
      <div className="bg-card rounded-lg border border-border p-1 flex gap-1 overflow-x-auto">
        {filters.map((filter) => (
          <button
            key={filter.id}
            onClick={() => onFilterChange(filter.id)}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
              activeFilter === filter.id
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {activeFilter === "posts" && onCategoryChange && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {categoryFilters.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onCategoryChange(cat.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                activeCategory === cat.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
