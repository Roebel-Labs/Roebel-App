// Parts that are updated in place after they were emitted (generated images by imageId).
// Pure helpers; the store wrapper patches a persisted message with them.
import type { ChatPart } from "../types";

export type GeneratedImagePart = Extract<ChatPart, { type: "generated_image" }>;

/** Identity of a part that later updates replace (null = plain, append-only part). */
export function livePartKey(part: ChatPart): string | null {
  if (part.type === "generated_image") return `generated_image:${part.imageId}`;
  if (part.type === "approval") return `approval:${part.actionId}`;
  if (part.type === "task") return `task:${part.taskId}`;
  return null;
}

/**
 * Replaces the part with the same live key in `parts` (in place, returns true),
 * or appends it when none exists yet (returns false).
 */
export function upsertLivePart(parts: ChatPart[], part: ChatPart): boolean {
  const key = livePartKey(part);
  const idx = key ? parts.findIndex((p) => livePartKey(p) === key) : -1;
  if (idx >= 0) {
    parts[idx] = part;
    return true;
  }
  parts.push(part);
  return false;
}

/**
 * Applies `patch` to the generated_image part with `imageId`. Returns the new
 * parts array and the patched part, or null when the message has no such part.
 */
export function patchImagePart(
  parts: ChatPart[], imageId: string, patch: Partial<Omit<GeneratedImagePart, "type" | "imageId">>,
): { parts: ChatPart[]; part: GeneratedImagePart } | null {
  const idx = parts.findIndex((p) => p.type === "generated_image" && p.imageId === imageId);
  if (idx < 0) return null;
  const part: GeneratedImagePart = { ...(parts[idx] as GeneratedImagePart), ...patch, type: "generated_image", imageId };
  // A finished image never keeps a stale error, a failed one never a url.
  if (part.status === "done") delete part.error;
  if (part.status === "failed") delete part.url;
  const next = parts.slice();
  next[idx] = part;
  return { parts: next, part };
}
