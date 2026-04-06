import { eventSchemaBase } from "@/lib/schemas/event-schema"
import { z } from "zod"
import * as FileSystem from 'expo-file-system/legacy'
import { compressImageForVisionAPI } from './image-compression'

/**
 * Convert image URL to base64 for Claude Vision API
 * Uses expo-file-system for React Native compatibility
 */
export async function imageUrlToBase64(
  imageUrl: string
): Promise<{ base64: string; mediaType: string } | null> {
  try {
    let base64: string
    let mediaType = 'image/jpeg'  // default
    let imageToConvert = imageUrl

    // Check if it's a local file URI (from image picker)
    if (imageUrl.startsWith('file://')) {
      console.log('Converting local file to base64:', imageUrl)

      // Compress image first to ensure it's under 5 MB
      console.log('Compressing image for Vision API...')
      imageToConvert = await compressImageForVisionAPI(imageUrl)
      console.log('Using compressed image:', imageToConvert)

      base64 = await FileSystem.readAsStringAsync(imageToConvert, {
        encoding: FileSystem.EncodingType.Base64,
      })

      // Compression always outputs JPEG format (see image-compression.ts SaveFormat.JPEG)
      // so mediaType stays as 'image/jpeg' regardless of original file extension
    }
    // Remote URL (from Supabase Storage)
    else {
      console.log('Downloading and converting remote URL to base64:', imageUrl)

      // Download to cache directory first
      const fileUri = `${FileSystem.cacheDirectory}temp_flyer_${Date.now()}.jpg`
      const downloadResult = await FileSystem.downloadAsync(imageUrl, fileUri)

      if (!downloadResult || downloadResult.status !== 200) {
        console.error('Failed to download image:', downloadResult?.status)
        return null
      }

      // Compress downloaded image
      console.log('Compressing downloaded image for Vision API...')
      imageToConvert = await compressImageForVisionAPI(fileUri)

      // Convert compressed file to base64
      base64 = await FileSystem.readAsStringAsync(imageToConvert, {
        encoding: FileSystem.EncodingType.Base64,
      })

      // Compression always outputs JPEG format (see image-compression.ts SaveFormat.JPEG)
      // so mediaType stays as 'image/jpeg' regardless of original URL extension

      // Clean up temp files
      await FileSystem.deleteAsync(fileUri, { idempotent: true })
      if (imageToConvert !== fileUri) {
        await FileSystem.deleteAsync(imageToConvert, { idempotent: true })
      }
    }

    // Validate base64 is not empty
    if (!base64 || base64.length === 0) {
      console.error('Base64 conversion resulted in empty string')
      return null
    }

    console.log(`Base64 conversion successful: ${base64.length} characters, type: ${mediaType}`)

    // Validate size is under 5 MB
    const sizeInMB = (base64.length / 1024 / 1024).toFixed(2)
    console.log(`Base64 size: ${sizeInMB} MB`)

    if (base64.length > 5242880) {
      console.error(`Base64 size ${sizeInMB} MB exceeds 5 MB limit`)
      return null
    }

    return { base64, mediaType }

  } catch (error) {
    console.error('Error converting image to base64:', error)
    return null
  }
}

/**
 * Extract event information from an uploaded flyer image using Claude Vision
 *
 * @param imageUrl - Public URL of the uploaded image (from Supabase storage)
 * @param apiKey - Anthropic API key
 * @returns Extracted event data or null if extraction fails
 */
// Define the flyer extraction schema outside function for type inference
const flyerExtractionSchema = eventSchemaBase.extend({
  // Override required fields to accept null when not found in flyer
  organizer_name: z.string().min(2).nullable(),
  organizer_email: z.string().email().nullable(),
}).partial()

export async function extractEventFromFlyer(
  imageUrl: string,
  apiKey: string
): Promise<z.infer<typeof flyerExtractionSchema> | null> {
  try {
    if (!apiKey) {
      console.error("Anthropic API key is not configured")
      return null
    }

    // Convert image URL to base64
    const imageData = await imageUrlToBase64(imageUrl)
    if (!imageData) {
      console.error("Failed to convert image to base64")
      return null
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Du bist ein Experte darin, Informationen aus Event-Flyern und -Postern zu extrahieren.

Analysiere dieses Bild und extrahiere ALLE Event-Informationen, die du finden kannst. Suche nach:

1. **Event-Titel**: Die Hauptüberschrift oder der Name des Events
2. **Datum**: Jedes erwähnte Datum (konvertiere ins Format JJJJ-MM-TT). Heutiges Datum: ${new Date().toISOString().split("T")[0]}
3. **Zeit**: Startzeit (konvertiere ins 24-Stunden-Format HH:MM)
4. **Endzeit**: Endzeit falls erwähnt (konvertiere ins 24-Stunden-Format HH:MM)
5. **Ort**: Veranstaltungsort, Adresse oder erwähnter Standort
6. **Beschreibung**: Jeder beschreibende Text über das Event
7. **Veranstalter-Name**: Wer organisiert oder hostet das Event
8. **Veranstalter-E-Mail**: Kontakt-E-Mail falls vorhanden
9. **Veranstalter-Telefon**: Kontakt-Telefonnummer falls vorhanden
10. **Kategorie**: Welche Art von Event ist das? (Musik, Sport, Kultur, Bildung, Familie, Essen & Trinken, Natur, Gesundheit, Technologie, Sonstiges)
11. **Website**: Jede URL oder Webadresse
12. **Ticketpreis**: Preisinformationen (extrahiere nur die Zahl, verwende 0 für "kostenlos" oder "gratis")
13. **Max. Teilnehmer**: Jede Erwähnung von Kapazität oder Teilnehmerbegrenzung

**Wichtige Extraktionsregeln:**
- Für Datumsangaben: Konvertiere deutsche Monatsnamen (Januar, Februar, März, etc.) ins Format JJJJ-MM-TT. Wir haben das Jahr 2026.
- Für Zeiten: Konvertiere ins 24-Stunden-Format (z.B. "19:00 Uhr" → "19:00")
- Für Preise: Extrahiere nur den numerischen Wert in Euro
- Für Kategorien: Wähle die passendste Kategorie aus der Liste
- Wenn Informationen nicht vorhanden oder unklar sind, gib null für dieses Feld zurück
- Erfinde keine Informationen
- Extrahiere Text exakt wie er erscheint (behalte deutsche Umlaute, Sonderzeichen)

Gib die Antwort als JSON-Objekt zurück mit diesen Feldern:
{
  "title": string | null,
  "date": string | null,
  "time": string | null,
  "end_time": string | null,
  "location": string | null,
  "description": string | null,
  "organizer_name": string | null,
  "organizer_email": string | null,
  "organizer_phone": string | null,
  "category": string | null,
  "website_url": string | null,
  "ticket_price": number | null,
  "max_attendees": number | null
}

Sei gründlich und extrahiere alles Sichtbare.`,
              },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: imageData.mediaType,
                  data: imageData.base64,
                },
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error("Claude Vision API error:", response.status, response.statusText, errorBody)
      return null
    }

    const result = await response.json()

    // Extract text from Claude's response
    const textContent = result.content?.find((block: any) => block.type === "text")?.text
    if (!textContent) {
      console.warn("No text content in Claude response")
      return null
    }

    // Parse JSON from response (Claude may wrap it in markdown code blocks)
    const jsonMatch = textContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
                      textContent.match(/(\{[\s\S]*?\})/)

    if (!jsonMatch) {
      console.warn("Could not extract JSON from Claude response")
      return null
    }

    const extractedData = JSON.parse(jsonMatch[1])

    // Log what was extracted for debugging
    console.log("Extracted flyer data (Claude Vision):", {
      hasTitle: !!extractedData.title,
      hasDate: !!extractedData.date,
      hasLocation: !!extractedData.location,
      hasOrganizer: !!extractedData.organizer_name,
      fieldsExtracted: Object.keys(extractedData).filter(
        (key) => extractedData[key as keyof typeof extractedData] != null
      ),
    })

    return extractedData
  } catch (error) {
    console.error("Flyer extraction error (Claude Vision):", error)
    return null
  }
}

/**
 * Determine if an uploaded image looks like an event flyer
 * Uses Claude Vision to classify the image
 *
 * @param imageUrl - Public URL of the uploaded image (from Supabase storage)
 * @param apiKey - Anthropic API key
 * @returns true if image appears to be an event flyer
 */
export async function isEventFlyer(
  imageUrl: string,
  apiKey: string
): Promise<boolean> {
  try {
    if (!apiKey) {
      console.error("Anthropic API key is not configured")
      return false
    }

    // Convert image URL to base64
    const imageData = await imageUrlToBase64(imageUrl)
    if (!imageData) {
      console.error("Failed to convert image to base64")
      return false
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analysiere dieses Bild und bestimme, ob es ein Event-Flyer, Poster oder eine Ankündigung ist.

Ein Event-Flyer enthält typischerweise:
- Event-Titel oder Überschrift
- Datum und/oder Zeit-Informationen
- Ort oder Veranstaltungsort
- Beschreibenden Text über ein Event
- Kontaktinformationen
- Visuelles Design zur Bewerbung eines Events

Gib die Antwort als JSON zurück:
{
  "isFlyer": true/false,
  "confidence": 0.0-1.0,
  "reason": "Kurze Erklärung"
}

Sei nachsichtig - auch informelle oder handgemachte Flyer sollten isFlyer: true bekommen.`,
              },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: imageData.mediaType,
                  data: imageData.base64,
                },
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error("Claude Vision API error (isEventFlyer):", response.status, response.statusText, errorBody)
      return false
    }

    const result = await response.json()

    // Extract text from Claude's response
    const textContent = result.content?.find((block: any) => block.type === "text")?.text
    if (!textContent) {
      console.warn("No text content in Claude response")
      return false
    }

    // Parse JSON from response
    const jsonMatch = textContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
                      textContent.match(/(\{[\s\S]*?\})/)

    if (!jsonMatch) {
      console.warn("Could not extract JSON from Claude response")
      return false
    }

    const classification = JSON.parse(jsonMatch[1])
    console.log("Flyer classification (Claude Vision):", classification)

    return classification.isFlyer && classification.confidence > 0.5
  } catch (error) {
    console.error("Flyer classification error (Claude Vision):", error)
    return false
  }
}
