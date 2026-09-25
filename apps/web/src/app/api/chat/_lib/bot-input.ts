// Validation for bot create/update bodies.
import { normalizeAvatar } from "@/lib/chat/store";
import { isModelRoute } from "@/lib/chat/models";
import type { BotAvatarSpec } from "@/lib/chat/types";

export interface BotPatch {
  name?: string;
  description?: string;
  instructions?: string;
  avatar?: BotAvatarSpec;
  model_route?: string;
}

export function parseBotBody(body: Record<string, unknown>, opts: { requireName: boolean }): BotPatch | string {
  const out: BotPatch = {};
  if (body.name !== undefined || opts.requireName) {
    if (typeof body.name !== "string" || !body.name.trim()) return "Bitte gib deinem Bot einen Namen.";
    if (body.name.trim().length > 60) return "Der Name darf höchstens 60 Zeichen lang sein.";
    out.name = body.name.trim();
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string" || body.description.length > 300) return "Die Beschreibung darf höchstens 300 Zeichen lang sein.";
    out.description = body.description.trim();
  }
  if (body.instructions !== undefined) {
    if (typeof body.instructions !== "string" || body.instructions.length > 8000) return "Die Anweisungen dürfen höchstens 8000 Zeichen lang sein.";
    out.instructions = body.instructions.trim();
  }
  if (body.avatar !== undefined) {
    if (!body.avatar || typeof body.avatar !== "object") return "Ungültiger Avatar.";
    out.avatar = normalizeAvatar(body.avatar);
  }
  if (body.modelRoute !== undefined) {
    if (!isModelRoute(body.modelRoute)) return "Unbekanntes Modell.";
    out.model_route = body.modelRoute;
  }
  return out;
}
