import { NextResponse } from "next/server";
import { PERSONALITY_KEYS, characterById, characterRoleLine } from "@/lib/chat/agent/characters";
import { isAllowedAvatarUrl } from "@/lib/chat/agent/avatar-image";
import { setMainAgent } from "@/lib/chat/agent/profile";
import { agentView } from "@/lib/chat/agent/view";
import { workBot } from "@/lib/chat/persona/catalog";
import * as store from "@/lib/chat/store";
import { badRequest, handleError, readJson, requireWallet, unauthorized } from "../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const MAX_AGENTS = 30;
const ROLE_MAX = 120;
const INSTRUCTIONS_MAX = 4000;

/**
 * POST /api/chat/agent/agents — a new own agent, either
 *   {character, name?, personality?, main?}                       an illustrated character, or
 *   {imageUrl, name, role?, instructions?, personality?, main?}   an own picture (from POST /api/chat/agent/avatar).
 * It gets the default assistant's tools. Returns the full assistant view plus createdId.
 */
export async function POST(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const input = await readJson(request);
  if (!input) return badRequest("Ungültige Anfrage.");
  const character = characterById(input.character);
  const imageUrl = !character && isAllowedAvatarUrl(input.imageUrl, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") ? input.imageUrl : null;
  if (!character && !imageUrl) return badRequest("Wähle eine Figur oder lade ein eigenes Bild hoch.");
  const typedName = typeof input.name === "string" ? input.name.trim().slice(0, 30) : "";
  if (!character && !typedName) return badRequest("Gib deinem Agenten einen Namen.");
  const name = typedName || character!.name;
  const personality = PERSONALITY_KEYS.includes(input.personality as never)
    ? (input.personality as string)
    : character?.personality ?? "standard";
  const role = typeof input.role === "string" ? input.role.trim().slice(0, ROLE_MAX) : "";
  const instructions = typeof input.instructions === "string" ? input.instructions.trim().slice(0, INSTRUCTIONS_MAX) : "";
  try {
    const own = await store.listUserBots(wallet);
    if (own.length >= MAX_AGENTS) return badRequest(`Du kannst höchstens ${MAX_AGENTS} eigene Agenten haben.`);
    const base = await workBot();
    const bot = await store.createBot(wallet, character
      ? {
          name, description: characterRoleLine(character), instructions: "",
          avatar: { shape: "circle", color: character.color, eyes: "dots", character: character.id, personality },
          tools: base.tools ?? undefined,
        }
      : {
          name, description: role, instructions,
          avatar: { shape: "circle", color: "#00498B", eyes: "dots", imageUrl: imageUrl!, personality },
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
