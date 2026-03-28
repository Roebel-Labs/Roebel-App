import { openai } from "@ai-sdk/openai"
import { generateObject } from "ai"
import { eventSchema } from "@/lib/schemas/event-schema"
import { z } from "zod"

/**
 * Extract event information from an uploaded flyer image using GPT-4 Vision
 *
 * @param imageUrl - Public URL of the uploaded image (from Supabase storage)
 * @returns Extracted event data or null if extraction fails
 */
// Define the flyer extraction schema outside function for type inference
const flyerExtractionSchema = eventSchema.extend({
  // Override required fields to accept null when not found in flyer
  organizer_name: z.string().min(2).nullable(),
  organizer_email: z.string().email().nullable(),
}).partial()

export async function extractEventFromFlyer(
  imageUrl: string
): Promise<z.infer<typeof flyerExtractionSchema> | null> {
  try {
    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      console.error("OpenAI API key is not configured")
      return null
    }

    const result = await generateObject({
      model: openai("gpt-4o"),
      schema: flyerExtractionSchema,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are an expert at extracting information from event flyers and posters.

Analyze this image and extract ALL event information you can find. Look for:

1. **Event Title**: The main headline or name of the event
2. **Date**: Any date mentioned (convert to YYYY-MM-DD format). Today's date is ${new Date().toISOString().split("T")[0]}
3. **Time**: Start time (convert to HH:MM 24-hour format)
4. **End Time**: End time if mentioned (convert to HH:MM 24-hour format)
5. **Location**: Venue name, address, or location mentioned
6. **Description**: Any descriptive text about what the event is about
7. **Organizer Name**: Who is organizing or hosting the event
8. **Organizer Email**: Contact email if present
9. **Organizer Phone**: Contact phone number if present
10. **Category**: What type of event is this? (Musik, Sport, Kultur, Bildung, Familie, Essen & Trinken, Natur, Gesundheit, Technologie, Sonstiges)
11. **Website**: Any URLs or web addresses mentioned
12. **Ticket Price**: Price information (extract number only, use 0 for "free" or "kostenlos")
13. **Max Attendees**: Any mention of capacity or attendee limits

**Important extraction rules:**
- For dates: Convert German month names (Januar, Februar, März, etc.) to YYYY-MM-DD format
- For times: Convert to 24-hour format (e.g., "7:00 PM" → "19:00")
- For prices: Extract only the numeric value in Euros
- For categories: Choose the most fitting category from the list
- If information is not present or unclear, return null for that field
- Do not make up or hallucinate information
- Extract text exactly as it appears (preserve German umlauts, special characters)

Return only the structured data. Be thorough and extract everything visible.`,
            },
            {
              type: "image",
              image: imageUrl,
            },
          ],
        },
      ],
    })

    // Validate the extracted data
    if (!result || !result.object) {
      console.warn("Failed to extract data from flyer")
      return null
    }

    const extractedData = result.object

    // Log what was extracted for debugging
    console.log("Extracted flyer data:", {
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
    console.error("Flyer extraction error:", error)
    return null
  }
}

/**
 * Determine if an uploaded image looks like an event flyer
 * Uses GPT-4 Vision to classify the image
 *
 * @param imageUrl - Public URL of the uploaded image (from Supabase storage)
 * @returns true if image appears to be an event flyer
 */
export async function isEventFlyer(
  imageUrl: string
): Promise<boolean> {
  try {
    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      console.error("OpenAI API key is not configured")
      return false
    }

    // Simple yes/no classification using Zod schema
    const flyerClassificationSchema = z.object({
      isFlyer: z.boolean().describe("True if the image appears to be an event flyer"),
      confidence: z.number().min(0).max(1).describe("Confidence score between 0 and 1"),
      reason: z.string().describe("Brief explanation of the decision"),
    })

    const result = await generateObject({
      model: openai("gpt-4o"),
      schema: flyerClassificationSchema,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this image and determine if it's an event flyer, poster, or announcement.

An event flyer typically contains:
- Event title or headline
- Date and/or time information
- Location or venue
- Descriptive text about an event
- Contact information
- Visual design promoting an event

Return:
- isFlyer: true if this looks like an event flyer/poster, false otherwise
- confidence: 0-1 score of how confident you are
- reason: Brief explanation of your decision

Be lenient - even informal or hand-made flyers should return true.`,
            },
            {
              type: "image",
              image: imageUrl,
            },
          ],
        },
      ],
    })

    const classification = result.object
    console.log("Flyer classification:", classification)

    return classification.isFlyer && classification.confidence > 0.5
  } catch (error) {
    console.error("Flyer classification error:", error)
    return false
  }
}

/**
 * Convert File to base64 data URL for API transmission
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = (error) => reject(error)
  })
}
