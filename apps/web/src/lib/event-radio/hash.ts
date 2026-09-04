// apps/web/src/lib/event-radio/hash.ts
// Content addressing for narration clips. Bump PROMPT_VERSION whenever the
// prompts in prompts.ts change in a way that should re-render every clip.
import { createHash } from "node:crypto";

export const PROMPT_VERSION = 1;

/** The only event fields that ever leave the database (spec section 6.1). */
export type PublicEvent = {
  id: string;
  title: string;
  description: string | null;
  date: string;
  time: string | null;
  end_time: string | null;
  location: string | null;
  organizer_name: string | null;
  category: string | null;
  ticket_price: number | null;
  website_url: string | null;
  is_cancelled: boolean;
};

// speed belongs here: changing the tempo must re-render every clip.
export type HashContext = { voiceId: string; modelId: string; speed: number };

function str(row: Record<string, unknown>, key: string): string | null {
  const v = row[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(row: Record<string, unknown>, key: string): number | null {
  const v = row[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function toPublicEvent(row: Record<string, unknown>): PublicEvent {
  return {
    id: String(row.id),
    title: str(row, "title") ?? "",
    description: str(row, "description"),
    date: str(row, "date") ?? "",
    time: str(row, "time"),
    end_time: str(row, "end_time"),
    location: str(row, "location"),
    organizer_name: str(row, "organizer_name"),
    category: str(row, "category"),
    ticket_price: num(row, "ticket_price"),
    website_url: str(row, "website_url"),
    is_cancelled: row.is_cancelled === true,
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function eventContentHash(ev: PublicEvent, ctx: HashContext): string {
  return sha256Hex(stableStringify({ v: PROMPT_VERSION, ...ctx, ev }));
}

export function introContentHash(
  events: PublicEvent[],
  validOn: string,
  ctx: HashContext,
): string {
  return sha256Hex(
    stableStringify({
      v: PROMPT_VERSION,
      ...ctx,
      validOn,
      events: events.map((e) => ({ id: e.id, title: e.title, date: e.date })),
    }),
  );
}

export function outroContentHash(weekKey: string, ctx: HashContext): string {
  return sha256Hex(stableStringify({ v: PROMPT_VERSION, ...ctx, weekKey }));
}
