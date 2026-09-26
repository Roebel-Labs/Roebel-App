// Pack 'user' (risk 'private'): the signed-in person's own data, strictly
// scoped to ctx.wallet (never an input). Wallet addresses never appear in
// the output (shapeOutput scrubs them; queries only filter by them).
import { z } from "zod";
import { getMyMuenzenBalance } from "../../../roebel-data/muenzen";
import type { TenantRef } from "../../../roebel-data/public";
import { shapeOutput } from "../../../roebel-data/shape";
import type { Db } from "../../../roebel-data/tenant";
import {
  getMyEvents,
  getMyNotifications,
  getMyOrgs,
  getMyProfile,
  getMyTickets,
} from "../../../roebel-data/user";
import type { HarnessContext, HarnessTool, ToolRegistry } from "../types";

async function db(): Promise<Db> {
  const { createAdminClient } = await import("../../../supabase/admin");
  return createAdminClient();
}

function tenantOf(ctx: HarnessContext): TenantRef {
  return { id: ctx.tenant.id, appOrigin: ctx.tenant.appOrigin };
}

const noInput = z.object({}) as unknown as z.ZodType<Record<string, never>>;

export const myProfile: HarnessTool<Record<string, never>> = {
  name: "my_profile",
  pack: "user",
  risk: "private",
  description:
    "Das eigene Profil des Menschen in der Röbel-App: Name, Bio, Ortsteil, Interessen, Bürger-Verifizierung, Punkte, Organisationen.",
  inputSchema: noInput,
  summarize: () => "Dein Profil ansehen",
  execute: async (_i, ctx) => shapeOutput(await getMyProfile(await db(), tenantOf(ctx), ctx.wallet)),
};

export const myOrgs: HarnessTool<Record<string, never>> = {
  name: "my_orgs",
  pack: "user",
  risk: "private",
  description: "Die Organisationen (Vereine, Betriebe …), die der Mensch in der App verwaltet oder in denen er Mitglied ist, mit Rolle.",
  inputSchema: noInput,
  summarize: () => "Deine Organisationen ansehen",
  execute: async (_i, ctx) => shapeOutput(await getMyOrgs(await db(), tenantOf(ctx), ctx.wallet)),
};

const ticketsInput = z.object({
  include_past: z.boolean().default(false).describe("Auch vergangene Tickets zeigen"),
});
export const myTickets: HarnessTool<z.infer<typeof ticketsInput>> = {
  name: "my_tickets",
  pack: "user",
  risk: "private",
  description: "Die Veranstaltungs-Tickets des Menschen (kommende; optional auch vergangene).",
  inputSchema: ticketsInput,
  summarize: () => "Deine Tickets ansehen",
  execute: async ({ include_past }, ctx) =>
    shapeOutput(await getMyTickets(await db(), tenantOf(ctx), ctx.wallet, { includePast: include_past })),
};

export const myEvents: HarnessTool<Record<string, never>> = {
  name: "my_events",
  pack: "user",
  risk: "private",
  description:
    "Veranstaltungen, die sich der Mensch vorgemerkt hat (Interesse), und kommende Veranstaltungen seiner Organisationen.",
  inputSchema: noInput,
  summarize: () => "Deine Veranstaltungen ansehen",
  execute: async (_i, ctx) => shapeOutput(await getMyEvents(await db(), tenantOf(ctx), ctx.wallet)),
};

export const myMuenzenBalance: HarnessTool<Record<string, never>> = {
  name: "my_muenzen_balance",
  pack: "user",
  risk: "private",
  description: "Aktuelles Guthaben an Röbel-Münzen des Menschen (nur lesen).",
  inputSchema: noInput,
  summarize: () => "Dein Röbel-Münzen-Guthaben ansehen",
  execute: async (_i, ctx) => shapeOutput(await getMyMuenzenBalance(ctx.wallet)),
};

const notifInput = z.object({
  limit: z.number().int().min(1).max(30).default(10).describe("Anzahl (Standard 10)"),
  unread_only: z.boolean().default(false).describe("Nur ungelesene"),
});
export const myNotifications: HarnessTool<z.infer<typeof notifInput>> = {
  name: "my_notifications",
  pack: "user",
  risk: "private",
  description: "Die letzten Benachrichtigungen des Menschen in der App (Likes, Kommentare, Nachrichten, Hinweise).",
  inputSchema: notifInput,
  summarize: () => "Deine Benachrichtigungen ansehen",
  execute: async ({ limit, unread_only }, ctx) =>
    shapeOutput(await getMyNotifications(await db(), tenantOf(ctx), ctx.wallet, { limit, unreadOnly: unread_only }), {
      maxString: 240,
    }),
};

export const TOOLS: HarnessTool[] = [myProfile, myOrgs, myTickets, myEvents, myMuenzenBalance, myNotifications];

export function register(registry: ToolRegistry): void {
  for (const t of TOOLS) registry.registerTool(t);
}
