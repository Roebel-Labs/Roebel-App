import type { PlaceData } from "@/lib/schemas/event-schema"

/**
 * Geocode a natural language location using Google Places API
 * Converts user-provided location strings to structured geographical data
 *
 * @param locationQuery - Natural language location (e.g., "Town Hall Berlin", "Alexanderplatz")
 * @returns PlaceData with coordinates, place_id, and formatted address
 */
export async function geocodeLocation(
  locationQuery: string
): Promise<PlaceData | null> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

    if (!apiKey) {
      console.error("Google Maps API key is not configured")
      return null
    }

    // Use Google Places Autocomplete API for better natural language understanding
    const autocompleteUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
      locationQuery
    )}&key=${apiKey}&language=de&components=country:de`

    const autocompleteResponse = await fetch(autocompleteUrl)
    const autocompleteData = await autocompleteResponse.json()

    if (
      autocompleteData.status !== "OK" ||
      !autocompleteData.predictions ||
      autocompleteData.predictions.length === 0
    ) {
      console.warn(
        `No places found for query: ${locationQuery}`,
        autocompleteData.status
      )
      return null
    }

    // Get the top prediction
    const topPrediction = autocompleteData.predictions[0]
    const placeId = topPrediction.place_id

    // Get detailed place information including coordinates
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry,formatted_address,address_components&key=${apiKey}`

    const detailsResponse = await fetch(detailsUrl)
    const detailsData = await detailsResponse.json()

    if (detailsData.status !== "OK" || !detailsData.result) {
      console.warn(`Failed to get place details for: ${placeId}`)
      return null
    }

    const result = detailsData.result

    return {
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
      place_id: placeId,
      formatted_address: result.formatted_address,
      address_components: result.address_components || [],
    }
  } catch (error) {
    console.error("Geocoding error:", error)
    return null
  }
}

/**
 * Get multiple location suggestions for disambiguation
 * Used when a location query is ambiguous
 *
 * @param locationQuery - Natural language location query
 * @returns Array of place suggestions with descriptions
 */
export async function getLocationSuggestions(
  locationQuery: string
): Promise<Array<{ description: string; place_id: string }>> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

    if (!apiKey) {
      console.error("Google Maps API key is not configured")
      return []
    }

    const autocompleteUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
      locationQuery
    )}&key=${apiKey}&language=de&components=country:de`

    const response = await fetch(autocompleteUrl)
    const data = await response.json()

    if (data.status !== "OK" || !data.predictions) {
      return []
    }

    return data.predictions.slice(0, 5).map((prediction: any) => ({
      description: prediction.description,
      place_id: prediction.place_id,
    }))
  } catch (error) {
    console.error("Location suggestions error:", error)
    return []
  }
}

/**
 * Validate that coordinates are within expected ranges
 */
export function validateCoordinates(
  latitude: number,
  longitude: number
): boolean {
  return (
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  )
}
