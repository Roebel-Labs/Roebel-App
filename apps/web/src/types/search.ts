export type SearchCategory =
  | "events"
  | "news"
  | "businesses"
  | "marketplace"
  | "board"
  | "posts"
  | "proposals"
  | "deals"
  | "users"

export interface SearchResultItem {
  id: string
  type: SearchCategory
  title: string
  subtitle: string | null
  imageUrl: string | null
  href: string
}

export type SearchResults = Partial<Record<SearchCategory, SearchResultItem[]>>

export interface SearchCategoryConfig {
  key: SearchCategory
  label: string
  icon: string // lucide icon name
}

export const SEARCH_CATEGORIES: SearchCategoryConfig[] = [
  { key: "events", label: "Events", icon: "Calendar" },
  { key: "news", label: "News", icon: "Newspaper" },
  { key: "businesses", label: "Gewerbe", icon: "Store" },
  { key: "marketplace", label: "Marktplatz", icon: "ShoppingBag" },
  { key: "board", label: "Schwarzes Brett", icon: "ClipboardList" },
  { key: "deals", label: "Angebote", icon: "Tag" },
  { key: "posts", label: "Beiträge", icon: "MessageCircle" },
  { key: "proposals", label: "Vorschläge", icon: "Vote" },
  { key: "users", label: "Nutzer", icon: "Users" },
]
