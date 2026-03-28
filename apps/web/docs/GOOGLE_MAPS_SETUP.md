# Google Maps Integration Setup Guide

This guide explains how to set up and use the Google Maps Places Autocomplete integration for event location selection.

## Overview

The event submission form now includes Google Maps Places Autocomplete, which provides:
- ✅ Real-time location suggestions as users type
- ✅ Accurate geographical coordinates (latitude/longitude)
- ✅ Structured address data (city, country, postal code)
- ✅ Google Maps Place IDs for reference
- ✅ Ready-to-use data for displaying events on maps

## Setup Instructions

### 1. Get a Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - **Maps JavaScript API**
   - **Places API**
   - **(Optional)** Geocoding API - for reverse geocoding

4. Create an API key:
   - Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **API Key**
   - Copy your API key

### 2. Restrict Your API Key (IMPORTANT for Security)

1. In Google Cloud Console, click on your API key to edit it
2. Under **Application restrictions**:
   - Select **HTTP referrers**
   - Add your domains:
     ```
     localhost:3000/*
     yourdomain.com/*
     *.yourdomain.com/*
     ```
3. Under **API restrictions**:
   - Select **Restrict key**
   - Choose only:
     - Maps JavaScript API
     - Places API

### 3. Add API Key to Environment Variables

Create or update your `.env.local` file:

```bash
# Google Maps API Key
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_api_key_here
```

**Note:** The `NEXT_PUBLIC_` prefix makes it available on the client side.

### 4. Run Database Migration

Execute the SQL migration to add geographical columns to your events table:

```bash
# Using Supabase CLI
supabase db reset

# Or manually run the SQL file in Supabase Studio
# Location: database/migrations/add_google_maps_fields_to_events.sql
```

Or run directly in Supabase SQL Editor:

```sql
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7) NULL,
ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7) NULL,
ADD COLUMN IF NOT EXISTS place_id VARCHAR(255) NULL,
ADD COLUMN IF NOT EXISTS formatted_address TEXT NULL,
ADD COLUMN IF NOT EXISTS address_components JSONB NULL;

CREATE INDEX IF NOT EXISTS idx_events_coordinates
ON public.events USING btree (latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
```

### 5. Restart Your Development Server

```bash
npm run dev
```

## Usage

### In the Event Submission Form

The form now includes a Google Places Autocomplete input for the location field:

1. User starts typing an address or place name
2. Google provides real-time suggestions
3. User selects a location from the dropdown
4. Form automatically stores:
   - Formatted address
   - Latitude & longitude
   - Place ID
   - Structured address components

### Fetching Events for Map Display

In your map application, fetch events with coordinates:

```typescript
import { createClient } from "@/lib/supabase/client";

async function getEventsForMap() {
  const supabase = createClient();

  const { data: events } = await supabase
    .from('events')
    .select('*')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .eq('status', 'approved');

  return events;
}
```

### Displaying Events on Google Maps

```typescript
// Initialize map
const map = new google.maps.Map(document.getElementById('map'), {
  zoom: 12,
  center: { lat: 52.520008, lng: 13.404954 } // Berlin
});

// Add markers for each event
events.forEach(event => {
  const marker = new google.maps.Marker({
    position: { lat: event.latitude, lng: event.longitude },
    map: map,
    title: event.title
  });

  // Add info window
  const infoWindow = new google.maps.InfoWindow({
    content: `
      <h3>${event.title}</h3>
      <p>${event.formatted_address}</p>
      <p>${new Date(event.date).toLocaleDateString()}</p>
    `
  });

  marker.addListener('click', () => {
    infoWindow.open(map, marker);
  });
});
```

### Filtering Events by Location

```typescript
// Find events in a bounding box (visible map area)
const { data } = await supabase
  .from('events')
  .select('*')
  .gte('latitude', bounds.south)
  .lte('latitude', bounds.north)
  .gte('longitude', bounds.west)
  .lte('longitude', bounds.east);

// Find events in a specific city
const { data } = await supabase
  .from('events')
  .select('*')
  .contains('address_components', [{ types: ['locality'], long_name: 'Berlin' }]);
```

## Database Schema

### New Columns Added to `events` Table

| Column | Type | Description |
|--------|------|-------------|
| `latitude` | NUMERIC(10, 7) | Geographical latitude (-90 to 90) |
| `longitude` | NUMERIC(10, 7) | Geographical longitude (-180 to 180) |
| `place_id` | VARCHAR(255) | Google Maps Place ID |
| `formatted_address` | TEXT | Clean, formatted address string |
| `address_components` | JSONB | Structured data (city, country, etc.) |

### Example `address_components` Structure

```json
[
  {
    "longName": "Berlin",
    "shortName": "Berlin",
    "types": ["locality", "political"]
  },
  {
    "longName": "Germany",
    "shortName": "DE",
    "types": ["country", "political"]
  },
  {
    "longName": "10115",
    "shortName": "10115",
    "types": ["postal_code"]
  }
]
```

## API Costs & Limits

### Google Maps Pricing (as of 2024)

- **Free tier**: $200 credit/month (~28,000 map loads)
- **Places Autocomplete**: $2.83 per 1,000 requests (after free tier)
- **Maps JavaScript API**: $7 per 1,000 loads (after free tier)

**Typical usage for small apps:** Usually stays within free tier

### Best Practices to Minimize Costs

1. ✅ Restrict API key to specific domains
2. ✅ Use session tokens (automatically handled by the component)
3. ✅ Cache place data in your database (already implemented)
4. ✅ Monitor usage in Google Cloud Console

## Fallback Behavior

If Google Maps fails to load or the API key is missing:
- The component falls back to a regular text input
- Shows a warning message to the user
- Events can still be submitted with manual address entry
- No coordinates will be stored (latitude/longitude will be null)

## Troubleshooting

### API Key Issues

**Error: "Google Maps API key not configured"**
- Check that `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is in `.env.local`
- Restart dev server after adding the key

**Error: "This API key is not authorized"**
- Check API restrictions in Google Cloud Console
- Ensure your domain is in the allowed referrers list
- Verify Maps JavaScript API and Places API are enabled

### Autocomplete Not Working

1. Open browser DevTools Console
2. Look for Google Maps errors
3. Common issues:
   - API key not loaded
   - APIs not enabled in Google Cloud
   - Domain restrictions blocking localhost

### Database Errors

**Error: Column does not exist**
- Run the migration SQL file
- Check that all columns were added successfully

**Error: Invalid JSON for address_components**
- Check that data is properly JSON.stringified before submission
- Verify JSONB column type in database

## TypeScript Types

The integration includes comprehensive TypeScript types:

```typescript
import type { PlaceData, Coordinates } from '@/types/google-places';

// Full place data from autocomplete selection
interface PlaceData {
  placeId: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  addressComponents: AddressComponent[];
  name?: string;
  types?: string[];
}

// Simple coordinates
interface Coordinates {
  latitude: number;
  longitude: number;
}
```

## Component API

### GooglePlacesAutocomplete Props

```typescript
interface GooglePlacesAutocompleteProps {
  value?: string;                          // Controlled input value
  onChange?: (value: string) => void;      // Input change handler
  onPlaceSelect: (place: PlaceData | null) => void; // Place selection handler
  placeholder?: string;                     // Input placeholder
  className?: string;                       // Custom CSS classes
  disabled?: boolean;                       // Disable input
  required?: boolean;                       // Required field
}
```

## Support

For issues or questions:
- Check Google Maps [official documentation](https://developers.google.com/maps/documentation/javascript)
- Review [Places API docs](https://developers.google.com/maps/documentation/places/web-service)
- Check the [troubleshooting section](#troubleshooting) above

## License

This integration uses Google Maps Platform services. Review [Google Maps Platform Terms of Service](https://cloud.google.com/maps-platform/terms).
