// Marketplace Listing Types

export type ListingType = "product" | "service" | "schwarzes_brett"

export type MarketplaceCategory =
  | "moebel"
  | "elektronik"
  | "kleidung"
  | "fahrzeuge"
  | "haus_garten"
  | "sport_freizeit"
  | "buecher_medien"
  | "spielzeug_baby"
  | "haustiere"
  | "sonstiges"

export type ServiceCategory =
  | "handwerk"
  | "nachhilfe"
  | "gartenarbeit"
  | "haushaltshilfe"
  | "transport"
  | "it_technik"
  | "reparaturen"
  | "kreatives"
  | "betreuung"
  | "sonstiges_service"

export type BoardCategory =
  | "babysitter"
  | "werkzeug"
  | "mitfahrt"
  | "haustier"
  | "nachhilfe_brett"
  | "nachbarschaftshilfe"
  | "fundsachen"
  | "tausch_leih"
  | "sonstiges_brett"

export type ListingCondition = "neu" | "wie_neu" | "gut" | "akzeptabel"

export type ListingStatus = "active" | "sold" | "reserved" | "paused" | "deleted"

export type PriceType = "fixed" | "negotiable" | "free"

export type ServicePriceType = "per_hour" | "per_project" | "on_request"

export type BoardPriceType = "free" | "fixed" | "negotiable" | "on_request"

export interface MarketplaceListing {
  id: string
  seller_wallet_address: string
  listing_type: ListingType
  title: string
  description: string | null
  price: number
  price_type: PriceType | ServicePriceType | BoardPriceType
  category: MarketplaceCategory | ServiceCategory | BoardCategory
  condition: ListingCondition | null
  neighborhood: string | null
  media_urls: string[]
  status: ListingStatus
  views_count: number
  created_at: string
  updated_at: string
}

export interface ListingWithSeller extends MarketplaceListing {
  seller_username: string | null
  seller_profile_picture_url: string | null
  seller_neighborhood: string | null
}

export interface CreateListingInput {
  seller_wallet_address: string
  account_id?: string | null
  listing_type: ListingType
  title: string
  description?: string
  price: number
  price_type: PriceType | ServicePriceType | BoardPriceType
  category: MarketplaceCategory | ServiceCategory | BoardCategory
  condition?: ListingCondition
  neighborhood?: string
  media_urls?: string[]
}

export interface UpdateListingInput {
  id: string
  title?: string
  description?: string
  price?: number
  price_type?: PriceType | ServicePriceType | BoardPriceType
  category?: MarketplaceCategory | ServiceCategory | BoardCategory
  condition?: ListingCondition | null
  neighborhood?: string
  media_urls?: string[]
  status?: ListingStatus
}

// ============================================
// Constants
// ============================================

export const MARKETPLACE_CATEGORIES: { value: MarketplaceCategory; label: string }[] = [
  { value: "moebel", label: "Möbel & Einrichtung" },
  { value: "elektronik", label: "Elektronik" },
  { value: "kleidung", label: "Kleidung & Accessoires" },
  { value: "fahrzeuge", label: "Fahrzeuge" },
  { value: "haus_garten", label: "Haus & Garten" },
  { value: "sport_freizeit", label: "Sport & Freizeit" },
  { value: "buecher_medien", label: "Bücher & Medien" },
  { value: "spielzeug_baby", label: "Spielzeug & Baby" },
  { value: "haustiere", label: "Haustiere & Zubehör" },
  { value: "sonstiges", label: "Sonstiges" },
]

export const SERVICE_CATEGORIES: { value: ServiceCategory; label: string }[] = [
  { value: "handwerk", label: "Handwerk" },
  { value: "nachhilfe", label: "Nachhilfe & Unterricht" },
  { value: "gartenarbeit", label: "Gartenarbeit" },
  { value: "haushaltshilfe", label: "Haushaltshilfe" },
  { value: "transport", label: "Transport & Umzug" },
  { value: "it_technik", label: "IT & Technik" },
  { value: "reparaturen", label: "Reparaturen" },
  { value: "kreatives", label: "Kreatives & Design" },
  { value: "betreuung", label: "Betreuung" },
  { value: "sonstiges_service", label: "Sonstiges" },
]

export const BOARD_CATEGORIES: { value: BoardCategory; label: string }[] = [
  { value: "babysitter", label: "Kinderbetreuung" },
  { value: "werkzeug", label: "Werkzeug & Geräte" },
  { value: "mitfahrt", label: "Mitfahrgelegenheit" },
  { value: "haustier", label: "Haustiere" },
  { value: "nachhilfe_brett", label: "Nachhilfe & Lernen" },
  { value: "nachbarschaftshilfe", label: "Nachbarschaftshilfe" },
  { value: "fundsachen", label: "Fundsachen" },
  { value: "tausch_leih", label: "Tausch & Leih" },
  { value: "sonstiges_brett", label: "Sonstiges" },
]

export const LISTING_CONDITIONS: { value: ListingCondition; label: string }[] = [
  { value: "neu", label: "Neu" },
  { value: "wie_neu", label: "Wie neu" },
  { value: "gut", label: "Gut" },
  { value: "akzeptabel", label: "Akzeptabel" },
]

export const LISTING_STATUSES: { value: ListingStatus; label: string }[] = [
  { value: "active", label: "Aktiv" },
  { value: "sold", label: "Verkauft" },
  { value: "reserved", label: "Reserviert" },
  { value: "paused", label: "Pausiert" },
  { value: "deleted", label: "Gelöscht" },
]

export const PRICE_TYPES: { value: PriceType; label: string }[] = [
  { value: "fixed", label: "Festpreis" },
  { value: "negotiable", label: "Verhandlungsbasis" },
  { value: "free", label: "Zu verschenken" },
]

export const SERVICE_PRICE_TYPES: { value: ServicePriceType; label: string }[] = [
  { value: "per_hour", label: "Pro Stunde" },
  { value: "per_project", label: "Pauschal" },
  { value: "on_request", label: "Auf Anfrage" },
]

export const BOARD_PRICE_TYPES: { value: BoardPriceType; label: string }[] = [
  { value: "free", label: "Kostenlos" },
  { value: "fixed", label: "Festpreis" },
  { value: "negotiable", label: "Verhandlungsbasis" },
  { value: "on_request", label: "Auf Anfrage" },
]

// ============================================
// Helpers
// ============================================

export function isService(listing: { listing_type: ListingType }): boolean {
  return listing.listing_type === "service"
}

export function isBoard(listing: { listing_type: ListingType }): boolean {
  return listing.listing_type === "schwarzes_brett"
}

export function getCategoryLabel(category: MarketplaceCategory): string {
  return MARKETPLACE_CATEGORIES.find((c) => c.value === category)?.label ?? category
}

export function getServiceCategoryLabel(category: ServiceCategory): string {
  return SERVICE_CATEGORIES.find((c) => c.value === category)?.label ?? category
}

export function getBoardCategoryLabel(category: BoardCategory): string {
  return BOARD_CATEGORIES.find((c) => c.value === category)?.label ?? category
}

export function getAnyCategoryLabel(category: MarketplaceCategory | ServiceCategory | BoardCategory): string {
  return (
    MARKETPLACE_CATEGORIES.find((c) => c.value === category)?.label ??
    SERVICE_CATEGORIES.find((c) => c.value === category)?.label ??
    BOARD_CATEGORIES.find((c) => c.value === category)?.label ??
    category
  )
}

export function getConditionLabel(condition: ListingCondition): string {
  return LISTING_CONDITIONS.find((c) => c.value === condition)?.label ?? condition
}

export function getStatusLabel(status: ListingStatus): string {
  return LISTING_STATUSES.find((s) => s.value === status)?.label ?? status
}

export function getPriceTypeLabel(priceType: PriceType): string {
  return PRICE_TYPES.find((p) => p.value === priceType)?.label ?? priceType
}

export function formatPrice(price: number, priceType: PriceType): string {
  if (priceType === "free") return "Zu verschenken"
  const formatted = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(price)
  return priceType === "negotiable" ? `${formatted} VB` : formatted
}

export function formatServicePrice(price: number, priceType: ServicePriceType): string {
  if (priceType === "on_request") return "Auf Anfrage"
  const formatted = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(price)
  return priceType === "per_hour" ? `${formatted}/Std.` : formatted
}

export function formatBoardPrice(price: number, priceType: BoardPriceType): string {
  if (priceType === "free" || price === 0) return "Kostenlos"
  if (priceType === "on_request") return "Auf Anfrage"
  const formatted = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(price)
  return priceType === "negotiable" ? `${formatted} VB` : formatted
}

export function formatListingPrice(
  price: number,
  priceType: PriceType | ServicePriceType | BoardPriceType,
  listingType: ListingType
): string {
  if (listingType === "schwarzes_brett") {
    return formatBoardPrice(price, priceType as BoardPriceType)
  }
  if (listingType === "service") {
    return formatServicePrice(price, priceType as ServicePriceType)
  }
  return formatPrice(price, priceType as PriceType)
}
