# AI-Powered Event Submission System

## Overview

A conversational AI interface for event submission using OpenAI GPT-4o, built with the Vercel AI SDK. Users can either chat naturally about their event or upload a flyer for automatic information extraction.

## Features

### 🤖 Conversational Event Collection
- Natural German language conversation
- Asks questions one at a time to avoid overwhelming users
- Tracks progress and shows completion status
- Validates data in real-time

### 📄 Flyer Extraction (OCR)
- Upload event flyers/posters (PNG, JPG, etc.)
- Automatic extraction of:
  - Event title and description
  - Date and time
  - Location
  - Organizer information
  - Ticket prices
  - Category
- Confirms if flyer should be used as event thumbnail

### 🗺️ Smart Location Geocoding
- Converts natural language locations to Google Maps coordinates
- Examples: "Rathaus Berlin", "Alexanderplatz", "Main Street 42"
- Verifies locations with Google Places API
- Displays confirmation when location is verified

### ✅ Data Validation
- Ensures all required fields are collected
- Validates email format
- Checks that event dates are in the future
- Confirms coordinate ranges are valid

## File Structure

```
dao-app/
├── src/
│   ├── app/
│   │   ├── api/chat/event-submission/
│   │   │   └── route.ts                    # AI chat API endpoint
│   │   ├── submit-ai/
│   │   │   └── page.tsx                    # AI submission page
│   │   └── submit/
│   │       └── page.tsx                    # Traditional form (with AI link)
│   ├── components/events/
│   │   └── ai-event-submission-chat.tsx    # Chat interface component
│   └── lib/
│       ├── schemas/
│       │   └── event-schema.ts             # Zod validation schema
│       └── utils/
│           ├── geocoding.ts                # Google Places integration
│           └── flyer-extraction.ts         # GPT-4 Vision OCR
```

## Environment Variables

Add these to your `.env.local`:

```bash
# OpenAI API Key (required for AI features)
OPENAI_API_KEY=your_openai_api_key

# Google Maps API Key (required for geocoding)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# Existing variables
NEXT_PUBLIC_TEMPLATE_CLIENT_ID=your_thirdweb_client_id
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Getting API Keys

1. **OpenAI API Key**:
   - Go to https://platform.openai.com/api-keys
   - Create a new API key
   - Make sure you have credits available
   - Model used: `gpt-4o` (supports vision and tool calling)

2. **Google Maps API Key**:
   - Go to https://console.cloud.google.com/
   - Enable these APIs:
     - Places API
     - Geocoding API
     - Places Autocomplete API
   - Create credentials → API key
   - Restrict the key to your domain (optional but recommended)

## Usage

### Accessing the AI Submission

1. Navigate to `/submit-ai` in your browser
2. Or click "Probiere die KI-gestützte Einreichung" on the traditional form (`/submit`)

### Conversation Flow

#### Option 1: Upload a Flyer
```
User: [Uploads flyer.jpg]
AI: Ich habe folgende Informationen aus dem Flyer extrahiert:
    - Titel: Sommerfest im Park
    - Datum: 2025-07-15
    - Ort: Stadtpark Berlin
    ...
    Möchtest du dieses Bild auch als Event-Bild verwenden? (Ja/Nein)
User: Ja
AI: Perfect! Lass mich den Ort verifizieren...
    ✓ Ort bestätigt: Stadtpark, Berlin
    Fehlt noch deine E-Mail Adresse. Wie kann ich dich erreichen?
User: max@example.com
AI: Super! Hier ist eine Zusammenfassung...
    [Shows all collected data]
    Soll ich das Event so einreichen?
User: Ja
AI: ✓ Event erfolgreich eingereicht!
```

#### Option 2: Conversational
```
AI: Hallo! Wie kann ich dir helfen?
User: Ich möchte ein Konzert Event einreichen
AI: Toll! Wie heißt das Konzert?
User: Jazz Night am Fluss
AI: Schön! Wann findet "Jazz Night am Fluss" statt?
User: Am 20. Juni um 19 Uhr
AI: An welchem Ort findet das Event statt?
User: Am Spreeufer bei der Oberbaumbrücke
AI: Lass mich den Ort verifizieren...
    ✓ Ort bestätigt: Oberbaumbrücke, Berlin
    ...
```

## Technical Details

### AI Tools

The AI assistant has access to three tools:

1. **searchLocation**: Geocodes natural language locations
   - Input: Location query string
   - Output: Coordinates, place_id, formatted address
   - Uses Google Places Autocomplete + Details API

2. **extractFlyer**: Extracts info from uploaded images
   - Input: Base64 encoded image
   - Output: Structured event data
   - Uses GPT-4 Vision for OCR and understanding
   - Validates that image is actually an event flyer

3. **submitEvent**: Submits event to Supabase
   - Input: Complete event data + coordinates
   - Output: Success status + event ID
   - Validates required fields
   - Sets status to "pending" for review

### Schema Validation

Uses Zod for type-safe validation:
- **Required**: title, date, location, organizer_name, organizer_email
- **Optional**: description, time, end_time, category, etc.
- **Nullable fields**: Use `.nullable()` instead of `.optional()` for better LLM extraction

### Error Handling

- **Location not found**: Asks user for more specific address
- **Flyer extraction fails**: Falls back to conversational mode
- **Date in past**: Rejects and asks for future date
- **Missing fields**: Guides user to provide missing information
- **Database errors**: Shows friendly error message, logs details server-side

## Cost Considerations

### OpenAI API Costs (GPT-4o)
- Text conversation: ~$0.005 per event (typical)
- Flyer extraction: ~$0.01-0.02 per flyer (includes vision + text generation)
- Estimated: ~$0.02 per complete submission with flyer

### Google Maps API Costs
- Geocoding: $5 per 1,000 requests
- Places Autocomplete: $2.83 per 1,000 requests (sessionless)
- Estimated: ~$0.01 per location lookup

**Total estimated cost per AI-powered submission: ~$0.03**

## Limitations

1. **Language**: Primarily German, but understands English inputs
2. **Image formats**: Supports common formats (JPEG, PNG), max 5MB
3. **Flyer quality**: Low-quality or handwritten flyers may not extract well
4. **Location**: Currently optimized for German locations
5. **Rate limits**: Subject to OpenAI and Google Maps API rate limits

## Future Improvements

- [ ] Support for multiple event images
- [ ] Calendar file (.ics) generation
- [ ] Multi-language support (full English mode)
- [ ] Image quality enhancement before OCR
- [ ] Event recurrence support
- [ ] Integration with calendar systems
- [ ] Voice input support
- [ ] Batch event upload (multiple flyers at once)
- [ ] Event draft saving (resume later)
- [ ] Admin review interface with AI suggestions

## Troubleshooting

### Build errors
```bash
# Clean install if you encounter dependency issues
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
npm run build
```

### API errors
- Check that `OPENAI_API_KEY` is set correctly
- Verify OpenAI account has credits
- Ensure Google Maps APIs are enabled
- Check server logs for detailed error messages

### Chat not responding
- Open browser developer console (F12)
- Check Network tab for failed API requests
- Verify `/api/chat/event-submission` endpoint is accessible
- Check that streaming responses are not blocked

## Development

```bash
# Run development server
npm run dev

# Visit AI submission page
# http://localhost:3000/submit-ai

# Build for production
npm run build

# Start production server
npm start
```

## Security Notes

- API keys should never be committed to version control
- Use `.env.local` for local development
- Use Vercel environment variables for production
- Supabase Row Level Security (RLS) should be configured
- All events are set to "pending" status for admin review

## License

Same as the main DAO application.
