// Live chat spam rules (pure, testable). The route adds the stateful parts: duplicate lookup,
// burst limiter and the strike counter that auto-mutes after repeated refusals.
import { containsProfanity } from "@/components/live/profanity";

export type SpamCode = "SPAM_LINK" | "SPAM_WORDS";

export const SPAM_MESSAGES: Record<string, string> = {
  SPAM_DUPLICATE: "Diese Nachricht hast du gerade schon geschickt.",
  SPAM_LINK: "Links sind im Live-Chat nicht erlaubt.",
  SPAM_FLOOD: "Nicht so schnell – kurz durchatmen.",
  SPAM_WORDS: "Diese Nachricht verstößt gegen unsere Chat-Regeln.",
  MUTED: "Du kannst in diesem Chat gerade nicht schreiben.",
};

const LINK_RE =
  /(https?:\/\/|www\.|t\.me\/|wa\.me\/|discord\.gg|bit\.ly|\b[a-z0-9-]{2,}\.(de|com|net|org|io|app|me|ly|gg|info|xyz|ru|shop|link|site|online)\b)/i;

/** Collapse "soooooo" → "sooo", shouty ALL CAPS → sentence case. Never refuses. */
export function normaliseChat(body: string): string {
  let s = body.replace(/\s+/g, " ").trim();
  s = s.replace(/(.)\1{3,}/gu, "$1$1$1");
  const letters = s.replace(/[^A-Za-zÄÖÜäöüß]/g, "");
  if (letters.length >= 8) {
    const upper = letters.replace(/[^A-ZÄÖÜ]/g, "").length;
    if (upper / letters.length > 0.7) s = s.charAt(0) + s.slice(1).toLowerCase();
  }
  return s;
}

/** Content rules that refuse a message outright. */
export function spamCheck(body: string): SpamCode | null {
  if (LINK_RE.test(body)) return "SPAM_LINK";
  if (containsProfanity(body)) return "SPAM_WORDS";
  return null;
}

/** Same message (case/space-insensitive) as one of the author's recent ones. */
export function isDuplicate(body: string, recent: string[]): boolean {
  const key = body.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  if (!key) return false;
  return recent.some((r) => r.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "") === key);
}
