// apps/web/src/lib/event-radio/scripts.ts
// Claude writes the spoken scripts. Same stack as lib/newsletter/generate.ts.
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { PublicEvent } from "./hash";
import { buildEventSegmentsPrompt, buildIntroPrompt, buildOutroPrompt } from "./prompts";

export const SCRIPT_MODEL = "claude-opus-5";

const singleScriptSchema = z.object({
  script: z.string().describe("Der gesprochene Text, reine Prosa"),
});

const segmentsSchema = z.object({
  segments: z.array(
    z.object({
      event_id: z.string().describe("Unveränderte event_id aus den Daten"),
      script: z.string().describe("Der gesprochene Beitrag, 45 bis 70 Wörter"),
    }),
  ),
});

function clean(script: string): string {
  // Belt and braces: strip dash asides the prompt already forbids.
  return script.replace(/\s*[—–]\s*/g, ", ").replace(/\s+/g, " ").trim();
}

export async function writeIntro(events: PublicEvent[], todayKey: string): Promise<string> {
  const { object } = await generateObject({
    model: anthropic(SCRIPT_MODEL),
    schema: singleScriptSchema,
    prompt: buildIntroPrompt(events, todayKey),
    maxOutputTokens: 2000,
  });
  return clean(object.script);
}

export async function writeOutro(): Promise<string> {
  const { object } = await generateObject({
    model: anthropic(SCRIPT_MODEL),
    schema: singleScriptSchema,
    prompt: buildOutroPrompt(),
    maxOutputTokens: 1000,
  });
  return clean(object.script);
}

/** Map event id to script. Throws when any requested id is missing. */
export async function writeEventSegments(events: PublicEvent[]): Promise<Map<string, string>> {
  if (events.length === 0) return new Map();
  const { object } = await generateObject({
    model: anthropic(SCRIPT_MODEL),
    schema: segmentsSchema,
    prompt: buildEventSegmentsPrompt(events),
    maxOutputTokens: 6000,
  });
  const map = new Map<string, string>();
  for (const s of object.segments) map.set(s.event_id, clean(s.script));
  for (const ev of events) {
    if (!map.get(ev.id)) throw new Error(`Skript fehlt für Veranstaltung ${ev.id} (${ev.title})`);
  }
  return map;
}
