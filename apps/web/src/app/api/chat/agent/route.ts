import { NextResponse } from "next/server";
import { characterById } from "@/lib/chat/agent/characters";
import { AgentInputError, agentBot, getAgentProfile, setMainAgent, updateAgentProfile } from "@/lib/chat/agent/profile";
import { agentView as view } from "@/lib/chat/agent/view";
import * as store from "@/lib/chat/store";
import { badRequest, handleError, readJson, requireWallet, unauthorized } from "../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

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
  // Switching the main assistant resets the profile name and moves the mail alias (setMainAgent).
  let mainBot: store.BotRow | null | undefined;
  if (input.botId === null) mainBot = null;
  else if (typeof input.botId === "string") {
    const rows = store.isUuid(input.botId) ? await store.getUsableBotRows(wallet, [input.botId]) : [];
    if (!rows.length) return badRequest("Diesen Assistenten gibt es nicht.");
    mainBot = rows[0];
  }
  if (!Object.keys(patch).length && mainBot === undefined) return badRequest("Keine Änderungen angegeben.");
  try {
    if (mainBot !== undefined) await setMainAgent(wallet, mainBot);
    // An own (character) agent keeps its name on its bot, like every other agent in the list.
    if (patch.name !== undefined) {
      const base = await agentBot(await getAgentProfile(wallet));
      if (!base.is_preset) {
        const fallback = characterById(store.normalizeAvatar(base.avatar).character)?.name ?? base.name;
        await store.updateBot(wallet, base.id, { name: patch.name?.trim().slice(0, 30) || fallback });
        delete patch.name;
      }
    }
    if (Object.keys(patch).length) await updateAgentProfile(wallet, patch);
    return NextResponse.json(await view(wallet));
  } catch (err) {
    if (err instanceof AgentInputError) return badRequest(err.message);
    return handleError(err, "agent");
  }
}
