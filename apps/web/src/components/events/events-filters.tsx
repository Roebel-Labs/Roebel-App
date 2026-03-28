"use client"

import { CATEGORIES_WITH_ICONS } from "@/lib/constants"

interface EventsFiltersProps {
  currentCategory?: string
  onCategoryChange?: (category: string) => void
}

export function EventsFilters({ 
  currentCategory = "All Events",
  onCategoryChange 
}: EventsFiltersProps) {
  const handleCategoryChange = (categoryName: string) => {
    if (onCategoryChange) {
      onCategoryChange(categoryName)
    }
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex gap-6 pb-4 px-4">
        {CATEGORIES_WITH_ICONS.map((category) => {
          const Icon = category.icon
          const isActive = currentCategory === category.name
          
          return (
            <button
              key={category.name}
              onClick={() => handleCategoryChange(category.name)}
              className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all duration-200 min-w-[80px] ${
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon
                size={24}
                className={`${
                  isActive ? "text-foreground" : "text-muted-foreground"
                }`}
              />
              <span className="text-xs font-medium whitespace-nowrap">
                {category.name}
              </span>
              {isActive && (
                <div className="w-6 h-0.5 bg-foreground rounded-full mt-1" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
