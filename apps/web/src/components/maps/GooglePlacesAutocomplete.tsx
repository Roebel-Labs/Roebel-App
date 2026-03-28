"use client";

import { useEffect, useRef, useState } from "react";
import { Loader } from "@googlemaps/js-api-loader";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, AlertCircle } from "lucide-react";
import type { GooglePlacesAutocompleteProps } from "@/types/google-places";
import { convertPlaceResultToPlaceData } from "@/lib/maps/utils";

/**
 * Google Places Autocomplete Component
 *
 * Provides location search with real-time suggestions from Google Maps.
 * Returns full place details including coordinates and structured address data.
 *
 * @example
 * <GooglePlacesAutocomplete
 *   value={location}
 *   onChange={setLocation}
 *   onPlaceSelect={(place) => {
 *     if (place) {
 *       console.log('Selected:', place.formattedAddress);
 *       console.log('Coords:', place.latitude, place.longitude);
 *     }
 *   }}
 *   placeholder="Enter event location"
 *   required
 * />
 */
export function GooglePlacesAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Enter location",
  className = "",
  disabled = false,
  required = false,
}: GooglePlacesAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  // Initialize Google Maps API
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      setError("Google Maps API key not configured");
      setIsLoading(false);
      console.error(
        "Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY environment variable. " +
        "Add it to your .env.local file."
      );
      return;
    }

    const loader = new Loader({
      apiKey,
      version: "weekly",
      libraries: ["places"],
    });

    loader.load().then(() => {
      if (!inputRef.current) return;

        // Create autocomplete instance
        const autocompleteInstance = new google.maps.places.Autocomplete(inputRef.current, {
          fields: [
            "place_id",
            "formatted_address",
            "geometry",
            "name",
            "address_components",
            "types",
          ],
          types: ["geocode", "establishment"], // Allow addresses and named places
        });

        // Handle place selection
        autocompleteInstance.addListener("place_changed", () => {
          const place = autocompleteInstance.getPlace();

          if (!place.geometry || !place.geometry.location) {
            // User entered the name of a Place that was not suggested
            console.warn("No details available for input:", place.name);
            onPlaceSelect(null);
            return;
          }

          // Convert to our format
          const placeData = convertPlaceResultToPlaceData(place);

          if (placeData) {
            // Update input value with formatted address
            if (onChange) {
              onChange(placeData.formattedAddress);
            }
            onPlaceSelect(placeData);
          } else {
            onPlaceSelect(null);
          }
        });

      autocompleteRef.current = autocompleteInstance;
      setIsLoading(false);
      setError(null);
    }).catch((err) => {
      console.error("Error loading Google Maps:", err);
      setError("Failed to load Google Maps");
      setIsLoading(false);
    });

    // Cleanup
    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [onChange, onPlaceSelect]); // Include dependencies

  // Handle manual input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (onChange) {
      onChange(newValue);
    }
    // Clear place data when user modifies the input manually
    if (newValue !== value) {
      onPlaceSelect(null);
    }
  };

  // If Google Maps fails to load, fallback to regular input
  if (error) {
    return (
      <div className="space-y-2">
        <div className="relative">
          <Input
            ref={inputRef}
            type="text"
            value={value || ""}
            onChange={handleInputChange}
            placeholder={placeholder}
            className={className}
            disabled={disabled}
            required={required}
          />
          <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-yellow-600" />
        </div>
        <p className="text-xs text-yellow-600 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Google Maps unavailable. Using manual entry.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        type="text"
        value={value || ""}
        onChange={handleInputChange}
        placeholder={placeholder}
        className={`${className} ${isLoading ? "pr-10" : "pr-10"}`}
        disabled={disabled || isLoading}
        required={required}
      />

      {/* Loading indicator */}
      {isLoading && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
      )}

      {/* Location icon when ready */}
      {!isLoading && (
        <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      )}
    </div>
  );
}
