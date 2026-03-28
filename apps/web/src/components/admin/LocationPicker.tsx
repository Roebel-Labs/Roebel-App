"use client"

import { useState, useCallback } from "react"
import Map, { Marker, NavigationControl } from "react-map-gl/mapbox"
import "mapbox-gl/dist/mapbox-gl.css"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MapPin, Loader2, Navigation } from "lucide-react"
import { toast } from "sonner"
import { MAPBOX_TOKEN, ROEBEL_CENTER, DEFAULT_ZOOM } from "@/lib/maps/mapbox"
import type { MarkerDragEvent } from "react-map-gl/mapbox"

interface LocationPickerProps {
  latitude: number | null
  longitude: number | null
  address: string
  onCoordinatesChange: (lat: number | null, lng: number | null) => void
}

export function LocationPicker({
  latitude,
  longitude,
  address,
  onCoordinatesChange,
}: LocationPickerProps) {
  const [isGeocoding, setIsGeocoding] = useState(false)

  const hasCoordinates = latitude !== null && longitude !== null

  const handleGeocode = async () => {
    if (!address.trim()) {
      toast.error("Bitte geben Sie zuerst eine Adresse ein")
      return
    }

    setIsGeocoding(true)
    try {
      const response = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error("Adresse konnte nicht gefunden werden")
        return
      }

      onCoordinatesChange(data.latitude, data.longitude)
      toast.success("Koordinaten ermittelt", {
        description: data.formatted_address,
      })
    } catch {
      toast.error("Fehler bei der Adresssuche")
    } finally {
      setIsGeocoding(false)
    }
  }

  const handleMarkerDrag = useCallback(
    (event: MarkerDragEvent) => {
      onCoordinatesChange(event.lngLat.lat, event.lngLat.lng)
    },
    [onCoordinatesChange]
  )

  const handleLatChange = (value: string) => {
    const num = parseFloat(value)
    if (value === "" || value === "-") {
      onCoordinatesChange(null, longitude)
    } else if (!isNaN(num)) {
      onCoordinatesChange(num, longitude)
    }
  }

  const handleLngChange = (value: string) => {
    const num = parseFloat(value)
    if (value === "" || value === "-") {
      onCoordinatesChange(latitude, null)
    } else if (!isNaN(num)) {
      onCoordinatesChange(latitude, num)
    }
  }

  return (
    <div className="space-y-4">
      {/* Geocode button */}
      <Button
        type="button"
        variant="outline"
        onClick={handleGeocode}
        disabled={isGeocoding || !address.trim()}
        className="w-full"
      >
        {isGeocoding ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Navigation className="h-4 w-4 mr-2" />
        )}
        Koordinaten aus Adresse ermitteln
      </Button>

      {/* Lat/Lng inputs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="latitude">Breitengrad</Label>
          <Input
            id="latitude"
            type="number"
            step="any"
            value={latitude ?? ""}
            onChange={(e) => handleLatChange(e.target.value)}
            placeholder="53.3717"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="longitude">Längengrad</Label>
          <Input
            id="longitude"
            type="number"
            step="any"
            value={longitude ?? ""}
            onChange={(e) => handleLngChange(e.target.value)}
            placeholder="12.6038"
          />
        </div>
      </div>

      {/* Map preview */}
      <div className="rounded-lg overflow-hidden border border-border" style={{ height: 200 }}>
        <Map
          initialViewState={{
            latitude: hasCoordinates ? latitude! : ROEBEL_CENTER.latitude,
            longitude: hasCoordinates ? longitude! : ROEBEL_CENTER.longitude,
            zoom: hasCoordinates ? 15 : DEFAULT_ZOOM,
          }}
          {...(hasCoordinates
            ? {
                latitude: latitude!,
                longitude: longitude!,
                zoom: 15,
              }
            : {})}
          style={{ width: "100%", height: "100%" }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          mapboxAccessToken={MAPBOX_TOKEN}
        >
          <NavigationControl position="bottom-right" showCompass={false} />
          {hasCoordinates && (
            <Marker
              latitude={latitude!}
              longitude={longitude!}
              anchor="bottom"
              draggable
              onDragEnd={handleMarkerDrag}
            >
              <MapPin className="h-8 w-8 text-primary drop-shadow-lg" />
            </Marker>
          )}
        </Map>
      </div>
      {hasCoordinates && (
        <p className="text-xs text-muted-foreground">
          Marker auf der Karte verschieben, um die Position anzupassen
        </p>
      )}
    </div>
  )
}
