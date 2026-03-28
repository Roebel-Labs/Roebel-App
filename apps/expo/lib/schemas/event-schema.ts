import { z } from "zod"

/**
 * Zod schema for event submission data
 * Matches the Supabase events table structure
 * Uses .nullable() instead of .optional() for better LLM extraction
 */
export const eventSchemaBase = z.object({
  // Required fields
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title must be less than 200 characters")
    .describe("The event title. Should be clear and concise."),

  // Single date (for non-recurring events)
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .describe(
      `Event date in YYYY-MM-DD format. Today's date is ${new Date().toISOString().split("T")[0]}. Event must be in the future.`
    ),

  // Multiple dates (for recurring events)
  dates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Each date must be in YYYY-MM-DD format"))
    .optional()
    .describe(
      "Array of dates in YYYY-MM-DD format for recurring events. Use this when an event happens on multiple specific dates."
    ),

  // Whether this is a recurring event
  is_recurring: z
    .boolean()
    .optional()
    .default(false)
    .describe("Set to true if the event occurs on multiple dates."),

  location: z
    .string()
    .min(3, "Location must be at least 3 characters")
    .describe("The event location or venue name. Will be geocoded to coordinates."),

  organizer_name: z
    .string()
    .min(2, "Organizer name must be at least 2 characters")
    .describe("Full name of the event organizer or contact person."),

  organizer_email: z
    .string()
    .email("Must be a valid email address")
    .describe("Contact email address for the event organizer."),

  // Optional fields - use optional().nullable() to accept both undefined and null
  description: z
    .string()
    .optional()
    .nullable()
    .describe("Detailed description of the event. What will happen? Who should attend?"),

  time: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Time must be in HH:MM format")
    .optional()
    .nullable()
    .describe("Event start time in HH:MM format (24-hour, e.g., 14:00 for 2:00 PM)."),

  end_time: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "End time must be in HH:MM format")
    .optional()
    .nullable()
    .describe("Event end time in HH:MM format (24-hour). Must be after start time."),

  organizer_phone: z
    .string()
    .optional()
    .nullable()
    .describe("Contact phone number for the event organizer (optional)."),

  category: z
    .enum([
      "Musik",
      "Kultur",
      "Sport",
      "Fest",
      "Natur",
      "Mittelalter",
      "Lesung",
      "Sonstiges",
    ])
    .optional()
    .nullable()
    .describe(
      "Event category. Choose the most appropriate category from the provided options."
    ),

  website_url: z
    .string()
    .url("Must be a valid URL")
    .optional()
    .nullable()
    .describe("Official website or event page URL (optional)."),

  ticket_price: z
    .number()
    .min(0, "Price cannot be negative")
    .optional()
    .nullable()
    .describe("Ticket price in Euros. Use 0 for free events. Null if price is not mentioned."),

  max_attendees: z
    .number()
    .int("Must be a whole number")
    .min(1, "Must be at least 1 attendee")
    .optional()
    .nullable()
    .describe(
      "Maximum number of attendees allowed. Null for unlimited capacity."
    ),

  // Image - will be handled separately via upload
  image_url: z
    .string()
    .url()
    .optional()
    .nullable()
    .describe("URL of the uploaded event image or flyer."),
})

export const eventSchema = eventSchemaBase.refine(
  (data) => data.date || (data.dates && data.dates.length > 0),
  {
    message: "Either 'date' (for single event) or 'dates' (for recurring event) must be provided",
    path: ["date"],
  }
)

/**
 * Schema for geographical data from Google Places API
 */
export const placeDataSchema = z.object({
  latitude: z.number().describe("Latitude coordinate"),
  longitude: z.number().describe("Longitude coordinate"),
  place_id: z.string().describe("Google Places ID"),
  formatted_address: z.string().describe("Full formatted address from Google"),
  address_components: z
    .array(
      z.object({
        long_name: z.string(),
        short_name: z.string(),
        types: z.array(z.string()),
      })
    )
    .describe("Structured address components from Google Places"),
})

/**
 * Combined schema including geographical data
 */
export const fullEventSchema = eventSchemaBase.extend({
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  place_id: z.string().nullable(),
  formatted_address: z.string().nullable(),
  address_components: z.any().nullable(),
  status: z.enum(["pending", "approved", "rejected"]).default("pending"),
  is_recurring: z.boolean().default(false),
})

export type EventData = z.infer<typeof eventSchema>
export type PlaceData = z.infer<typeof placeDataSchema>
export type FullEventData = z.infer<typeof fullEventSchema>
