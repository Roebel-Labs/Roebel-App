import { NextResponse } from "next/server";
import { channelNumber, listChannels } from "@/lib/chat/agent/channels";
import type { ChannelRow } from "@/lib/chat/agent/channels";
import { agentAddress, mailEnabled } from "@/lib/chat/agent/mail";
import { AgentInputError, PERSONALITIES, agentBot, getAgentProfile, setOwnerEmail, updateAgentProfile } from "@/lib/chat/agent/profile";
import type { AgentProfileRow } from "@/lib/chat/agent/profile";
import { googleApi, googleEnabled, hasScope } from "@/lib/chat/harness/connectors/google";
import type { GoogleSecret } from "@/lib/chat/harness/connectors/google";
import { listConnectors, secretOf } from "@/lib/chat/harness/connectors/store";
import * as store from "@/lib/chat/store";
import { badRequest, handleError, readJson, requireWallet, unauthorized } from "../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** "+4915112345678" → "+49 151 •••• 678": enough to recognise, not enough to copy. */
const maskPhone = (n: string) => `${n.slice(0, 3)} ${n.slice(3, 6)} •••• ${n.slice(-3)}`;
const toChannel = (c: ChannelRow) => ({ id: c.id, kind: c.kind, address: maskPhone(c.address), verifiedAt: c.verified_at });

/** A connected Google account proves an address: adopt it as the one the assistant answers to. */
async function adoptGoogleAddress(wallet: string, profile: AgentProfileRow): Promise<AgentProfileRow> {
  if (profile.owner_email_verified_at || !googleEnabled()) return profile;
  try {
    const google = (await listConnectors(wallet, { activeOnly: true })).find((r) => r.kind === "google");
    if (!google || !hasScope(secretOf<GoogleSecret>(google)?.scope, "gmail.readonly")) return profile;
    const me = await googleApi<{ emailAddress?: string }>(google, "https://gmail.googleapis.com/gmail/v1/users/me/profile");
    const email = (me.emailAddress ?? "").toLowerCase();
    if (!email) return profile;
    const at = new Date().toISOString();
    await setOwnerEmail(wallet, email);
    return { ...profile, owner_email: email, owner_email_verified_at: at };
  } catch {
    return profile;
  }
}

async function view(wallet: string) {
  const profile = await adoptGoogleAddress(wallet, await getAgentProfile(wallet));
  const [bot, channels] = await Promise.all([agentBot(profile), listChannels(wallet)]);
  return {
    agent: {
      botId: bot.id, name: profile.name || bot.name, defaultName: bot.name, description: bot.description, since: profile.created_at,
      personality: profile.personality, customInstructions: profile.custom_instructions, spokenName: profile.spoken_name,
      tools: bot.tools ?? [],
      mail: {
        enabled: mailEnabled(), address: agentAddress(profile), alias: profile.mail_alias,
        ownerEmail: profile.owner_email, ownerVerified: Boolean(profile.owner_email_verified_at),
        briefing: profile.email_briefing, routines: profile.email_routines,
      },
      phone: { sms: { number: channelNumber("sms") }, whatsapp: { number: channelNumber("whatsapp") } },
      channels: channels.map(toChannel),
    },
    personalities: PERSONALITIES.map(({ key, title, description }) => ({ key, title, description })),
  };
}

/** GET /api/chat/agent → the person's assistant: profile, mailbox, phone channels. */
export async function GET(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  try {
    return NextResponse.json(await view(wallet));
  } catch (err) {
    return handleError(err, "agent");
  }
}

/** PATCH /api/chat/agent — {name?, personality?, customInstructions?, spokenName?, mailAlias?, emailBriefing?, emailRoutines?, botId?}. */
export async function PATCH(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const input = await readJson(request);
  if (!input) return badRequest("Ungültige Anfrage.");
  const patch: Parameters<typeof updateAgentProfile>[1] = {};
  if (typeof input.name === "string" || input.name === null) patch.name = input.name as string | null;
  if (typeof input.personality === "string") patch.personality = input.personality;
  if (typeof input.customInstructions === "string") patch.customInstructions = input.customInstructions;
  if (typeof input.spokenName === "string") patch.spokenName = input.spokenName;
  if (typeof input.mailAlias === "string") patch.mailAlias = input.mailAlias;
  if (typeof input.emailBriefing === "boolean") patch.emailBriefing = input.emailBriefing;
  if (typeof input.emailRoutines === "boolean") patch.emailRoutines = input.emailRoutines;
  if (input.botId === null) patch.botId = null;
  else if (typeof input.botId === "string") {
    if (!store.isUuid(input.botId) || !(await store.getUsableBotRows(wallet, [input.botId])).length) return badRequest("Diesen Assistenten gibt es nicht.");
    patch.botId = input.botId;
  }
  if (!Object.keys(patch).length) return badRequest("Keine Änderungen angegeben.");
  try {
    await updateAgentProfile(wallet, patch);
    return NextResponse.json(await view(wallet));
  } catch (err) {
    if (err instanceof AgentInputError) return badRequest(err.message);
    return handleError(err, "agent");
  }
}
