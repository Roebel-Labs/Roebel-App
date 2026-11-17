// Agent pictures: every assistant shows an image (no more drawn shapes). It is either an illustrated
// character, an own picture the person uploaded, or, for preset bots, house artwork on the website.
// Pure helpers; no imports on purpose (the chat store pulls this in to validate avatars).

/** Own uploads live in the public `images` bucket under this prefix, one random file name each. */
export const AVATAR_UPLOAD_PREFIX = "chat/avatars";

const SITE_HOSTS = new Set(["www.roebel.app", "roebel.app"]);
const SITE_PATH_RE = /^\/(agents|mascot)\/[a-z0-9-]+(\/[a-z0-9-]+)?\.(png|webp|jpg)$/i;
const UPLOAD_PATH_RE = new RegExp(`^/storage/v1/object/public/images/${AVATAR_UPLOAD_PREFIX}/[0-9a-f-]{36}\\.(png|webp|jpg)$`, "i");

/**
 * An avatar image may only come from our own storage (an upload through /api/chat/agent/avatar) or from
 * the house artwork on the website. Anything else (tracking pixels, someone else's server) is dropped.
 */
export function isAllowedAvatarUrl(value: unknown, supabaseUrl: string): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return false;
  if (/\.\.|%2e/i.test(url.pathname)) return false;
  if (SITE_HOSTS.has(url.hostname.toLowerCase())) return SITE_PATH_RE.test(url.pathname);
  let storageHost = "";
  try {
    storageHost = new URL(supabaseUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  return url.hostname.toLowerCase() === storageHost && UPLOAD_PATH_RE.test(url.pathname);
}

/** Identity line for an agent with an own picture (characters bring their own, see characterPrompt). */
export function customAgentPrompt(name: string, role: string): string {
  const r = role.trim();
  return r
    ? `Du bist ${name}. Deine Aufgabe, wie der Mensch sie beschrieben hat: ${r}. Darauf bist du spezialisiert, du hilfst aber bei allem, worum dich der Mensch bittet.`
    : `Du bist ${name}, ein Agent, den sich der Mensch selbst eingerichtet hat.`;
}
