// Two-way link between the wiki and the person's own Claude (claude.ai, Claude
// Desktop, Claude Code) over MCP: Claude can read the wiki and write durable
// knowledge back. A link token stands for one wallet; only its hash is stored.
import { createHash, randomBytes } from "node:crypto";
import { db, isUuid } from "../store";
import { listMemories } from "../harness/memory";
import { scrubSecrets, stripCitations } from "./classify";
import { searchPages } from "./runtime";
import * as store from "./store";

export const MAX_LINK_TOKENS = 5;
export const MAX_PUSH_CHARS = 60_000;
const MAX_IMPORTS = 12;

export interface LinkToken { id: string; label: string; createdAt: string; lastUsedAt: string | null }
interface TokenRow { id: string; wallet: string; label: string; created_at: string; last_used_at: string | null }

const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");
const toToken = (r: TokenRow): LinkToken => ({ id: r.id, label: r.label, createdAt: r.created_at, lastUsedAt: r.last_used_at });

export async function listLinkTokens(wallet: string): Promise<LinkToken[]> {
  const res = await db().from("persona_link_tokens").select("id, wallet, label, created_at, last_used_at").eq("wallet", wallet).order("created_at");
  if (res.error) throw new Error(`[chat/persona] link tokens: ${res.error.message}`);
  return (res.data as TokenRow[]).map(toToken);
}

export async function createLinkToken(wallet: string, label: string): Promise<{ token: LinkToken; secret: string }> {
  const secret = `ortis_${randomBytes(30).toString("base64url")}`;
  const res = await db().from("persona_link_tokens").insert({ wallet, label: label.slice(0, 40) || "Claude", token_hash: hash(secret) })
    .select("id, wallet, label, created_at, last_used_at").single();
  if (res.error) throw new Error(`[chat/persona] create link token: ${res.error.message}`);
  return { token: toToken(res.data as TokenRow), secret };
}

export async function deleteLinkToken(wallet: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const res = await db().from("persona_link_tokens").delete().eq("wallet", wallet).eq("id", id).select("id");
  return !res.error && (res.data ?? []).length > 0;
}

/** The wallet a link secret belongs to, or null. */
export async function walletForLinkSecret(secret: string | null | undefined): Promise<string | null> {
  if (!secret || !/^ortis_[A-Za-z0-9_-]{30,60}$/.test(secret)) return null;
  const res = await db().from("persona_link_tokens").select("id, wallet").eq("token_hash", hash(secret)).maybeSingle();
  const row = res.data as { id: string; wallet: string } | null;
  if (!row) return null;
  void db().from("persona_link_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", row.id).then(() => {}, () => {});
  return row.wallet;
}

// ---- what the linked assistant can do ------------------------------------------------

const today = () => new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });

/** Short profile, page index, people and the person's own notes: the first thing a linked assistant reads. */
export async function linkProfile(wallet: string): Promise<string> {
  const [rows, job, memories] = await Promise.all([
    store.listPageRows(wallet, { withBody: true }), store.getJob(wallet), listMemories(wallet, 40).catch(() => []),
  ]);
  const core = rows.find((r) => r.slug === "_core");
  const notes = rows.find((r) => r.slug === "notes");
  if (!core?.body?.trim() && !notes?.body?.trim()) {
    return "Das Ortis-Wiki ist noch leer. Der Mensch kann es in Ortis Studio unter Wiki aufbauen; du kannst mit ortis_push_context Kontext beisteuern.";
  }
  const lines: string[] = [];
  lines.push(`# Ortis-Wiki${job?.built_at ? ` (Stand ${new Date(job.built_at).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })})` : ""}`);
  if (core?.body?.trim()) lines.push(core.body.trim());
  const pages = rows.filter((r) => r.kind !== "core" && r.kind !== "person");
  lines.push("## Seiten (mit ortis_read lesen)", ...pages.map((p) => `- ${p.slug}: ${p.title}${p.summary ? ` · ${p.summary.slice(0, 140)}` : ""}`));
  const people = rows.filter((r) => r.kind === "person").sort((a, b) => (b.meta?.priority ?? 0) - (a.meta?.priority ?? 0)).slice(0, 20);
  if (people.length) lines.push("## Personen", ...people.map((p) => `- ${p.slug}: ${p.title} · ${(p.meta?.description ?? p.summary).slice(0, 120)}`));
  if (notes?.body?.trim()) lines.push("## Vom Menschen ausdrücklich gesagt (verbindlich)", stripCitations(notes.body).trim().slice(-3000));
  if (memories.length) lines.push("## Im Ortis-Chat gemerkt", ...memories.map((m) => `- ${m.fact}`));
  return lines.join("\n");
}

export async function linkRead(wallet: string, slug: string): Promise<string | null> {
  const row = await store.getPageRow(wallet, slug.trim().toLowerCase());
  if (!row || row.kind === "core") return null;
  const sources = (row.sources ?? []).map((s) => `${s.n}. ${s.label}${s.date ? ` · ${s.date}` : ""}`).join("\n");
  return `# ${row.title}\n${row.summary ? `${row.summary}\n\n` : ""}${row.body}${sources ? `\n\n## Quellen\n${sources}` : ""}\n\n(Zuletzt geändert ${row.updated_at.slice(0, 10)}${row.edited_by_user ? ", vom Menschen selbst bearbeitet" : ""})`;
}

export async function linkSearch(wallet: string, query: string): Promise<string> {
  const rows = (await store.listPageRows(wallet, { withBody: true })).filter((r) => r.kind !== "core");
  const hits = searchPages(rows, query, 6);
  return hits.length ? JSON.stringify(hits, null, 1) : "Keine Treffer im Wiki.";
}

/** Appends one durable statement to the notes page, marked with where it came from. */
export async function linkRemember(wallet: string, text: string, source: string): Promise<void> {
  const clean = scrubSecrets(text.replace(/\s+/g, " ").trim()).slice(0, 600);
  if (clean.length < 4) throw new Error("Der Text ist zu kurz.");
  const row = await store.getPageRow(wallet, "notes");
  const body = `${row?.body?.trim() ? `${row.body.trim()}\n` : ""}- ${clean} (über ${source}, ${today()})`;
  await store.upsertPage(wallet, {
    slug: "notes", kind: "notes", title: row?.title ?? "Notizen",
    summary: row?.summary || "Was du deinem Assistenten ausdrücklich gesagt hast: Vorlieben, Anweisungen und Fakten.",
    body, editedByUser: row?.edited_by_user ?? false,
  });
}

/** Stores (or replaces, by title) a context document; the next wiki update reads it as authoritative. */
export async function linkPushContext(wallet: string, title: string, text: string): Promise<{ replaced: boolean; chars: number }> {
  const content = scrubSecrets(text.trim()).slice(0, MAX_PUSH_CHARS);
  if (content.length < 40) throw new Error("Der Text ist zu kurz (mindestens 40 Zeichen).");
  const name = (title.trim() || "Kontext aus Claude").slice(0, 80);
  const existing = (await store.listImports(wallet)).find((i) => i.kind === "claude" && i.title === name);
  if (existing) {
    const res = await db().from("persona_imports").update({ content, updated_at: new Date().toISOString() }).eq("wallet", wallet).eq("id", existing.id);
    if (res.error) throw new Error(`[chat/persona] update import: ${res.error.message}`);
    return { replaced: true, chars: content.length };
  }
  if ((await store.listImports(wallet)).length >= MAX_IMPORTS) throw new Error("Es sind schon 12 Importe gespeichert. Aktualisiere einen vorhandenen (gleicher Titel) oder lösch einen in Ortis Studio.");
  await store.addImport(wallet, "claude", name, content);
  return { replaced: false, chars: content.length };
}

export async function linkSuggestions(wallet: string): Promise<string> {
  const rows = await store.listSuggestionRows(wallet);
  if (!rows.length) return "Zurzeit gibt es keine offenen Vorschläge.";
  return rows.map((r) => `- [${r.kind === "routine" ? "Routine" : "Aufgabe"}] ${r.title}${r.reason ? ` · ${r.reason}` : ""} (${r.group_title})`).join("\n");
}

/** The prompt the person gives their Claude once the connector is added. */
export const SYNC_PROMPT = `Du bist jetzt mit meinem Ortis-Wiki verbunden (Werkzeuge ortis_*). Ortis ist mein zweiter Assistent; er kennt mich aus E-Mail, Kalender und meinem Wiki. Ich möchte, dass ihr beide denselben Stand über mich habt.

Bitte jetzt einmal abgleichen:
1. Lies mit ortis_profile, was Ortis über mich weiß, und lies die Seiten goals und projects mit ortis_read.
2. Vergleiche das mit allem, was du über mich weißt: gespeicherte Erinnerungen, Projektanweisungen, frühere Unterhaltungen, und (falls du gerade in einem Projektordner arbeitest) Dateien wie CLAUDE.md oder deine Notizen dort.
3. Schreib alles, was Ortis fehlt oder falsch hat, als ein geordnetes Dokument und übergib es mit ortis_push_context (Titel „Kontext aus Claude“). Gliedere es so: Wer ich bin · Woran ich arbeite (je Projekt: Ziel, Stand mit Datum, nächste Schritte, Beteiligte) · Wie ich arbeite und was ich bevorzuge · Wie ich Antworten haben möchte · Was sich zuletzt geändert hat · Was Ortis falsch annimmt. Bleib bei Tatsachen, nenne Daten, lass Passwörter, Schlüssel und Privates über Dritte weg.
4. Sag mir danach in fünf Zeilen, was du übergeben hast und was du aus dem Ortis-Wiki Neues über mich gelernt hast.

Ab jetzt, in jeder Unterhaltung:
- Wenn ich etwas Dauerhaftes über mich sage oder dich korrigiere, halte es zusätzlich mit ortis_remember fest (ein Satz).
- Wenn sich bei einem Projekt der Stand deutlich ändert, aktualisiere „Kontext aus Claude“ mit ortis_push_context (gleicher Titel ersetzt die alte Fassung).
- Wenn du Hintergrund zu meinen Projekten, Zielen oder Kontakten brauchst, schau zuerst mit ortis_search oder ortis_read nach, statt zu raten.`;
