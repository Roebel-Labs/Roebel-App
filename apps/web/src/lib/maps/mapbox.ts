// Mapbox configuration constants

export const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? ""

export const ROEBEL_CENTER = {
  latitude: 53.3717,
  longitude: 12.6038,
} as const

export const DEFAULT_ZOOM = 13

export const MARKER_COLORS = {
  event: "#7C3AED",     // purple
  business: "#16A34A",  // green
  restaurant: "#EA580C", // orange
} as const
