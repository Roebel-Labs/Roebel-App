"use client";

import { INTEREST_TAGS } from "@/lib/user-types";

interface InterestTagsInputProps {
  selected: string[];
  onChange: (tags: string[]) => void;
}

export function InterestTagsInput({ selected, onChange }: InterestTagsInputProps) {
  const toggleTag = (tag: string) => {
    if (selected.includes(tag)) {
      onChange(selected.filter((t) => t !== tag));
    } else {
      onChange([...selected, tag]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {INTEREST_TAGS.map((tag) => {
        const isSelected = selected.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => toggleTag(tag)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              isSelected
                ? "bg-foreground text-white"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}
