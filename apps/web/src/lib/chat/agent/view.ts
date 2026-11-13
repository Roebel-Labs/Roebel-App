// The assistant view shared by /api/chat/agent and /api/chat/agent/agents: main profile, mailbox, phones and
// the list of the person's agents.
import { channelNumber, listChannels } from "./channels";
import type { ChannelRow } from "./channels";
import { characterById, characterRoleLine } from "./characters";
import { agentAddress, mailEnabled } from "./mail";
import { PERSONALITIES, agentBot, getAgentProfile, setOwnerEmail } from "./profile";
import type { AgentProfileRow } from "./profile";
import { googleApi, googleEnabled, hasScope } from "../harness/connectors/google";
import type { GoogleSecret } from "../harness/connectors/google";
import { listConnectors, secretOf } from "../harness/connectors/store";
import * as store from "../store";

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

/** One entry per agent: the default assistant plus every own bot that is an illustrated character. */
async function agentList(wallet: string, main: store.BotRow, profile: AgentProfileRow) {
  const own = await store.db().from("chat_bots").select("*").eq("owner_wallet", wallet).eq("is_preset", false).order("created_at");
  if (own.error) throw new Error(`[chat/agent] own bots: ${own.error.message}`);
  const rows = (own.data as store.BotRow[]).filter((b) => characterById(store.normalizeAvatar(b.avatar).character));
  const fallback = main.is_preset ? main : await agentBot(null);
  const all = [fallback, ...rows.filter((b) => b.id !== fallback.id)];
  if (!all.some((b) => b.id === main.id)) all.push(main);
  return all.map((b) => {
    const avatar = store.normalizeAvatar(b.avatar);
    const character = characterById(avatar.character);
    const isMain = b.id === main.id;
    return {
      botId: b.id, name: isMain ? profile.name || b.name : b.name, characterId: character?.id ?? null,
      role: character ? characterRoleLine(character) : b.description, isMain, isPreset: b.is_preset,
      personality: isMain ? profile.personality : avatar.personality ?? character?.personality ?? "standard",
      since: isMain ? profile.created_at : b.created_at,
    };
  });
}

export async function agentView(wallet: string) {
  const profile = await adoptGoogleAddress(wallet, await getAgentProfile(wallet));
  const [bot, channels] = await Promise.all([agentBot(profile), listChannels(wallet)]);
  const character = characterById(store.normalizeAvatar(bot.avatar).character);
  return {
    agents: await agentList(wallet, bot, profile),
    agent: {
      botId: bot.id, name: profile.name || bot.name, defaultName: character?.name ?? bot.name, description: character ? characterRoleLine(character) : bot.description,
      characterId: character?.id ?? null, isPreset: bot.is_preset, since: profile.created_at,
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

