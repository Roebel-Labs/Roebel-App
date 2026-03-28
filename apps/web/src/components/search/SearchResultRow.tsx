import Image from "next/image"
import {
  Calendar,
  ClipboardList,
  Newspaper,
  Store,
  ShoppingBag,
  Tag,
  MessageCircle,
  Vote,
  Users,
} from "lucide-react"
import type { SearchResultItem, SearchCategory } from "@/types/search"

const CATEGORY_ICONS: Record<SearchCategory, React.ElementType> = {
  events: Calendar,
  news: Newspaper,
  businesses: Store,
  marketplace: ShoppingBag,
  board: ClipboardList,
  deals: Tag,
  posts: MessageCircle,
  proposals: Vote,
  users: Users,
}

const CATEGORY_COLORS: Record<SearchCategory, string> = {
  events: "text-blue-500",
  news: "text-purple-500",
  businesses: "text-emerald-500",
  marketplace: "text-orange-500",
  board: "text-amber-500",
  deals: "text-rose-500",
  posts: "text-sky-500",
  proposals: "text-amber-500",
  users: "text-teal-500",
}

interface SearchResultRowProps {
  item: SearchResultItem
  isActive: boolean
  onClick: () => void
}

export function SearchResultRow({ item, isActive, onClick }: SearchResultRowProps) {
  const Icon = CATEGORY_ICONS[item.type]
  const colorClass = CATEGORY_COLORS[item.type]

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg transition-colors ${
        isActive
          ? "bg-accent text-accent-foreground"
          : "hover:bg-accent/50"
      }`}
      data-active={isActive}
    >
      {/* Thumbnail or icon */}
      {item.imageUrl ? (
        <div className="relative h-10 w-10 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
          <Image
            src={item.imageUrl}
            alt=""
            fill
            className="object-cover"
            sizes="40px"
          />
        </div>
      ) : (
        <div className={`flex items-center justify-center h-10 w-10 rounded-lg bg-muted flex-shrink-0 ${colorClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      )}

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {item.title}
        </p>
        {item.subtitle && (
          <p className="text-xs text-muted-foreground truncate">
            {item.subtitle}
          </p>
        )}
      </div>

      {/* Category badge */}
      <span className={`text-xs flex-shrink-0 ${colorClass}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
    </button>
  )
}
