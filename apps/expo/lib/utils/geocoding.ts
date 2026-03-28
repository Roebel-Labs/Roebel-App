import type { PlaceData } from "@/lib/schemas/event-schema"

/**
 * Geocode a natural language location using Google Places API
 * Converts user-provided location strings to structured geographical data
 *
 * @param locationQuery - Natural language location (e.g., "Town Hall Berlin", "Alexanderplatz")
 * @param apiKey - Google Maps API key
 * @returns PlaceData with coordinates, place_id, and formatted address
 */
// Röbel/Müritz coordinates for location bias
const ROEBEL_LAT = 53.3833;
const ROEBEL_LNG = 12.6167;
const SEARCH_RADIUS = 50000; // 50km radius

// Helper function to try autocomplete with a specific query
async function tryAutocomplete(
  query: string,
  apiKey: string
): Promise<{ place_id: string } | null> {
  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
    query
  )}&key=${apiKey}&language=de&components=country:de&location=${ROEBEL_LAT},${ROEBEL_LNG}&radius=${SEARCH_RADIUS}`

  const response = await fetch(url)
  const data = await response.json()

  if (data.status === "OK" && data.predictions?.length > 0) {
    return { place_id: data.predictions[0].place_id }
  }
  return null
}

// Helper function to try Text Search API (more forgiving than Autocomplete)
async function tryTextSearch(
  query: string,
  apiKey: string
): Promise<{ place_id: string } | null> {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
    query
  )}&key=${apiKey}&language=de&location=${ROEBEL_LAT},${ROEBEL_LNG}&radius=${SEARCH_RADIUS}`

  const response = await fetch(url)
  const data = await response.json()

  if (data.status === "OK" && data.results?.length > 0) {
    return { place_id: data.results[0].place_id }
  }
  return null
}

export async function geocodeLocation(
  locationQuery: string,
  apiKey: string
): Promise<PlaceData | null> {
  try {
    if (!apiKey) {
      console.error("Google Maps API key is not configured")
      return null
    }

    let placeResult: { place_id: string } | null = null

    // Check if query already contains "Röbel" or "Müritz"
    const hasRoebel = locationQuery.toLowerCase().includes("röbel")
    const hasMuritz = locationQuery.toLowerCase().includes("müritz")

    // Strategy 1: If location doesn't mention Röbel, add it first (most common case)
    if (!hasRoebel && !hasMuritz) {
      const queryWithRoebel = `${locationQuery}, Röbel/Müritz`
      console.log(`Geocoding: Trying "${queryWithRoebel}"`)
      placeResult = await tryAutocomplete(queryWithRoebel, apiKey)
    }

    // Strategy 2: Try original query with Autocomplete
    if (!placeResult) {
      console.log(`Geocoding: Trying "${locationQuery}"`)
      placeResult = await tryAutocomplete(locationQuery, apiKey)
    }

    // Strategy 3: If contains "Röbel", append "Müritz" for disambiguation
    if (!placeResult && hasRoebel && !hasMuritz) {
      const queryWithMuritz = `${locationQuery}, Müritz`
      console.log(`Geocoding: Trying "${queryWithMuritz}"`)
      placeResult = await tryAutocomplete(queryWithMuritz, apiKey)
    }

    // Strategy 4: Try Text Search API with Röbel context
    if (!placeResult) {
      const queryWithContext = hasRoebel ? locationQuery : `${locationQuery}, Röbel/Müritz`
      console.log(`Geocoding: Trying Text Search for "${queryWithContext}"`)
      placeResult = await tryTextSearch(queryWithContext, apiKey)
    }

    // Strategy 5: Try Text Search with full "Röbel Müritz" appended
    if (!placeResult && !hasRoebel) {
      const queryWithFullContext = `${locationQuery} Röbel Müritz`
      console.log(`Geocoding: Trying Text Search for "${queryWithFullContext}"`)
      placeResult = await tryTextSearch(queryWithFullContext, apiKey)
    }

    if (!placeResult) {
      console.warn(`No places found for query: ${locationQuery} (all strategies failed)`)
      return null
    }

    // Get detailed place information including coordinates
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeResult.place_id}&fields=geometry,formatted_address,address_components&key=${apiKey}`

    const detailsResponse = await fetch(detailsUrl)
    const detailsData = await detailsResponse.json()

    if (detailsData.status !== "OK" || !detailsData.result) {
      console.warn(`Failed to get place details for: ${placeResult.place_id}`)
      return null
    }

    const result = detailsData.result
    console.log(`Geocoding success: ${result.formatted_address}`)

    return {
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
      place_id: placeResult.place_id,
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
 * @param apiKey - Google Maps API key
 * @returns Array of place suggestions with descriptions
 */
export async function getLocationSuggestions(
  locationQuery: string,
  apiKey: string
): Promise<Array<{ description: string; place_id: string }>> {
  try {
    if (!apiKey) {
      console.error("Google Maps API key is not configured")
      return []
    }

    // Use location bias towards Röbel/Müritz for better local results
    const autocompleteUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
      locationQuery
    )}&key=${apiKey}&language=de&components=country:de&location=${ROEBEL_LAT},${ROEBEL_LNG}&radius=${SEARCH_RADIUS}`

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
