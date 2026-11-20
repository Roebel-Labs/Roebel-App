// Persona data access (service role). Every function scopes by wallet.
import { db, isUuid } from "../store";
import type { RoutineSchedule } from "../types";
import type {
  Checkpoint, ImportMeta, Page, PageFact, PageKind, PageMeta, PageSource, PersonMeta, PersonaStage, PersonaState,
  PersonaUpdate, Suggestion, SuggestionSectionKey,
} from "./types";

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`[chat/persona] ${what}: ${res.error.message}`);
  return res.data as T;
}

// ---- pages -----------------------------------------------------------------------

export interface PageRow {
  wallet: string; slug: string; kind: PageKind; title: string; summary: string; parent: string | null; body: string;
  facts: PageFact[] | null; sources: PageSource[] | null;
  meta: { email?: string | null; name?: string; description?: string; priority?: number } | null;
  edited_by_user: boolean; created_at: string; updated_at: string;
}

export const toMeta = (r: PageRow): PageMeta => ({
  slug: r.slug, kind: r.kind, title: r.title, summary: r.summary, parent: r.parent, updatedAt: r.updated_at, editedByUser: r.edited_by_user,
});
export const toPage = (r: PageRow): Page => ({
  ...toMeta(r), body: r.body, facts: Array.isArray(r.facts) ? r.facts : [], sources: Array.isArray(r.sources) ? r.sources : [],
});
export const toPerson = (r: PageRow): PersonMeta => ({
  slug: r.slug, name: r.meta?.name ?? r.title, email: r.meta?.email ?? null,
  description: r.meta?.description ?? r.summary, priority: r.meta?.priority ?? 0,
});

export async function listPageRows(wallet: string, opts: { withBody?: boolean } = {}): Promise<PageRow[]> {
  const cols = opts.withBody ? "*" : "wallet, slug, kind, title, summary, parent, meta, edited_by_user, created_at, updated_at";
  const res = await db().from("persona_pages").select(cols).eq("wallet", wallet).order("created_at");
  return must(res, "list pages") as unknown as PageRow[];
}

export async function getPageRow(wallet: string, slug: string): Promise<PageRow | null> {
  const res = await db().from("persona_pages").select("*").eq("wallet", wallet).eq("slug", slug).maybeSingle();
  return must(res, "get page") as PageRow | null;
}

export async function upsertPage(wallet: string, page: {
  slug: string; kind: PageKind; title: string; summary: string; parent?: string | null; body: string;
  facts?: PageFact[]; sources?: PageSource[]; meta?: PageRow["meta"]; editedByUser?: boolean;
}): Promise<PageRow> {
  const res = await db().from("persona_pages").upsert({
    wallet, slug: page.slug, kind: page.kind, title: page.title.slice(0, 120), summary: page.summary.slice(0, 400),
    parent: page.parent ?? null, body: page.body.slice(0, 40_000), facts: page.facts ?? [], sources: page.sources ?? [],
    meta: page.meta ?? {}, edited_by_user: page.editedByUser ?? false, updated_at: new Date().toISOString(),
  }, { onConflict: "wallet,slug" }).select("*").single();
  return must(res, "upsert page") as PageRow;
}

export async function deletePage(wallet: string, slug: string): Promise<boolean> {
  const res = await db().from("persona_pages").delete().eq("wallet", wallet).eq("slug", slug).select("slug");
  return (must(res, "delete page") as unknown[]).length > 0;
}

// ---- updates ---------------------------------------------------------------------

export async function addUpdate(wallet: string, text: string): Promise<void> {
  must(await db().from("persona_updates").insert({ wallet, text: text.slice(0, 2000) }), "add update");
}

export async function listUpdates(wallet: string, limit = 30): Promise<PersonaUpdate[]> {
  const res = await db().from("persona_updates").select("at, text").eq("wallet", wallet).order("at", { ascending: false }).limit(limit);
  return must(res, "list updates") as PersonaUpdate[];
}

// ---- job -------------------------------------------------------------------------

export interface JobRow {
  wallet: string; state: PersonaState; mode: "full" | "refresh"; stage: PersonaStage | null; progress: number;
  error: string | null; attempts: number; checkpoint: Checkpoint | null; lease_until: string | null;
  started_at: string | null; built_at: string | null; updated_at: string;
}

export async function getJob(wallet: string): Promise<JobRow | null> {
  const res = await db().from("persona_jobs").select("*").eq("wallet", wallet).maybeSingle();
  return must(res, "get job") as JobRow | null;
}

export async function startJob(wallet: string, mode: "full" | "refresh", since: string | null): Promise<JobRow> {
  const now = new Date().toISOString();
  const res = await db().from("persona_jobs").upsert({
    wallet, state: "building", mode, stage: "collect", progress: 0.02, error: null, attempts: 0,
    checkpoint: { mode, since }, lease_until: null, started_at: now, updated_at: now,
  }, { onConflict: "wallet" }).select("*").single();
  return must(res, "start job") as JobRow;
}

/**
 * Takes the lease when the job is building and nobody holds it. Returns the row or null.
 * The guarded UPDATE is atomic; the row is read back afterwards because PostgREST
 * re-applies the lease filter to the returned rows (the new lease no longer matches it).
 */
export async function claimJob(wallet: string, now: Date, leaseMs: number): Promise<JobRow | null> {
  // A few random milliseconds make this claim's lease value distinguishable from a concurrent one.
  const lease = new Date(now.getTime() + leaseMs + Math.floor(Math.random() * 1000));
  const res = await db().from("persona_jobs")
    .update({ lease_until: lease.toISOString(), updated_at: now.toISOString() })
    .eq("wallet", wallet).eq("state", "building")
    .or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`);
  if (res.error) throw new Error(`[chat/persona] claim job: ${res.error.message}`);
  const job = await getJob(wallet);
  if (!job || job.state !== "building" || !job.lease_until) return null;
  return Date.parse(job.lease_until) === lease.getTime() ? job : null;
}

export async function patchJob(wallet: string, patch: Partial<{
  state: PersonaState; stage: PersonaStage | null; progress: number; error: string | null; attempts: number;
  checkpoint: Checkpoint | null; leaseUntil: string | null; builtAt: string;
}>): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.state !== undefined) update.state = patch.state;
  if (patch.stage !== undefined) update.stage = patch.stage;
  if (patch.progress !== undefined) update.progress = patch.progress;
  if (patch.error !== undefined) update.error = patch.error;
  if (patch.attempts !== undefined) update.attempts = patch.attempts;
  if (patch.checkpoint !== undefined) update.checkpoint = patch.checkpoint;
  if (patch.leaseUntil !== undefined) update.lease_until = patch.leaseUntil;
  if (patch.builtAt !== undefined) update.built_at = patch.builtAt;
  must(await db().from("persona_jobs").update(update).eq("wallet", wallet), "patch job");
}

export async function dueJobWallets(now: Date, limit = 5): Promise<string[]> {
  const res = await db().from("persona_jobs").select("wallet").eq("state", "building")
    .or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`).order("updated_at").limit(limit);
  return (must(res, "due jobs") as { wallet: string }[]).map((r) => r.wallet);
}

/** Wallets whose wiki is older than `olderThan` (for the daily refresh). */
export async function staleWallets(olderThan: Date, limit = 3): Promise<string[]> {
  const res = await db().from("persona_jobs").select("wallet").eq("state", "ready")
    .lt("built_at", olderThan.toISOString()).lt("updated_at", olderThan.toISOString()).order("built_at").limit(limit);
  return (must(res, "stale jobs") as { wallet: string }[]).map((r) => r.wallet);
}

// ---- imports ---------------------------------------------------------------------

interface ImportRow { id: string; kind: ImportMeta["kind"]; title: string; content?: string; created_at: string; chars?: number }

export async function listImports(wallet: string, opts: { withContent?: boolean } = {}): Promise<(ImportMeta & { content?: string })[]> {
  const res = await db().from("persona_imports").select("id, kind, title, content, created_at").eq("wallet", wallet).order("created_at");
  return (must(res, "list imports") as ImportRow[]).map((r) => ({
    id: r.id, kind: r.kind, title: r.title, chars: (r.content ?? "").length, createdAt: r.created_at,
    ...(opts.withContent ? { content: r.content ?? "" } : {}),
  }));
}

export async function addImport(wallet: string, kind: ImportMeta["kind"], title: string, content: string): Promise<ImportMeta> {
  const res = await db().from("persona_imports").insert({ wallet, kind, title: title.slice(0, 80), content })
    .select("id, kind, title, created_at").single();
  const r = must(res, "add import") as ImportRow;
  return { id: r.id, kind: r.kind, title: r.title, chars: content.length, createdAt: r.created_at };
}

export async function deleteImport(wallet: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const res = await db().from("persona_imports").delete().eq("wallet", wallet).eq("id", id).select("id");
  return (must(res, "delete import") as unknown[]).length > 0;
}

// ---- suggestions -----------------------------------------------------------------

export interface SuggestionRow {
  id: string; wallet: string; group_title: string; kind: "task" | "routine"; title: string; reason: string; prompt: string;
  schedule: RoutineSchedule | null; people: { name: string; slug: string }[] | null; status: string; sort: number;
  section?: SuggestionSectionKey; section_title?: string; quick?: boolean; fresh?: boolean;
}

export const toSuggestion = (r: SuggestionRow): Suggestion => ({
  id: r.id, kind: r.kind, title: r.title, reason: r.reason, prompt: r.prompt, schedule: r.schedule ?? null,
  people: Array.isArray(r.people) ? r.people : [],
  quick: Boolean(r.quick), fresh: Boolean(r.fresh),
});

export async function listSuggestionRows(wallet: string): Promise<SuggestionRow[]> {
  const res = await db().from("persona_suggestions").select("*").eq("wallet", wallet).eq("status", "new").order("sort");
  return must(res, "list suggestions") as SuggestionRow[];
}

export async function getSuggestionRow(wallet: string, id: string): Promise<SuggestionRow | null> {
  if (!isUuid(id)) return null;
  const res = await db().from("persona_suggestions").select("*").eq("wallet", wallet).eq("id", id).maybeSingle();
  return must(res, "get suggestion") as SuggestionRow | null;
}

export async function setSuggestionStatus(wallet: string, id: string, status: "dismissed" | "started"): Promise<void> {
  must(await db().from("persona_suggestions").update({ status }).eq("wallet", wallet).eq("id", id), "suggestion status");
}

/** Replaces the open suggestions with a fresh set (dismissed/started rows stay as history). */
export async function replaceSuggestions(wallet: string, items: Omit<SuggestionRow, "id" | "wallet" | "status">[]): Promise<void> {
  must(await db().from("persona_suggestions").delete().eq("wallet", wallet).eq("status", "new"), "clear suggestions");
  if (!items.length) return;
  must(await db().from("persona_suggestions").insert(items.map((s) => ({ ...s, wallet, status: "new" }))), "insert suggestions");
}

// ---- tombstones ------------------------------------------------------------------

export async function addTombstone(wallet: string, key: string): Promise<void> {
  const k = key.trim().toLowerCase().slice(0, 200);
  if (!k) return;
  must(await db().from("persona_tombstones").upsert({ wallet, key: k }, { onConflict: "wallet,key" }), "tombstone");
}

export async function listTombstones(wallet: string): Promise<Set<string>> {
  const res = await db().from("persona_tombstones").select("key").eq("wallet", wallet).limit(500);
  return new Set((must(res, "tombstones") as { key: string }[]).map((r) => r.key));
}

// ---- wipe ------------------------------------------------------------------------

export async function wipePersona(wallet: string): Promise<void> {
  for (const table of ["persona_pages", "persona_updates", "persona_imports", "persona_suggestions", "persona_tombstones", "persona_jobs"]) {
    must(await db().from(table).delete().eq("wallet", wallet), `wipe ${table}`);
  }
}
