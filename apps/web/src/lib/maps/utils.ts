/**
 * Utility functions for Google Maps integration
 */

import type { AddressComponent, ParsedAddress, PlaceData, Coordinates } from "@/types/google-places";

/**
 * Extract a specific component type from Google Places address components
 */
export function getAddressComponent(
  components: AddressComponent[],
  type: string,
  useShortName = false
): string | undefined {
  const component = components.find((c) => c.types.includes(type));
  return component ? (useShortName ? component.shortName : component.longName) : undefined;
}

/**
 * Parse Google Places address components into a structured format
 */
export function parseAddressComponents(components: AddressComponent[]): ParsedAddress {
  return {
    streetNumber: getAddressComponent(components, "street_number"),
    street: getAddressComponent(components, "route"),
    city:
      getAddressComponent(components, "locality") ||
      getAddressComponent(components, "postal_town") ||
      getAddressComponent(components, "administrative_area_level_2"),
    state: getAddressComponent(components, "administrative_area_level_1"),
    country: getAddressComponent(components, "country"),
    postalCode: getAddressComponent(components, "postal_code"),
    formattedAddress: "", // Will be set separately
  };
}

/**
 * Format coordinates for display
 */
export function formatCoordinates(coords: Coordinates, precision = 6): string {
  return `${coords.latitude.toFixed(precision)}, ${coords.longitude.toFixed(precision)}`;
}

/**
 * Validate that coordinates are within valid ranges
 */
export function validateCoordinates(latitude: number, longitude: number): boolean {
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Convert Google Places PlaceResult to our PlaceData format
 */
export function convertPlaceResultToPlaceData(
  place: google.maps.places.PlaceResult
): PlaceData | null {
  // Validate required fields
  if (!place.place_id || !place.formatted_address || !place.geometry?.location) {
    console.error("Invalid place result: missing required fields");
    return null;
  }

  const lat = place.geometry.location.lat();
  const lng = place.geometry.location.lng();

  // Validate coordinates
  if (!validateCoordinates(lat, lng)) {
    console.error("Invalid coordinates:", lat, lng);
    return null;
  }

  // Convert address components to our format
  const addressComponents: AddressComponent[] = (place.address_components || []).map((component) => ({
    longName: component.long_name,
    shortName: component.short_name,
    types: component.types,
  }));

  return {
    placeId: place.place_id,
    formattedAddress: place.formatted_address,
    latitude: lat,
    longitude: lng,
    addressComponents,
    name: place.name,
    types: place.types,
  };
}

/**
 * Check if a location string appears to be a formatted address
 */
export function isFormattedAddress(location: string): boolean {
  // Basic heuristic: formatted addresses typically contain commas and numbers
  const hasComma = location.includes(",");
  const hasNumber = /\d/.test(location);
  const hasMinLength = location.length > 10;

  return hasComma && hasNumber && hasMinLength;
}

/**
 * Create a Google Maps URL for a location
 */
export function createMapsUrl(coords: Coordinates, placeName?: string): string {
  const query = placeName
    ? encodeURIComponent(placeName)
    : `${coords.latitude},${coords.longitude}`;
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

/**
 * Format address components into a short display string
 * Example: "Berlin, Germany" or "San Francisco, CA, USA"
 */
export function formatShortAddress(components: AddressComponent[]): string {
  const parsed = parseAddressComponents(components);
  const parts: string[] = [];

  if (parsed.city) parts.push(parsed.city);
  if (parsed.state) parts.push(parsed.state);
  if (parsed.country) parts.push(parsed.country);

  return parts.join(", ") || "";
}
