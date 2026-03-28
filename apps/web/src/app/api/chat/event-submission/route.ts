import { openai } from "@ai-sdk/openai"
import { streamText, stepCountIs } from "ai"
import { z } from "zod"
import { geocodeLocation } from "@/lib/utils/geocoding"
import { extractEventFromFlyer, isEventFlyer } from "@/lib/utils/flyer-extraction"
import { eventSchema } from "@/lib/schemas/event-schema"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const { messages } = await req.json()

    const result = streamText({
      model: openai("gpt-4o"),
      messages,
      stopWhen: stepCountIs(5),  // Enable multi-step: tool execution + AI text response
      system: `Du bist ein freundlicher KI-Assistent, der Nutzern hilft, Events auf einer Community-Event-Plattform einzureichen.

Deine Aufgaben:
1. Sammle alle erforderlichen Event-Informationen durch natürliche Konversation (auf Deutsch!)
2. Extrahiere Informationen aus hochgeladenen Flyern/Bildern, falls vorhanden
3. Konvertiere natürliche Ortsbeschreibungen in verifizierte Google Maps Koordinaten
4. Stelle sicher, dass alle Daten vollständig und gültig sind vor der Einreichung

Erforderliche Informationen:
- Event-Titel
- Event-Datum (muss in der Zukunft liegen)
- Ort (wird geocodiert)
- Name des Veranstalters
- E-Mail des Veranstalters

Optionale Informationen:
- Event-Beschreibung
- Startzeit und Endzeit
- Telefonnummer des Veranstalters
- Kategorie (z.B. Musik, Sport, Kultur, Bildung, Familie, etc.)
- Website-URL
- Ticketpreis
- Maximale Teilnehmerzahl
- Event-Bild (empfohlen! Frage IMMER danach bei manueller Eingabe)

Gesprächsführung:
- Sei gesprächig und freundlich, nicht roboterhaft
- Stelle Fragen einzeln, überfordere den Nutzer nicht
- **KRITISCH - FLYER-EXTRAKTION**: Wenn die Nachricht "[Analysiere diesen Event-Flyer..." enthält:
  1. Rufe das extractFlyer Tool auf
  2. SOFORT nachdem das Tool fertig ist, MUSST du eine Textnachricht schreiben!
  3. Fasse die extrahierten Informationen zusammen (z.B. "Ich habe folgende Informationen vom Flyer extrahiert: Titel, Datum, Ort...")
  4. Frage gezielt nach den fehlenden Pflichtfeldern (besonders Veranstalter-Name und E-Mail)
  5. NIEMALS einfach nur das Tool aufrufen und dann schweigen!
- **MANUELLE EINGABE MIT BILD**: Wenn die Nachricht "[Ich habe ein Event-Bild hochgeladen..." enthält:
  1. Bestätige den Bild-Upload freundlich
  2. Speichere die Bild-URL für die spätere Einreichung
  3. Fahre mit dem Sammeln der fehlenden Informationen fort
  4. Beim submitEvent-Aufruf MUSST du die gespeicherte Bild-URL im imageUrl-Parameter mitgeben!
- **MANUELLE EINGABE OHNE BILD**: Wenn der Nutzer "Informationen selbst eingeben" wählt:
  1. Sammle die Pflichtinformationen (Titel, Datum, Ort, Veranstalter-Name, E-Mail)
  2. Nach den Pflichtfeldern: FRAGE IMMER "Möchtest du auch ein Event-Bild hochladen? Das macht dein Event attraktiver!"
  3. Wenn ja: Sage "Du kannst jetzt über den Upload-Button ein Bild hochladen"
  4. Wenn nein oder Bild hochgeladen: Fahre mit optionalen Feldern fort
- Bestätige den Ort immer mit dem searchLocation Tool
- **KRITISCH**: Nach der Verwendung JEDES Tools (besonders searchLocation und extractFlyer) MUSST du dem Nutzer antworten! Bestätige das Ergebnis und frage nach der nächsten fehlenden Information. Kehre NIEMALS zurück ohne eine Antwort zu geben.
- Zeige Fortschritt (z.B. "Super! Ich habe jetzt 5 von 8 Feldern")
- Wenn der Nutzer vage Datumsangaben macht wie "nächsten Freitag", berechne das tatsächliche Datum
- Bei Orten sei hilfreich: "Rathaus" → suche und bestätige "Rathaus, Berlin" etc.

**WICHTIGER ABLAUF VOR EINREICHUNG**:
1. Wenn du ALLE Pflichtfelder gesammelt hast, präsentiere eine ÜBERSICHT:
   - Zeige alle gesammelten Pflichtinformationen
   - Liste die optionalen Felder auf, die NOCH NICHT ausgefüllt sind
   - Frage explizit: "Möchtest du das Event jetzt einreichen, oder möchtest du noch optionale Informationen hinzufügen (z.B. Beschreibung, Startzeit, Kategorie, etc.)?"
2. Warte auf Nutzerbestätigung
3. Wenn der Nutzer zusätzliche Informationen hinzufügen möchte, frage gezielt danach
4. NUR wenn der Nutzer explizit bestätigt "einreichen" oder "absenden", rufe submitEvent auf

WICHTIG:
- Antworte IMMER auf Deutsch! Die Nutzer sprechen Deutsch.
- Reiche das Event NICHT automatisch ein - warte IMMER auf Bestätigung!
- Nach Tool-Verwendung IMMER eine Textnachricht an den Nutzer senden!

Heutiges Datum: ${new Date().toISOString().split("T")[0]}`,

      tools: {
        // Search and geocode location
        searchLocation: {
          description:
            "Search for a location and convert it to Google Maps coordinates. Always use this when the user provides a location.",
          inputSchema: z.object({
            locationQuery: z
              .string()
              .describe("The natural language location query from the user"),
          }),
          execute: async ({ locationQuery }: { locationQuery: string }) => {
            try {
              console.log("Geocoding location:", locationQuery)

              const placeData = await geocodeLocation(locationQuery)

              if (!placeData) {
                return {
                  success: false,
                  message: `Ich konnte den Ort "${locationQuery}" nicht finden. Kannst du bitte eine genauere Adresse angeben? Zum Beispiel mit Straße und Stadt, oder den vollständigen Namen des Veranstaltungsorts.`,
                  error: "Location not found",
                }
              }

              console.log("Location verified:", placeData.formatted_address)

              return {
                success: true,
                message: `✓ Ort bestätigt: ${placeData.formatted_address}`,
                location: placeData.formatted_address,
                coordinates: {
                  latitude: placeData.latitude,
                  longitude: placeData.longitude,
                  place_id: placeData.place_id,
                  formatted_address: placeData.formatted_address,
                  address_components: placeData.address_components,
                },
              }
            } catch (error) {
              console.error("Location search error:", error)
              return {
                success: false,
                message: `Es gab ein Problem beim Suchen des Ortes. Bitte versuche es mit einer anderen Formulierung oder gib eine vollständige Adresse an.`,
                error: String(error),
              }
            }
          },
        },

        // Extract flyer information
        extractFlyer: {
          description:
            "Extract event information from an uploaded flyer or poster image. Use when user uploads an image and provides the Supabase URL.",
          inputSchema: z.object({
            imageUrl: z
              .string()
              .url()
              .describe("Public URL of the uploaded image from Supabase storage"),
          }),
          execute: async ({ imageUrl }: { imageUrl: string }) => {
            console.log("Extracting flyer information from URL:", imageUrl)

            // Check if it's actually a flyer
            const isFlyer = await isEventFlyer(imageUrl)

            if (!isFlyer) {
              return {
                success: false,
                message:
                  "This image doesn't appear to be an event flyer. Please upload an event poster or provide information through conversation.",
              }
            }

            // Extract information
            const extractedData = await extractEventFromFlyer(imageUrl)

            if (!extractedData) {
              return {
                success: false,
                message:
                  "Could not extract information from the flyer. Let's gather the information through conversation instead.",
              }
            }

            // Count how many fields were extracted
            const extractedFields = Object.keys(extractedData).filter(
              (key) => extractedData[key as keyof typeof extractedData] != null
            )

            return {
              success: true,
              message: `Flyer-Extraktion erfolgreich! Extrahierte Felder: ${extractedFields.join(", ")}. WICHTIG: Du MUSST jetzt eine Zusammenfassung schreiben und nach fehlenden Pflichtfeldern fragen!`,
              extractedData,
              extractedFields,
              instruction: "Schreibe JETZT eine Nachricht an den Nutzer mit der Zusammenfassung der extrahierten Daten und frage nach fehlenden Pflichtfeldern wie Veranstalter-Name und E-Mail.",
            }
          },
        },

        // Submit event to database
        submitEvent: {
          description:
            "Submit the event to the database. Only call this when ALL required fields are collected and the user has confirmed.",
          inputSchema: z.object({
            eventData: eventSchema,
            coordinates: z.object({
              latitude: z.number(),
              longitude: z.number(),
              place_id: z.string(),
              formatted_address: z.string(),
              address_components: z.any(),
            }),
            imageUrl: z.string().url().nullable(),
          }),
          execute: async ({ eventData, coordinates, imageUrl }: { eventData: any; coordinates: any; imageUrl: string | null }) => {
            try {
              console.log("Submitting event:", eventData.title)

              const supabase = await createClient()

              // Validate date is in the future
              const eventDate = new Date(eventData.date)
              const today = new Date()
              today.setHours(0, 0, 0, 0)

              if (eventDate < today) {
                return {
                  success: false,
                  message: "Event date cannot be in the past. Please provide a future date.",
                }
              }

              // Prepare data for submission
              const submissionData = {
                ...eventData,
                latitude: coordinates.latitude,
                longitude: coordinates.longitude,
                place_id: coordinates.place_id,
                formatted_address: coordinates.formatted_address,
                address_components: coordinates.address_components,
                image_url: imageUrl,
                status: "pending" as const,
              }

              // Insert into database
              const { data, error } = await supabase
                .from("events")
                .insert([submissionData])
                .select()
                .single()

              if (error) {
                console.error("Database submission error:", error)
                return {
                  success: false,
                  message: "Failed to submit event to database. Please try again.",
                  error: error.message,
                }
              }

              console.log("Event submitted successfully:", data.id)

              return {
                success: true,
                message: "Event successfully submitted for review!",
                eventId: data.id,
              }
            } catch (error) {
              console.error("Event submission error:", error)
              return {
                success: false,
                message: "An unexpected error occurred. Please try again.",
              }
            }
          },
        },
      },
    })

    return result.toTextStreamResponse()
  } catch (error) {
    console.error("API route error:", error)
    return new Response("Internal server error", { status: 500 })
  }
}
