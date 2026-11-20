// request_event_listing: someone forwards a poster or an announcement of an event that
// is not theirs ("could you put this in the app?"). The assistant reads it and files an
// event request: the responsible organisation is asked by push to publish it under its
// own account (lib/event-requests/service.ts). Risk 'public': the person confirms the
// extracted facts on an approval card before anyone is notified.
import { z } from "zod";
import { ToolInputError } from "../errors";
import type { ApprovalPreview, HarnessContext, HarnessTool, ToolRegistry } from "../types";
import {
  EVENT_CATEGORIES, assertNoAddress, clip, durableImageUrl, formatDateDe, normalizeEventCategory,
  validateEventDate, validateTime,
} from "./actions";
import { parseStorageUrl } from "./images";

const DAILY_LIMIT = 10;

const input = z.object({
  title: z.string().min(2).max(150).describe("Titel der Veranstaltung, wie er auf dem Plakat steht"),
  date: z.string().describe("Datum JJJJ-MM-TT"),
  time: z.string().optional().describe("Beginn HH:MM (optional)"),
  location: z.string().min(2).max(200).describe("Ort, z. B. 'Haus des Gastes Röbel/Müritz'"),
  description: z.string().min(1).max(3000)
    .describe("Beschreibung nur aus dem, was auf dem Plakat oder in der Nachricht steht (Inhalt, Preise, Vorverkauf). Nichts dazuerfinden."),
  organizer: z.string().min(2).max(160)
    .describe("Veranstalter genau wie auf dem Plakat genannt, z. B. 'Stadtbibliothek Röbel-Müritz'. Unbekannt: den Menschen fragen."),
  category: z.string().optional().describe(`Kategorie: ${EVENT_CATEGORIES.join(", ")}`),
  imageUrl: z.string().url().max(2000).optional()
    .describe("Bild-URL des Plakats aus DIESEM Chat (das geschickte Foto), als Titelbild"),
  websiteUrl: z.string().url().max(500).optional().describe("Link zur Veranstaltung, falls genannt"),
});
type Input = z.infer<typeof input>;

function normalize(i: Input) {
  assertNoAddress(i.title, i.description, i.location, i.organizer);
  if (i.imageUrl && !parseStorageUrl(i.imageUrl, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) {
    throw new ToolInputError("Als Bild geht nur ein Foto, das in diesem Chat geschickt wurde.");
  }
  return {
    title: i.title.trim(), date: validateEventDate(i.date), time: validateTime(i.time),
    location: i.location.trim(), description: i.description.trim(), organizer: i.organizer.trim(),
    category: normalizeEventCategory(i.category), imageUrl: i.imageUrl ?? null, websiteUrl: i.websiteUrl ?? null,
  };
}

/** DB seam (tests replace these). */
export const eventRequestDeps = {
  async requestedToday(wallet: string): Promise<number> {
    const { createAdminClient } = await import("../../../supabase/admin");
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = await createAdminClient().from("event_requests").select("id", { count: "exact", head: true })
      .eq("requested_by_wallet", wallet.toLowerCase()).gte("created_at", since);
    if (res.error) throw new Error(`[event-requests] count: ${res.error.message}`);
    return res.count ?? 0;
  },
  async create(args: Parameters<typeof import("../../../event-requests/service").createEventRequest>[0]) {
    const { createEventRequest } = await import("../../../event-requests/service");
    return createEventRequest(args);
  },
};

async function checkLimit(ctx: HarnessContext): Promise<void> {
  if ((await eventRequestDeps.requestedToday(ctx.wallet)) >= DAILY_LIMIT) {
    throw new ToolInputError(`Das Tageslimit für Veranstaltungs-Anfragen (${DAILY_LIMIT}) ist erreicht. Morgen geht es weiter.`);
  }
}

export const requestEventListing: HarnessTool<Input> = {
  name: "request_event_listing",
  pack: "actions",
  risk: "public",
  description:
    "Für Veranstaltungen ANDERER: Jemand schickt ein Plakat, einen Flyer oder eine Ankündigung und möchte, dass die Veranstaltung " +
    "in die Röbel-App kommt. Liest du die Angaben aus dem Bild, legt dieses Werkzeug eine Anfrage an: Die zuständige Organisation " +
    "bekommt eine Mitteilung und veröffentlicht die Veranstaltung unter ihrem eigenen Konto. Antwortet sie zwei Tage nicht, " +
    "kümmert sich das Röbel-Team. Prüft selbst, ob es die Veranstaltung schon gibt. " +
    "Für eigene Veranstaltungen des Menschen nutze submit_event, für die einer eigenen Organisation create_org_event.",
  inputSchema: input,
  summarize: ({ title, organizer }) => `Veranstaltung bei „${clip(organizer, 40)}“ anfragen: „${clip(title, 50)}“`,
  preview: async (raw, ctx): Promise<ApprovalPreview> => {
    const e = normalize(raw);
    await checkLimit(ctx);
    return {
      kind: "event",
      fields: [
        { label: "Titel", value: e.title },
        { label: "Wann", value: `${formatDateDe(e.date)}${e.time ? `, ${e.time} Uhr` : ""}` },
        { label: "Wo", value: e.location },
        { label: "Veranstalter", value: e.organizer },
        { label: "So geht es weiter", value: "Die Organisation wird gefragt und veröffentlicht selbst" },
      ],
      body: e.description,
      ...(e.imageUrl ? { imageUrl: e.imageUrl } : {}),
    };
  },
  execute: async (raw, ctx) => {
    const e = normalize(raw);
    await checkLimit(ctx);
    const imageUrl = (await durableImageUrl(e.imageUrl ?? undefined, ctx)) ?? null;
    const result = await eventRequestDeps.create({
      source: "forward", title: e.title, description: e.description, date: e.date, time: e.time,
      location: e.location, category: e.category, imageUrl, websiteUrl: e.websiteUrl,
      organizerName: e.organizer, requestedByWallet: ctx.wallet,
    });
    switch (result.outcome) {
      case "duplicate":
        return {
          ok: true, status: "duplicate",
          info: result.reason === "listed"
            ? `Die Veranstaltung steht schon in der App („${result.title}“). Es wurde nichts doppelt angelegt.`
            : `Zu dieser Veranstaltung läuft schon eine Anfrage („${result.title}“). Es wurde nichts doppelt angelegt.`,
        };
      case "requested":
        return {
          ok: true, status: "requested",
          info: `${result.accountName} wurde per Mitteilung gefragt. Veröffentlichen sie nicht innerhalb von zwei Tagen, kümmert sich das Röbel-Team darum.`,
        };
      case "published_default":
        return { ok: true, status: "published", eventId: result.eventId, info: "Kein passendes Organisationskonto gefunden. Die Veranstaltung steht jetzt unter dem Konto der Röbel-App." };
      default:
        return { ok: true, status: "team_review", info: "Kein passendes Organisationskonto gefunden. Das Röbel-Team prüft die Veranstaltung und stellt sie ein." };
    }
  },
};

export const EVENT_REQUEST_TOOLS: HarnessTool[] = [requestEventListing] as HarnessTool[];

export function register(registry: ToolRegistry): void {
  for (const t of EVENT_REQUEST_TOOLS) registry.registerTool(t);
}
