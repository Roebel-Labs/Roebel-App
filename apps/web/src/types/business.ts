// Business Account Types

export type BusinessStatus = "pending" | "published" | "rejected"

export type BusinessCategory =
  | "gastronomie"
  | "einzelhandel"
  | "handwerk"
  | "dienstleistung"
  | "gesundheit"
  | "bildung"
  | "kultur"
  | "sport"
  | "tourismus"
  | "immobilien"
  | "sonstiges"

export type OrgTypeChoice = "restaurant" | "unternehmen" | "verein" | "stadt" | "fraktion"

export type DealType = "discount" | "special" | "event" | "new_product" | "promotion"

export type DealStatus = "draft" | "active" | "paused" | "expired"

export interface OpeningHoursEntry {
  open: string
  close: string
  closed?: boolean
}

export interface OpeningHours {
  [day: string]: OpeningHoursEntry
}

export interface Business {
  id: string
  owner_wallet_address: string
  name: string
  slug: string
  description: string | null
  category: BusinessCategory
  phone: string | null
  email: string | null
  website_url: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  opening_hours: OpeningHours
  cover_image_url: string | null
  logo_url: string | null
  gallery_images: string[]
  status: BusinessStatus
  admin_notes: string | null
  is_featured: boolean
  created_at: string
  updated_at: string
}

export interface BusinessDeal {
  id: string
  business_id: string
  title: string
  description: string | null
  deal_type: DealType
  deal_value: string | null
  start_date: string | null
  end_date: string | null
  image_url: string | null
  media_urls: string[]
  video_url: string | null
  status: DealStatus
  is_active: boolean
  is_boosted: boolean
  boost_expires_at: string | null
  views_count: number
  clicks_count: number
  created_at: string
  updated_at: string
}

export interface CreateBusinessInput {
  owner_wallet_address: string
  name: string
  slug: string
  description?: string
  category: BusinessCategory
  phone?: string
  email?: string
  website_url?: string
  address?: string
  latitude?: number
  longitude?: number
  opening_hours?: OpeningHours
  cover_image_url?: string
  logo_url?: string
  gallery_images?: string[]
}

export interface UpdateBusinessInput {
  id: string
  name?: string
  description?: string
  category?: BusinessCategory
  phone?: string
  email?: string
  website_url?: string
  address?: string
  latitude?: number
  longitude?: number
  opening_hours?: OpeningHours
  cover_image_url?: string
  logo_url?: string
  gallery_images?: string[]
}

export interface CreateDealInput {
  business_id: string
  title: string
  description?: string
  deal_type: DealType
  deal_value?: string
  start_date?: string
  end_date?: string
  image_url?: string
  media_urls?: string[]
  video_url?: string
  status?: DealStatus
}

export interface UpdateDealInput {
  id: string
  title?: string
  description?: string
  deal_type?: DealType
  deal_value?: string
  start_date?: string
  end_date?: string
  image_url?: string
  media_urls?: string[]
  video_url?: string
  status?: DealStatus
  is_active?: boolean
}

// ============================================
// Constants
// ============================================

export const BUSINESS_CATEGORIES: { value: BusinessCategory; label: string }[] = [
  { value: "gastronomie", label: "Gastronomie" },
  { value: "einzelhandel", label: "Einzelhandel" },
  { value: "handwerk", label: "Handwerk" },
  { value: "dienstleistung", label: "Dienstleistung" },
  { value: "gesundheit", label: "Gesundheit" },
  { value: "bildung", label: "Bildung" },
  { value: "kultur", label: "Kultur & Freizeit" },
  { value: "sport", label: "Sport & Fitness" },
  { value: "tourismus", label: "Tourismus" },
  { value: "immobilien", label: "Immobilien" },
  { value: "sonstiges", label: "Sonstiges" },
]

export const DEAL_TYPES: { value: DealType; label: string }[] = [
  { value: "discount", label: "Rabatt" },
  { value: "special", label: "Spezialangebot" },
  { value: "event", label: "Veranstaltung" },
  { value: "new_product", label: "Neuheit" },
  { value: "promotion", label: "Werbung" },
]

export const DEAL_STATUSES: { value: DealStatus; label: string }[] = [
  { value: "draft", label: "Entwurf" },
  { value: "active", label: "Aktiv" },
  { value: "paused", label: "Pausiert" },
  { value: "expired", label: "Abgelaufen" },
]

export const DAYS_OF_WEEK: { value: string; label: string }[] = [
  { value: "montag", label: "Montag" },
  { value: "dienstag", label: "Dienstag" },
  { value: "mittwoch", label: "Mittwoch" },
  { value: "donnerstag", label: "Donnerstag" },
  { value: "freitag", label: "Freitag" },
  { value: "samstag", label: "Samstag" },
  { value: "sonntag", label: "Sonntag" },
]

export const ORG_TYPES: { value: OrgTypeChoice; label: string; description: string; emoji: string }[] = [
  { value: "restaurant", label: "Restaurant", description: "Gastronomie mit Speisekarte", emoji: "🍽️" },
  { value: "unternehmen", label: "Unternehmen", description: "Gewerbe & Dienstleistungen", emoji: "🏢" },
  { value: "verein", label: "Verein", description: "Sport, Kultur, Soziales", emoji: "🤝" },
  { value: "stadt", label: "Stadt", description: "Stadt Röbel/Müritz", emoji: "🏛️" },
  { value: "fraktion", label: "Fraktion", description: "Fraktionen im Stadtrat", emoji: "🗳️" },
]

// ============================================
// Helpers
// ============================================

export function getCategoryLabel(category: BusinessCategory): string {
  return BUSINESS_CATEGORIES.find((c) => c.value === category)?.label ?? category
}

export function getDealTypeLabel(dealType: DealType): string {
  return DEAL_TYPES.find((d) => d.value === dealType)?.label ?? dealType
}

export function getDealStatusLabel(status: DealStatus): string {
  return DEAL_STATUSES.find((s) => s.value === status)?.label ?? status
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export function isBusinessOpen(hours: OpeningHours): boolean {
  const now = new Date()
  const dayIndex = now.getDay()
  const dayMap = ["sonntag", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"]
  const today = dayMap[dayIndex]
  const entry = hours[today]

  if (!entry || entry.closed) return false

  const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`
  return currentTime >= entry.open && currentTime <= entry.close
}
