import {
  Calendar,
  Palette,
  Dumbbell,
  Music,
  UtensilsCrossed,
  Church,
  Frame,
  Landmark,
  MoreHorizontal,
} from "lucide-react"

export const CATEGORIES = [
  "Kultur",
  "Musik",
  "Essen & Trinken",
  "Kirchliches",
  "Ausstellungen",
  "Stadt",
  "Sport",
  "Sonstige",
] as const

export const CATEGORIES_WITH_ICONS = [
  { name: "All Events", icon: Calendar },
  { name: "Kultur", icon: Palette },
  { name: "Musik", icon: Music },
  { name: "Essen & Trinken", icon: UtensilsCrossed },
  { name: "Kirchliches", icon: Church },
  { name: "Ausstellungen", icon: Frame },
  { name: "Stadt", icon: Landmark },
  { name: "Sport", icon: Dumbbell },
  { name: "Sonstige", icon: MoreHorizontal },
] as const

export type CategoryType = typeof CATEGORIES[number]