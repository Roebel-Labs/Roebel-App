"use client"

import { useState, useCallback } from "react"
import Map, { Marker, NavigationControl } from "react-map-gl/mapbox"
import "mapbox-gl/dist/mapbox-gl.css"
import { Calendar, Store, UtensilsCrossed, MapPin, Phone, Clock, X, ArrowRight } from "lucide-react"
import { MAPBOX_TOKEN, ROEBEL_CENTER, DEFAULT_ZOOM, MARKER_COLORS } from "@/lib/maps/mapbox"
import Link from "next/link"
import Image from "next/image"

// Types for map data
export interface MapEvent {
  id: string
  title: string
  description: string | null
  date: string
  time: string | null
  end_time: string | null
  location: string
  category: string | null
  latitude: number
  longitude: number
  image_url: string | null
  organizer_name: string | null
}

export interface MapBusiness {
  id: string
  name: string
  slug: string
  category: string
  description: string | null
  address: string | null
  latitude: number
  longitude: number
  logo_url: string | null
  cover_image_url: string | null
  phone: string | null
  is_featured: boolean
}

export interface MapRestaurant {
  id: string
  name: string
  slug: string
  description: string | null
  address: string | null
  latitude: number
  longitude: number
  logo_url: string | null
  cover_image_url: string | null
  phone: string | null
}

type MarkerType = "event" | "business" | "restaurant"

interface SelectedMarker {
  type: MarkerType
  id: string
  latitude: number
  longitude: number
}

interface MapViewProps {
  events: MapEvent[]
  businesses: MapBusiness[]
  restaurants: MapRestaurant[]
  isAuthenticated?: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  gastronomie: "Gastronomie",
  einzelhandel: "Einzelhandel",
  handwerk: "Handwerk",
  dienstleistung: "Dienstleistung",
  gesundheit: "Gesundheit",
  bildung: "Bildung",
  kultur: "Kultur & Freizeit",
  sport: "Sport & Fitness",
  tourismus: "Tourismus",
  immobilien: "Immobilien",
  sonstiges: "Sonstiges",
}

export function MapView({ events, businesses, restaurants, isAuthenticated = false }: MapViewProps) {
  const [filters, setFilters] = useState({
    events: true,
    businesses: true,
    restaurants: true,
  })
  const [selected, setSelected] = useState<SelectedMarker | null>(null)

  const basePath = isAuthenticated ? "/app" : ""

  const toggleFilter = (key: keyof typeof filters) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleMarkerClick = useCallback(
    (type: MarkerType, id: string, latitude: number, longitude: number) => {
      setSelected({ type, id, latitude, longitude })
    },
    []
  )

  const handleMapClick = useCallback(() => {
    setSelected(null)
  }, [])

  const selectedEvent = selected?.type === "event" ? events.find((e) => e.id === selected.id) : null
  const selectedBusiness = selected?.type === "business" ? businesses.find((b) => b.id === selected.id) : null
  const selectedRestaurant = selected?.type === "restaurant" ? restaurants.find((r) => r.id === selected.id) : null

  return (
    <div className="relative w-full h-full">
      {/* Filter chips */}
      <div className="absolute top-4 left-4 right-4 z-10 flex flex-wrap gap-2">
        <button
          onClick={() => toggleFilter("events")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-medium transition-all ${
            filters.events
              ? "bg-white text-gray-900 shadow-sm border border-gray-200"
              : "bg-white/70 text-gray-400 border border-gray-100"
          }`}
        >
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: filters.events ? MARKER_COLORS.event : "#d1d5db" }}
          />
          Veranstaltungen
        </button>
        <button
          onClick={() => toggleFilter("businesses")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-medium transition-all ${
            filters.businesses
              ? "bg-white text-gray-900 shadow-sm border border-gray-200"
              : "bg-white/70 text-gray-400 border border-gray-100"
          }`}
        >
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: filters.businesses ? MARKER_COLORS.business : "#d1d5db" }}
          />
          Gewerbe
        </button>
        <button
          onClick={() => toggleFilter("restaurants")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-medium transition-all ${
            filters.restaurants
              ? "bg-white text-gray-900 shadow-sm border border-gray-200"
              : "bg-white/70 text-gray-400 border border-gray-100"
          }`}
        >
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: filters.restaurants ? MARKER_COLORS.restaurant : "#d1d5db" }}
          />
          Restaurants
        </button>
      </div>

      <Map
        initialViewState={{
          latitude: ROEBEL_CENTER.latitude,
          longitude: ROEBEL_CENTER.longitude,
          zoom: DEFAULT_ZOOM,
        }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
        onClick={handleMapClick}
      >
        <NavigationControl position="bottom-right" showCompass={false} />

        {/* Event markers */}
        {filters.events &&
          events.map((event) => {
            const isSelected = selected?.type === "event" && selected.id === event.id
            return (
              <Marker
                key={`event-${event.id}`}
                latitude={event.latitude}
                longitude={event.longitude}
                anchor="bottom"
                onClick={(e) => {
                  e.originalEvent.stopPropagation()
                  handleMarkerClick("event", event.id, event.latitude, event.longitude)
                }}
              >
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full bg-white cursor-pointer transition-all ${
                    isSelected ? "scale-125 ring-2 ring-white shadow-xl" : "shadow-lg hover:scale-110"
                  }`}
                >
                  <Calendar className="h-4 w-4" style={{ color: MARKER_COLORS.event }} />
                </div>
              </Marker>
            )
          })}

        {/* Business markers */}
        {filters.businesses &&
          businesses.map((biz) => {
            const isSelected = selected?.type === "business" && selected.id === biz.id
            return (
              <Marker
                key={`biz-${biz.id}`}
                latitude={biz.latitude}
                longitude={biz.longitude}
                anchor="bottom"
                onClick={(e) => {
                  e.originalEvent.stopPropagation()
                  handleMarkerClick("business", biz.id, biz.latitude, biz.longitude)
                }}
              >
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full bg-white cursor-pointer transition-all ${
                    isSelected ? "scale-125 ring-2 ring-white shadow-xl" : "shadow-lg hover:scale-110"
                  }`}
                >
                  <Store className="h-4 w-4" style={{ color: MARKER_COLORS.business }} />
                </div>
              </Marker>
            )
          })}

        {/* Restaurant markers */}
        {filters.restaurants &&
          restaurants.map((rest) => {
            const isSelected = selected?.type === "restaurant" && selected.id === rest.id
            return (
              <Marker
                key={`rest-${rest.id}`}
                latitude={rest.latitude}
                longitude={rest.longitude}
                anchor="bottom"
                onClick={(e) => {
                  e.originalEvent.stopPropagation()
                  handleMarkerClick("restaurant", rest.id, rest.latitude, rest.longitude)
                }}
              >
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full bg-white cursor-pointer transition-all ${
                    isSelected ? "scale-125 ring-2 ring-white shadow-xl" : "shadow-lg hover:scale-110"
                  }`}
                >
                  <UtensilsCrossed className="h-4 w-4" style={{ color: MARKER_COLORS.restaurant }} />
                </div>
              </Marker>
            )
          })}
      </Map>

      {/* Detail card overlay */}
      {selected && (selectedEvent || selectedBusiness || selectedRestaurant) && (
        <div className="absolute bottom-4 left-4 right-4 md:right-auto md:w-[360px] z-20 animate-in slide-in-from-bottom-4 duration-200">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            {/* Close button */}
            <button
              onClick={() => setSelected(null)}
              className="absolute top-3 right-3 z-30 w-7 h-7 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Event detail card */}
            {selectedEvent && (
              <>
                <div className="relative h-40 overflow-hidden bg-gray-100">
                  {selectedEvent.image_url ? (
                    <>
                      <Image
                        src={selectedEvent.image_url}
                        alt=""
                        fill
                        className="object-cover blur-xl scale-110"
                        aria-hidden="true"
                        sizes="360px"
                      />
                      <Image
                        src={selectedEvent.image_url}
                        alt={selectedEvent.title}
                        fill
                        className="object-contain relative z-10"
                        sizes="360px"
                      />
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full bg-gradient-to-br from-purple-50 to-purple-100">
                      <Calendar className="h-12 w-12 text-purple-300" />
                    </div>
                  )}

                  {/* Date badge */}
                  <div className="absolute bottom-3 left-3 z-20 bg-white rounded-lg shadow-md overflow-hidden min-w-[48px]">
                    <div className="text-center px-2 py-1.5">
                      <div className="text-xl font-semibold text-gray-900 leading-none">
                        {new Date(selectedEvent.date).getDate()}
                      </div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide mt-0.5">
                        {new Date(selectedEvent.date).toLocaleDateString("de-DE", { month: "short" })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-2">
                  {selectedEvent.category && (
                    <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {selectedEvent.category}
                    </span>
                  )}
                  <h3 className="text-base font-semibold text-gray-900 leading-snug line-clamp-2">
                    {selectedEvent.title}
                  </h3>
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    {selectedEvent.time && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {selectedEvent.time.slice(0, 5)}
                        {selectedEvent.end_time && ` - ${selectedEvent.end_time.slice(0, 5)}`}
                      </span>
                    )}
                    {selectedEvent.location && (
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">{selectedEvent.location}</span>
                      </span>
                    )}
                  </div>
                  {selectedEvent.description && (
                    <p className="text-sm text-gray-500 line-clamp-2">{selectedEvent.description}</p>
                  )}
                  <div className="pt-1">
                    <Link
                      href={`${basePath}/events/${selectedEvent.id}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      Details ansehen
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </>
            )}

            {/* Business detail card */}
            {selectedBusiness && (
              <>
                <div className="relative h-40 overflow-hidden bg-gray-100">
                  {selectedBusiness.cover_image_url ? (
                    <>
                      <Image
                        src={selectedBusiness.cover_image_url}
                        alt=""
                        fill
                        className="object-cover blur-xl scale-110"
                        aria-hidden="true"
                        sizes="360px"
                      />
                      <Image
                        src={selectedBusiness.cover_image_url}
                        alt={selectedBusiness.name}
                        fill
                        className="object-contain relative z-10"
                        sizes="360px"
                      />
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full bg-gradient-to-br from-green-50 to-green-100">
                      <Store className="h-12 w-12 text-green-300" />
                    </div>
                  )}
                  {selectedBusiness.is_featured && (
                    <span className="absolute top-3 left-3 z-20 bg-yellow-400 text-yellow-900 text-xs font-semibold px-2 py-0.5 rounded-full">
                      Empfohlen
                    </span>
                  )}
                </div>

                <div className="p-4 space-y-2">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-50 border border-gray-200 overflow-hidden flex items-center justify-center">
                      {selectedBusiness.logo_url ? (
                        <Image
                          src={selectedBusiness.logo_url}
                          alt={`${selectedBusiness.name} Logo`}
                          width={40}
                          height={40}
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <Store className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-gray-900 truncate">
                        {selectedBusiness.name}
                      </h3>
                      <span className="inline-block mt-0.5 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {CATEGORY_LABELS[selectedBusiness.category] || selectedBusiness.category}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    {selectedBusiness.address && (
                      <p className="flex items-center gap-1.5 text-sm text-gray-500">
                        <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">{selectedBusiness.address}</span>
                      </p>
                    )}
                    {selectedBusiness.phone && (
                      <p className="flex items-center gap-1.5 text-sm text-gray-500">
                        <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                        {selectedBusiness.phone}
                      </p>
                    )}
                  </div>

                  {selectedBusiness.description && (
                    <p className="text-sm text-gray-500 line-clamp-2">{selectedBusiness.description}</p>
                  )}

                  <div className="pt-1">
                    <Link
                      href={`${basePath}/gewerbe/${selectedBusiness.slug}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      Details ansehen
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </>
            )}

            {/* Restaurant detail card */}
            {selectedRestaurant && (
              <>
                <div className="relative h-40 overflow-hidden bg-gray-100">
                  {selectedRestaurant.cover_image_url ? (
                    <>
                      <Image
                        src={selectedRestaurant.cover_image_url}
                        alt=""
                        fill
                        className="object-cover blur-xl scale-110"
                        aria-hidden="true"
                        sizes="360px"
                      />
                      <Image
                        src={selectedRestaurant.cover_image_url}
                        alt={selectedRestaurant.name}
                        fill
                        className="object-contain relative z-10"
                        sizes="360px"
                      />
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full bg-gradient-to-br from-orange-50 to-orange-100">
                      <UtensilsCrossed className="h-12 w-12 text-orange-300" />
                    </div>
                  )}
                </div>

                <div className="p-4 space-y-2">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-50 border border-gray-200 overflow-hidden flex items-center justify-center">
                      {selectedRestaurant.logo_url ? (
                        <Image
                          src={selectedRestaurant.logo_url}
                          alt={`${selectedRestaurant.name} Logo`}
                          width={40}
                          height={40}
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <UtensilsCrossed className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-semibold text-gray-900 truncate">
                        {selectedRestaurant.name}
                      </h3>
                      <span className="inline-block mt-0.5 text-xs font-medium px-2 py-0.5 rounded-full bg-orange-50 text-orange-700">
                        Restaurant
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    {selectedRestaurant.address && (
                      <p className="flex items-center gap-1.5 text-sm text-gray-500">
                        <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">{selectedRestaurant.address}</span>
                      </p>
                    )}
                    {selectedRestaurant.phone && (
                      <p className="flex items-center gap-1.5 text-sm text-gray-500">
                        <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                        {selectedRestaurant.phone}
                      </p>
                    )}
                  </div>

                  {selectedRestaurant.description && (
                    <p className="text-sm text-gray-500 line-clamp-2">{selectedRestaurant.description}</p>
                  )}

                  <div className="pt-1">
                    <Link
                      href={`${basePath}/speisekarten/${selectedRestaurant.slug}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      Speisekarte ansehen
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
