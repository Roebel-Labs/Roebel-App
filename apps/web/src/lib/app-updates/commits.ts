// Pure helpers for "Was ist neu": turn raw git commit subjects into the short
// list of changes a resident would notice. No I/O here.

/** Category of `news_articles` that marks a product update post. */
export const APP_UPDATE_CATEGORY = "App-Update"

export type RawCommit = { sha: string; subject: string; date: string }

export type UserFacingChange = {
  kind: "feat" | "fix"
  /** Product area in plain German, e.g. "App", "Website", "Mecky". */
  area: string
  text: string
  date: string
}

// Conventional-commit scope → the name a resident knows the area by.
const AREA_BY_SCOPE: Record<string, string> = {
  expo: "App",
  app: "App",
  web: "Website",
  chat: "Mecky und Assistenten",
  mecky: "Mecky und Assistenten",
  studio: "Ortis Studio",
  "mini-apps": "Mini-Apps",
  miniapp: "Mini-Apps",
  newsletter: "Newsletter",
  circles: "Röbel Münzen",
  muenzen: "Röbel Münzen",
  dao: "Abstimmungen",
  coordinator: "Abstimmungen",
  contracts: "Abstimmungen",
}

// Scopes that never reach a resident's screen.
const INTERNAL_SCOPES = new Set(["deps", "ci", "config", "cli", "infra", "dev", "test", "tests", "lint"])

const SUBJECT_RE = /^(feat|fix)(?:\(([^)]+)\))?!?:\s*(.+)$/i
const HASH_RE = /\b[0-9a-f]{7,40}\b/g
const WALLET_RE = /0x[0-9a-fA-F]{6,}/g

/** Keeps `feat` and `fix` commits outside internal scopes, newest first, without duplicates. */
export function userFacingChanges(commits: RawCommit[]): UserFacingChange[] {
  const seen = new Set<string>()
  const out: UserFacingChange[] = []
  const sorted = [...commits].sort((a, b) => b.date.localeCompare(a.date))
  for (const commit of sorted) {
    const match = commit.subject.trim().match(SUBJECT_RE)
    if (!match) continue
    const scope = (match[2] ?? "").toLowerCase().trim()
    if (INTERNAL_SCOPES.has(scope)) continue
    const text = match[3].replace(WALLET_RE, "").replace(HASH_RE, "").replace(/\s+/g, " ").trim()
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      kind: match[1].toLowerCase() as "feat" | "fix",
      area: AREA_BY_SCOPE[scope] ?? "Allgemein",
      text,
      date: commit.date,
    })
  }
  return out
}

/** Changes grouped by area for the prompt, new features before fixes. */
export function groupByArea(changes: UserFacingChange[]): Array<{ area: string; changes: UserFacingChange[] }> {
  const groups = new Map<string, UserFacingChange[]>()
  for (const change of changes) {
    const list = groups.get(change.area) ?? []
    list.push(change)
    groups.set(change.area, list)
  }
  return [...groups.entries()]
    .map(([area, list]) => ({
      area,
      changes: [...list].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "feat" ? -1 : 1)),
    }))
    .sort((a, b) => b.changes.length - a.changes.length)
}

/** URL-safe slug with German transliteration, suffixed with the ISO date to stay unique. */
export function updateSlug(title: string, isoDate: string): string {
  const base = title
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "")
  return `${base || "app-update"}-${isoDate.slice(0, 10)}`
}
