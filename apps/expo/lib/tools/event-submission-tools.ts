/**
 * Tool definitions and executors for AI Event Submission
 * Converts Zod schemas to Anthropic tool format and provides execution logic
 */

import { z } from "zod";
import type { AnthropicToolDefinition, ToolResult } from "../types/anthropic";
import { zodToToolInputSchema } from "../utils/zod-to-json-schema";
import { geocodeLocation } from "../utils/geocoding";
import { extractEventFromFlyer, isEventFlyer } from "../utils/flyer-extraction";
import { eventSchema, placeDataSchema } from "../schemas/event-schema";
import { supabase } from "../supabase";

// Tool input schemas
const searchLocationSchema = z.object({
  locationQuery: z.string().describe("The natural language location query from the user"),
});

const extractFlyerSchema = z.object({
  imageUrl: z.string().url().describe("Public URL of the uploaded image from Supabase storage"),
});

const submitEventSchema = z.object({
  eventData: eventSchema,
  coordinates: placeDataSchema,
  imageUrl: z.string().url().nullable(),
});

// Tool definitions in Anthropic format
export const eventSubmissionToolDefinitions: AnthropicToolDefinition[] = [
  {
    name: "searchLocation",
    description:
      "Search for a location and convert it to Google Maps coordinates. Always use this when the user provides a location.",
    input_schema: zodToToolInputSchema(searchLocationSchema),
  },
  {
    name: "extractFlyer",
    description:
      "Extract event information from an uploaded flyer or poster image. Use when user uploads an image and provides the Supabase URL.",
    input_schema: zodToToolInputSchema(extractFlyerSchema),
  },
  {
    name: "submitEvent",
    description:
      "Submit the event to the database. Only call this when ALL required fields are collected and the user has confirmed.",
    input_schema: zodToToolInputSchema(submitEventSchema),
  },
];

// Tool executor functions

export async function executeSearchLocation(input: z.infer<typeof searchLocationSchema>): Promise<ToolResult> {
  try {
    const { locationQuery } = input;
    console.log("Geocoding location:", locationQuery);

    const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!googleMapsApiKey) {
      throw new Error("Google Maps API key not configured");
    }

    const placeData = await geocodeLocation(locationQuery, googleMapsApiKey);

    if (!placeData) {
      return {
        success: false,
        data: {
          message: `Ich konnte den Ort "${locationQuery}" nicht finden. Kannst du bitte eine genauere Adresse angeben? Zum Beispiel mit Straße und Stadt, oder den vollständigen Namen des Veranstaltungsorts.`,
        },
        error: "Location not found",
      };
    }

    console.log("Location verified:", placeData.formatted_address);

    return {
      success: true,
      data: {
        message: `✓ Ort bestätigt: ${placeData.formatted_address}`,
        location: placeData.formatted_address,
        coordinates: {
          latitude: placeData.latitude,
          longitude: placeData.longitude,
          place_id: placeData.place_id,
          formatted_address: placeData.formatted_address,
          address_components: placeData.address_components,
        },
      },
    };
  } catch (error) {
    console.error("Location search error:", error);
    return {
      success: false,
      data: {
        message:
          "Es gab ein Problem beim Suchen des Ortes. Bitte versuche es mit einer anderen Formulierung oder gib eine vollständige Adresse an.",
      },
      error: String(error),
    };
  }
}

export async function executeExtractFlyer(input: z.infer<typeof extractFlyerSchema>): Promise<ToolResult> {
  try {
    const { imageUrl } = input;
    console.log("Extracting flyer information from URL:", imageUrl);

    const anthropicApiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      throw new Error("Anthropic API key not configured");
    }

    // Check if it's actually a flyer using Claude Vision
    const isFlyer = await isEventFlyer(imageUrl, anthropicApiKey);

    if (!isFlyer) {
      return {
        success: false,
        data: {
          message:
            "Dieses Bild scheint kein Event-Flyer zu sein. Bitte lade einen Event-Poster hoch oder gib die Informationen im Gespräch an.",
        },
      };
    }

    // Extract information using Claude Vision
    const extractedData = await extractEventFromFlyer(imageUrl, anthropicApiKey);

    if (!extractedData) {
      return {
        success: false,
        data: {
          message:
            "Konnte die Informationen vom Flyer nicht extrahieren. Lass uns die Informationen stattdessen im Gespräch sammeln.",
        },
      };
    }

    // Count how many fields were extracted
    const extractedFields = Object.keys(extractedData).filter(
      (key) => extractedData[key as keyof typeof extractedData] != null
    );

    return {
      success: true,
      data: {
        message: `Flyer-Extraktion erfolgreich! Extrahierte Felder: ${extractedFields.join(", ")}. WICHTIG: Du MUSST jetzt eine Zusammenfassung schreiben und nach fehlenden Pflichtfeldern fragen!`,
        extractedData,
        extractedFields,
        instruction:
          "Schreibe JETZT eine Nachricht an den Nutzer mit der Zusammenfassung der extrahierten Daten und frage nach fehlenden Pflichtfeldern wie Veranstalter-Name und E-Mail.",
      },
    };
  } catch (error) {
    console.error("Flyer extraction error:", error);
    return {
      success: false,
      data: {
        message:
          "Fehler beim Verarbeiten des Bildes. Bitte versuche es mit einem anderen Bild oder gib die Informationen im Gespräch an.",
      },
      error: String(error),
    };
  }
}

export async function executeSubmitEvent(input: z.infer<typeof submitEventSchema>): Promise<ToolResult> {
  try {
    const { eventData, coordinates, imageUrl } = input;
    console.log("Submitting event:", eventData.title);

    // Validate date is in the future
    const eventDate = new Date(eventData.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (eventDate < today) {
      return {
        success: false,
        data: {
          message: "Event-Datum kann nicht in der Vergangenheit liegen. Bitte gib ein zukünftiges Datum an.",
        },
      };
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
    };

    // Insert into database
    const { data, error } = await supabase
      .from("events")
      .insert([submissionData])
      .select()
      .single();

    if (error) {
      console.error("Database submission error:", error);
      return {
        success: false,
        data: {
          message: "Fehler beim Einreichen des Events in die Datenbank. Bitte versuche es erneut.",
        },
        error: error.message,
      };
    }

    console.log("Event submitted successfully:", data.id);

    return {
      success: true,
      data: {
        message: "Event erfolgreich zur Überprüfung eingereicht!",
        eventId: data.id,
      },
    };
  } catch (error) {
    console.error("Event submission error:", error);
    return {
      success: false,
      data: {
        message: "Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.",
      },
      error: String(error),
    };
  }
}

// Tool executor map
export const eventSubmissionToolExecutors = {
  searchLocation: executeSearchLocation,
  extractFlyer: executeExtractFlyer,
  submitEvent: executeSubmitEvent,
};

// Helper function to execute any tool by name
export async function executeToolByName(toolName: string, input: any): Promise<ToolResult> {
  const executor = eventSubmissionToolExecutors[toolName as keyof typeof eventSubmissionToolExecutors];

  if (!executor) {
    return {
      success: false,
      error: `Unknown tool: ${toolName}`,
      errorType: "UnknownTool",
    };
  }

  try {
    const result = await executor(input);
    return result;
  } catch (error) {
    console.error(`Tool ${toolName} execution failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.name : "UnknownError",
    };
  }
}
