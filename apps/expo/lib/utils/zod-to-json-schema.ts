/**
 * Convert Zod schemas to JSON Schema format for Anthropic tool definitions
 * Uses Zod v4's built-in toJSONSchema()
 */

import { z } from "zod";

/**
 * Convert a Zod object schema to Anthropic tool input schema format
 */
export function zodToToolInputSchema(schema: z.ZodObject<any>): {
  type: "object";
  properties: Record<string, any>;
  required?: string[];
} {
  const jsonSchema = z.toJSONSchema(schema) as any;

  return {
    type: "object",
    properties: jsonSchema.properties || {},
    ...(jsonSchema.required && jsonSchema.required.length > 0
      ? { required: jsonSchema.required }
      : {}),
  };
}
