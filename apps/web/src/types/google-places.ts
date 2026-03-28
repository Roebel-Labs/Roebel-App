/**
 * TypeScript types for Google Places API integration
 */

export interface PlaceData {
  // Core location data
  placeId: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;

  // Structured address components
  addressComponents: AddressComponent[];

  // Optional additional details
  name?: string;
  types?: string[];
}

export interface AddressComponent {
  longName: string;
  shortName: string;
  types: string[];
}

export interface ParsedAddress {
  street?: string;
  streetNumber?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  formattedAddress: string;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Type for the autocomplete selection callback
 */
export type PlaceSelectionCallback = (placeData: PlaceData | null) => void;

/**
 * Props for GooglePlacesAutocomplete component
 */
export interface GooglePlacesAutocompleteProps {
  value?: string;
  onChange?: (value: string) => void;
  onPlaceSelect: PlaceSelectionCallback;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}

/**
 * Event data with geographical information for database storage
 */
export interface EventLocationData {
  location: string; // Original location string (backward compatible)
  latitude?: number | null;
  longitude?: number | null;
  place_id?: string | null;
  formatted_address?: string | null;
  address_components?: AddressComponent[] | null;
}
