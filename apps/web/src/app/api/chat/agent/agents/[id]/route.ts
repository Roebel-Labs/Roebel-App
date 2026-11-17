import { NextResponse } from "next/server";
import { PERSONALITY_KEYS, characterById, characterRoleLine } from "@/lib/chat/agent/characters";
import { agentBot, findProfile, setMainAgent } from "@/lib/chat/agent/profile";
import { isAllowedAvatarUrl } from "@/lib/chat/agent/avatar-image";
import { agentView } from "@/lib/chat/agent/view";
import * as store from "@/lib/chat/store";
import { badRequest, handleError, notFound, readJson, requireWallet, unauthorized } from "../../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

async function ownAgent(wallet: string, id: string): Promise<store.BotRow | null> {
  if (!store.isUuid(id)) return null;
  const row = await store.getBotRow(id);
  return row && !row.is_preset && row.owner_wallet === wallet ? row : null;
}

const ROLE_MAX = 120;
const INSTRUCTIONS_MAX = 4000;

/**
 * PATCH /api/chat/agent/agents/:id — {name?, character?, imageUrl?, role?, instructions?, personality?}.
 * A new character keeps a name the person chose; a name that was the old character's default follows the new
 * one. imageUrl switches the agent to an own picture (the character goes); character switches back.
 * role and instructions are for agents with an own picture (a character brings its own role).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { id } = await params;
  const input = await readJson(request);
  if (!input) return badRequest("Ungültige Anfrage.");
  try {
    const row = await ownAgent(wallet, id);
    if (!row) return notFound("Der Agent");
    const avatar = store.normalizeAvatar(row.avatar);
    const before = characterById(avatar.character);
    const patch: Parameters<typeof store.updateBot>[2] = {};
    let name = row.name;
    if (input.character !== undefined) {
      const next = characterById(input.character);
      if (!next) return badRequest("Diese Figur gibt es nicht.");
      if (!before || row.name === before.name) name = next.name;
      const { imageUrl: _dropped, ...rest } = avatar;
      patch.avatar = { ...rest, character: next.id, color: next.color };
      patch.description = characterRoleLine(next);
    }
    if (input.imageUrl !== undefined) {
      if (!isAllowedAvatarUrl(input.imageUrl, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) return badRequest("Dieses Bild kann ich nicht verwenden. Lade es bitte neu hoch.");
      const { character: _dropped, ...rest } = patch.avatar ?? avatar;
      patch.avatar = { ...rest, imageUrl: input.imageUrl };
      // The character's role line no longer fits; keep a role the person wrote.
      if (before && row.description === characterRoleLine(before)) patch.description = "";
    }
    const hasCharacter = Boolean((patch.avatar ?? avatar).character);
    if (typeof input.role === "string" && !hasCharacter) patch.description = input.role.trim().slice(0, ROLE_MAX);
    if (typeof input.instructions === "string") patch.instructions = input.instructions.trim().slice(0, INSTRUCTIONS_MAX);
    if (typeof input.name === "string") {
      const fallback = characterById(patch.avatar?.character ?? avatar.character)?.name ?? row.name;
      name = input.name.trim().slice(0, 30) || fallback;
    }
    if (name !== row.name) patch.name = name;
    if (input.personality !== undefined) {
      if (!PERSONALITY_KEYS.includes(input.personality as never)) return badRequest("Diese Persönlichkeit gibt es nicht.");
      patch.avatar = { ...(patch.avatar ?? avatar), personality: input.personality as string };
    }
    if (!Object.keys(patch).length) return NextResponse.json(await agentView(wallet));
    await store.updateBot(wallet, id, patch);
    return NextResponse.json(await agentView(wallet));
  } catch (err) {
    return handleError(err, "agent/agents/:id");
  }
}

/** DELETE /api/chat/agent/agents/:id — its threads and routines go to the default assistant. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { id } = await params;
  try {
    const row = await ownAgent(wallet, id);
    if (!row) return notFound("Der Agent");
    const heir = await agentBot(null);
    const profile = await findProfile(wallet);
    const wasMain = profile?.bot_id === id;
    await store.deleteBot(wallet, id, heir.id);
    if (wasMain) await setMainAgent(wallet, null);
    return NextResponse.json(await agentView(wallet));
  } catch (err) {
    return handleError(err, "agent/agents/:id");
  }
}
