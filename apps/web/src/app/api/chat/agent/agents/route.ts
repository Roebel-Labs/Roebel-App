import { NextResponse } from "next/server";
import { PERSONALITY_KEYS, characterById, characterRoleLine } from "@/lib/chat/agent/characters";
import { setMainAgent } from "@/lib/chat/agent/profile";
import { agentView } from "@/lib/chat/agent/view";
import { workBot } from "@/lib/chat/persona/catalog";
import * as store from "@/lib/chat/store";
import { badRequest, handleError, readJson, requireWallet, unauthorized } from "../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const MAX_AGENTS = 20;

/**
 * POST /api/chat/agent/agents — {character, name?, personality?, main?}: takes on an illustrated character as an
 * own agent. It gets the default assistant's tools (its role lives in the character prompt, see agentOverlay).
 * Returns the full assistant view.
 */
export async function POST(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const input = await readJson(request);
  const character = characterById(input?.character);
  if (!input || !character) return badRequest("Diese Figur gibt es nicht.");
  const name = typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 30) : character.name;
  const personality = PERSONALITY_KEYS.includes(input.personality as never) ? (input.personality as string) : character.personality;
  try {
    const own = await store.listUserBots(wallet);
    if (own.filter((b) => b.avatar.character).length >= MAX_AGENTS) return badRequest(`Du kannst höchstens ${MAX_AGENTS} Agenten haben.`);
    const base = await workBot();
    const bot = await store.createBot(wallet, {
      name, description: characterRoleLine(character), instructions: "",
      avatar: { shape: "circle", color: character.color, eyes: "dots", character: character.id, personality },
      tools: base.tools ?? undefined,
    });
    if (input.main === true) {
      const row = await store.getBotRow(bot.id);
      if (row) await setMainAgent(wallet, row);
    }
    return NextResponse.json({ ...(await agentView(wallet)), createdId: bot.id });
  } catch (err) {
    return handleError(err, "agent/agents");
  }
}
