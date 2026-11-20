// Pure helpers for event requests: duplicate detection and matching an organiser
// name from a poster or web page to an organisation account. No I/O.

const STOPWORDS = new Set([
  "der", "die", "das", "und", "im", "in", "am", "an", "auf", "mit", "fuer", "von", "zu", "zum", "zur", "des", "den", "dem",
  "ein", "eine", "e", "v", "ev", "gmbh", "ug", "co", "kg",
  // Place names say nothing about who the organiser is in a town where everything carries them.
  "roebel", "mueritz", "roebelmueritz",
]);

/** Lower-case, German transliteration, punctuation to spaces. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokens(text: string): string[] {
  return normalizeText(text).split(" ").filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** One request per event at its source: date plus normalised title. */
export function dedupeKey(date: string, title: string): string {
  return `${date}:${tokens(title).join("-").slice(0, 120)}`;
}

/**
 * Same event under two titles ("Wer möchte nicht im Leben bleiben" vs
 * "… – Lesung mit Helene Bukowski"): one title's words are contained in the
 * other, or most words overlap.
 */
export function titlesMatch(a: string, b: string): boolean {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const smaller = Math.min(ta.size, tb.size);
  // Containment needs at least two words so a one-word title cannot swallow everything.
  if (shared === smaller && smaller >= 2) return true;
  return shared / (ta.size + tb.size - shared) >= 0.6;
}

export function findDuplicate<T extends { title: string; date: string }>(
  candidate: { title: string; date: string }, existing: T[],
): T | null {
  return existing.find((e) => e.date === candidate.date && titlesMatch(e.title, candidate.title)) ?? null;
}

export interface OrgCandidate { id: string; name: string }

/**
 * Best organisation for an organiser name, or null. A match needs at least one
 * shared distinctive word (5+ letters) and most of the shorter name covered;
 * a tie between two organisations is no match.
 */
export function matchOrganisation(organizer: string | null | undefined, orgs: OrgCandidate[]): OrgCandidate | null {
  if (!organizer) return null;
  const wanted = new Set(tokens(organizer));
  if (wanted.size === 0) return null;
  let best: { org: OrgCandidate; score: number } | null = null;
  let tie = false;
  for (const org of orgs) {
    const own = new Set(tokens(org.name));
    if (own.size === 0) continue;
    const shared = [...wanted].filter((t) => own.has(t));
    if (!shared.some((t) => t.length >= 5)) continue;
    const score = shared.length / Math.min(wanted.size, own.size);
    if (score < 0.6) continue;
    // Prefer the organisation whose whole name is covered.
    const weighted = score + shared.length / (own.size + wanted.size);
    if (!best || weighted > best.score) {
      best = { org, score: weighted };
      tie = false;
    } else if (weighted === best.score) {
      tie = true;
    }
  }
  return best && !tie ? best.org : null;
}

/** "20.11.2026" from an ISO date. */
export function formatDateDe(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}`;
}
