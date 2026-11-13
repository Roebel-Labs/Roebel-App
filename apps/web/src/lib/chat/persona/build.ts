// Persona build job: collect → digest → synthesize → people → done.
//
// A build is a small state machine stored in persona_jobs so it survives the
// serverless time limit: every tick claims a lease, runs stages while the
// time budget lasts, saves a checkpoint and releases the lease. The build
// route starts the first tick; the cron (/api/chat/cron/persona) continues it.
//
// The extractor and writer models have NO tools; their only output is a
// schema-constrained object. Untrusted mail text can therefore not act.
import { NoObjectGeneratedError, generateObject } from "ai";
import type { z } from "zod";
import { resolveModelFor, platformCostMicros } from "../models";
import * as chatStore from "../store";
import { validateSchedule } from "../schedule";
import type { ModelRoute } from "../types";
import { loadProfile } from "../harness/context";
import { chunk, isProfileWorthy, nameFromEmail, numberCitations, personSlug, stripCitations } from "./classify";
import type { ContactStat, SourceRef } from "./classify";
import { collectCorpus } from "./collect";
import {
  DIGEST_SYSTEM, PERSON_SYSTEM, PROFILE_SYSTEM, SUGGEST_SYSTEM, SYNTH_SYSTEM, coreSchema, digestPrompt, digestSchema, dossier,
  personPrompt, personSchema, profileSchema, suggestSchema,
} from "./prompts";
import type { SynthInput } from "./prompts";
import * as store from "./store";
import type { Checkpoint, Corpus, DigestFact, PersonaStage, PersonaStatus } from "./types";

const LEASE_MS = 6 * 60_000;
const TICK_BUDGET_MS = 235_000;
const MAX_ATTEMPTS = 3;
const MAILS_PER_CHUNK = 12;
const DIGEST_PARALLEL = 4;
const PEOPLE_PARALLEL = 4;
const MAX_PEOPLE = { full: 12, refresh: 6 } as const;
export const MAX_BUILDS_PER_DAY = 4;

export const STAGE_LABELS: Record<PersonaStage, string> = {
  collect: "Lese gesendete E-Mails, Termine und Importe …",
  digest: "Werte E-Mails aus …",
  synthesize: "Schreibe Übersicht, Ziele, Projekte und Profil …",
  people: "Schreibe die Seiten über deine Kontakte …",
  suggest: "Suche Vorschläge für dich …",
};

// ---- status ----------------------------------------------------------------------

export async function personaStatus(wallet: string): Promise<PersonaStatus> {
  const [job, sources] = await Promise.all([store.getJob(wallet), sourceInfo(wallet)]);
  const state = job?.state ?? "empty";
  return {
    state,
    stage: state === "building" ? job?.stage ?? "collect" : null,
    stageLabel: state === "building" ? STAGE_LABELS[job?.stage ?? "collect"] : null,
    progress: state === "building" ? Math.max(0, Math.min(1, job?.progress ?? 0)) : state === "ready" ? 1 : 0,
    error: job?.error ?? null,
    builtAt: job?.built_at ?? null,
    sources,
  };
}

async function sourceInfo(wallet: string): Promise<PersonaStatus["sources"]> {
  const { listConnectors, secretOf } = await import("../harness/connectors/store");
  const { googleEnabled, hasScope } = await import("../harness/connectors/google");
  const { countMemories } = await import("../harness/memory");
  const [connectors, imports, memories, profile] = await Promise.all([
    listConnectors(wallet, { activeOnly: true }).catch(() => []),
    store.listImports(wallet).catch(() => []),
    countMemories(wallet).catch(() => 0),
    loadProfile(wallet),
  ]);
  const google = googleEnabled() ? connectors.find((c) => c.kind === "google") ?? null : null;
  const scope = google ? secretOf<{ scope?: string }>(google)?.scope : undefined;
  return {
    google: Boolean(google),
    googleMail: Boolean(google) && hasScope(scope, "gmail.readonly"),
    googleCalendar: Boolean(google) && (hasScope(scope, "calendar") || hasScope(scope, "calendar.readonly")),
    roebel: Boolean(profile), imports: imports.length, memories,
  };
}

// ---- model calls -----------------------------------------------------------------

async function callModel<S extends z.ZodTypeAny>(wallet: string, route: ModelRoute, stage: string, opts: {
  schema: S; system: string; prompt: string; maxOutputTokens: number;
}): Promise<z.infer<S>> {
  const resolved = await resolveModelFor(wallet, route);
  try {
    const res = await withSchemaRetry(() => generateObject({
      model: resolved.model, schema: opts.schema, system: opts.system, prompt: opts.prompt,
      maxOutputTokens: opts.maxOutputTokens, maxRetries: 2,
      // Tool mode accepts any JSON schema; the native structured-output mode rejects several keywords.
      providerOptions: { anthropic: { structuredOutputMode: "jsonTool" } },
    }));
    const inputTokens = res.usage?.inputTokens ?? 0;
    const outputTokens = res.usage?.outputTokens ?? 0;
    // route "persona:*" is excluded from the daily chat quota (store.usedTokensToday); the cost is still recorded.
    await chatStore.recordRun({
      wallet, threadId: null, botId: null, route: `persona:${stage}`, inputTokens, outputTokens,
      costMicros: platformCostMicros(resolved, inputTokens, outputTokens), status: "ok", billedTo: resolved.billedTo,
    });
    return res.object as z.infer<S>;
  } catch (err) {
    await chatStore.recordRun({
      wallet, threadId: null, botId: null, route: `persona:${stage}`, inputTokens: 0, outputTokens: 0, costMicros: 0,
      status: "error", error: err instanceof Error ? err.message : String(err), billedTo: resolved.billedTo,
    });
    throw err;
  }
}

/** A model sometimes returns an object that misses the schema; one more try is cheaper than failing the stage. */
async function withSchemaRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!NoObjectGeneratedError.isInstance(err)) throw err;
    console.error("[chat/persona] schema mismatch, retrying once:", String(err.cause ?? err.message).slice(0, 600));
    return run();
  }
}

// ---- helpers ---------------------------------------------------------------------

/** Every ref the writer may cite, with its human-readable label. */
export function knownRefs(corpus: Corpus): Map<string, SourceRef> {
  const known = new Map<string, SourceRef>();
  for (const m of corpus.mails) {
    const who = m.dir === "sent" ? `E-Mail an ${m.to[0] ?? "unbekannt"}${m.to.length > 1 ? ` (+${m.to.length - 1})` : ""}` : `E-Mail von ${m.fromName || m.from}`;
    known.set(m.ref, { ref: m.ref, label: `${who} · „${m.subject || "ohne Betreff"}“`, date: m.date });
  }
  for (const n of corpus.notices) {
    const count = n.count ?? 1;
    known.set(n.ref, { ref: n.ref, label: `${count > 1 ? `${count} Benachrichtigungen` : "Benachrichtigung"} von ${n.sender} · „${n.subject}“`, date: n.date });
  }
  for (const e of corpus.events) known.set(e.ref, { ref: e.ref, label: `Kalender · ${e.title}`, date: e.start.slice(0, 10) });
  for (const i of corpus.imports) known.set(i.ref, { ref: i.ref, label: `Import aus ${i.kind === "claude" ? "Claude" : i.kind === "chatgpt" ? "ChatGPT" : "eigenem Text"}${i.title ? ` · ${i.title}` : ""}`, date: null });
  known.set("r1", { ref: "r1", label: "Profil in der Röbel-App", date: null });
  known.set("m1", { ref: "m1", label: "Von dir im Chat gesagt", date: null });
  return known;
}

function profileContacts(corpus: Corpus, tombstones: Set<string>, max: number): ContactStat[] {
  return corpus.contacts
    .filter((c) => isProfileWorthy(c) && !tombstones.has(c.email) && c.email !== corpus.selfEmail)
    .slice(0, max);
}

const GENERATED = ["overview", "goals", "projects", "profile", "communication-style", "background", "work-patterns"] as const;

// ---- stages ----------------------------------------------------------------------

async function stageCollect(wallet: string, cp: Checkpoint): Promise<PersonaStage> {
  cp.corpus = await collectCorpus(wallet, cp.mode, cp.since ? new Date(cp.since) : null);
  cp.nextChunk = 0;
  cp.facts = [];
  cp.style = [];
  const c = cp.corpus;
  const hasAnything = c.mails.length || c.notices.length || c.events.length || c.imports.length || c.memories.length || c.roebel.length;
  if (!hasAnything) {
    throw new BuildError("Es gibt noch nichts, woraus ich dich kennenlernen kann. Verbinde Google oder importiere dein Gedächtnis aus Claude oder ChatGPT.", true);
  }
  return c.mails.length ? "digest" : "synthesize";
}

async function stageDigest(wallet: string, cp: Checkpoint, deadline: number, save: (progress: number) => Promise<void>): Promise<PersonaStage> {
  const corpus = cp.corpus!;
  // Threads stay together so the extractor sees question and answer side by side.
  const ordered = [...corpus.mails].sort((a, b) => a.threadId.localeCompare(b.threadId) || a.date.localeCompare(b.date));
  const chunks = chunk(ordered, MAILS_PER_CHUNK);
  while ((cp.nextChunk ?? 0) < chunks.length) {
    if (Date.now() > deadline - 45_000) return "digest";
    const start = cp.nextChunk ?? 0;
    const batch = chunks.slice(start, start + DIGEST_PARALLEL);
    const results = await Promise.allSettled(batch.map((mails) => callModel(wallet, "bot-fast", "digest", {
      schema: digestSchema, system: DIGEST_SYSTEM, prompt: digestPrompt(mails, corpus.selfEmail, corpus.selfAliases ?? []), maxOutputTokens: 4000,
    })));
    const refs = new Set(corpus.mails.map((m) => m.ref));
    for (const r of results) {
      if (r.status !== "fulfilled") { console.error("[chat/persona] digest chunk failed", r.reason); continue; }
      for (const f of r.value.facts.slice(0, 40)) {
        if (f.sensitive) continue;
        const ok = f.refs.filter((x) => refs.has(x));
        if (!ok.length) continue;
        cp.facts!.push({ claim: f.claim.slice(0, 400), type: f.type, people: (f.people ?? []).map((p) => p.toLowerCase()).slice(0, 6), date: f.date ?? null, refs: ok.slice(0, 4), basis: f.basis } satisfies DigestFact);
      }
      for (const s of (r.value.style ?? []).slice(0, 8)) cp.style!.push(s.slice(0, 300));
    }
    if (results.every((r) => r.status === "rejected")) throw new Error("Die Auswertung der E-Mails ist fehlgeschlagen.");
    cp.nextChunk = start + batch.length;
    await save(0.2 + 0.35 * (cp.nextChunk / chunks.length));
  }
  cp.facts = cp.facts!.slice(0, 260);
  cp.style = cp.style!.slice(0, 40);
  return "synthesize";
}

async function stageSynthesize(wallet: string, cp: Checkpoint): Promise<PersonaStage> {
  const corpus = cp.corpus!;
  const [tombstones, rows] = await Promise.all([store.listTombstones(wallet), store.listPageRows(wallet, { withBody: true })]);
  const contacts = profileContacts(corpus, tombstones, MAX_PEOPLE[cp.mode]);
  const edited = rows.filter((r) => r.edited_by_user && r.kind !== "core");
  const editedSlugs = new Set(edited.map((r) => r.slug));
  const input: SynthInput = {
    now: new Date(), corpus, facts: cp.facts ?? [], style: cp.style ?? [], profileContacts: contacts,
    editedPages: edited.map((r) => ({ slug: r.slug, title: r.title, body: stripCitations(r.body).slice(0, 4000) })),
    previousPages: cp.mode === "refresh"
      ? rows.filter((r) => !r.edited_by_user && r.kind !== "core" && r.kind !== "person" && r.kind !== "notes")
        .map((r) => ({ slug: r.slug, title: r.title, body: stripCitations(r.body).slice(0, 5000) }))
      : [],
    dismissed: [...tombstones].filter((k) => k.startsWith("suggestion:")).map((k) => k.slice(11)).slice(0, 30),
  };

  const [core, profile, suggest] = await Promise.all([
    callModel(wallet, "bot-smart", "synthesize", { schema: coreSchema, system: SYNTH_SYSTEM, prompt: dossier(input, { forProfile: false }), maxOutputTokens: 9000 }),
    callModel(wallet, "bot-smart", "profile", { schema: profileSchema, system: PROFILE_SYSTEM, prompt: dossier(input, { forProfile: true }), maxOutputTokens: 7000 }),
    // Suggestions are worth their own call, but never worth failing the build.
    callModel(wallet, "bot-smart", "suggest", { schema: suggestSchema, system: SUGGEST_SYSTEM, prompt: dossier(input, { forProfile: false }), maxOutputTokens: 9000 })
      .catch((err) => { console.error("[chat/persona] suggestions failed", err); return null; }),
  ]);

  const known = knownRefs(corpus);
  const pages: { slug: (typeof GENERATED)[number]; kind: "overview" | "goals" | "projects" | "profile" | "profile_section"; title: string; parent: string | null; out: { summary: string; body: string }; facts?: { label: string; value: string }[] }[] = [
    { slug: "overview", kind: "overview", title: "Übersicht", parent: null, out: core.overview, facts: core.overview.facts ?? [] },
    { slug: "goals", kind: "goals", title: "Ziele", parent: null, out: core.goals },
    { slug: "projects", kind: "projects", title: "Projekte", parent: null, out: core.projects },
    { slug: "profile", kind: "profile", title: "Profil", parent: null, out: profile.profile },
    { slug: "communication-style", kind: "profile_section", title: "Kommunikationsstil", parent: "profile", out: profile.communicationStyle },
    { slug: "background", kind: "profile_section", title: "Beruflicher Hintergrund und Projekte", parent: "profile", out: profile.background },
    { slug: "work-patterns", kind: "profile_section", title: "Arbeitsweise und Vorlieben", parent: "profile", out: profile.workPatterns },
  ];
  const changed: string[] = [];
  for (const p of pages) {
    if (editedSlugs.has(p.slug)) continue; // the person's own text wins
    const { body, sources } = numberCitations(p.out.body, known);
    await store.upsertPage(wallet, { slug: p.slug, kind: p.kind, title: p.title, summary: p.out.summary, parent: p.parent, body, facts: (p.facts ?? []).slice(0, 6), sources });
    changed.push(p.slug);
  }
  if (!rows.some((r) => r.slug === "notes")) {
    await store.upsertPage(wallet, {
      slug: "notes", kind: "notes", title: "Notizen", summary: "Was du deinem Assistenten ausdrücklich gesagt hast: Vorlieben, Anweisungen und Fakten.", body: "",
    });
  }
  await store.upsertPage(wallet, {
    slug: "_core", kind: "core", title: "Kurzprofil", summary: "",
    body: `${stripCitations(core.core).trim()}\n\nSo schreibt der Mensch: ${stripCitations(profile.styleCore).trim()}`,
  });

  // The greeting of the day (hidden page; read by /api/chat/persona/briefing).
  await store.upsertPage(wallet, {
    slug: "_briefing", kind: "core", title: "Tagesbriefing", summary: "", body: "",
    facts: (core.briefing ?? []).slice(0, 3).map((b) => ({ label: b.label.trim().slice(0, 40), value: stripCitations(b.text).trim().slice(0, 400) })),
  });

  // Suggestions: fresh set, never the ones the person dismissed. A failed call keeps the old set.
  if (suggest) {
    const bySlug = new Map(contacts.map((c) => [c.email, { name: c.name || nameFromEmail(c.email), slug: personSlug(c.email, c.name) }]));
    const before = new Set((await store.listSuggestionRows(wallet)).map((r) => r.title.trim().toLowerCase()));
    const SECTIONS = { projekt: "projects", zusammenarbeit: "collab", verbessern: "improve", profil: "peers" } as const;
    const peersTitle = (suggest.peersTitle ?? "").trim().slice(0, 60) || "Für Menschen wie dich";
    const seenTitles = new Set<string>();
    const suggestions = suggest.suggestions.slice(0, 30)
      .filter((s) => {
        const key = s.title.trim().toLowerCase();
        if (!key || seenTitles.has(key) || tombstones.has(`suggestion:${key}`)) return false;
        seenTitles.add(key);
        return true;
      })
      .map((s, i) => {
        const schedule = s.kind === "routine" && s.schedule
          ? validateSchedule({ kind: s.schedule.kind, weekday: s.schedule.weekday ?? undefined, hour: s.schedule.hour, minute: s.schedule.minute ?? 0, tz: "Europe/Berlin" })
          : null;
        const kind = (s.kind === "routine" && schedule ? "routine" : "task") as "task" | "routine";
        const section = SECTIONS[s.section] ?? "projects";
        return {
          section, section_title: section === "peers" ? peersTitle : "",
          group_title: (s.group ?? "").trim().slice(0, 80) || "Allgemein",
          kind, quick: kind === "task" && Boolean(s.quick),
          // On the very first set nothing is "new": the badge marks what a later update added.
          fresh: before.size > 0 && !before.has(s.title.trim().toLowerCase()),
          title: s.title.trim().slice(0, 140), reason: (s.reason ?? "").trim().slice(0, 200), prompt: s.prompt.trim().slice(0, 1200),
          schedule, people: (s.people ?? []).map((e) => bySlug.get(e.toLowerCase())).filter((x): x is { name: string; slug: string } => Boolean(x)).slice(0, 4),
          sort: i,
        };
      });
    await store.replaceSuggestions(wallet, suggestions);
  }

  cp.changed = changed;
  cp.peopleQueue = contacts.map((c) => c.email);
  cp.peopleDone = 0;
  cp.updateNote = core.updateNote ?? undefined;
  return cp.peopleQueue.length ? "people" : "suggest";
}

async function stagePeople(wallet: string, cp: Checkpoint, deadline: number, save: (progress: number) => Promise<void>): Promise<PersonaStage> {
  const corpus = cp.corpus!;
  const known = knownRefs(corpus);
  const total = (cp.peopleQueue?.length ?? 0) + (cp.peopleDone ?? 0);
  const profile = await loadProfile(wallet);
  const userName = profile?.displayName ?? null;
  while (cp.peopleQueue && cp.peopleQueue.length) {
    if (Date.now() > deadline - 60_000) return "people";
    const batch = cp.peopleQueue.slice(0, PEOPLE_PARALLEL);
    await Promise.allSettled(batch.map(async (email) => {
      const c = corpus.contacts.find((x) => x.email === email);
      if (!c) return;
      const slug = personSlug(c.email, c.name);
      const existing = await store.getPageRow(wallet, slug);
      if (existing?.edited_by_user) return;
      const out = await callModel(wallet, "bot-smart", "person", {
        schema: personSchema, system: PERSON_SYSTEM, prompt: personPrompt(c, corpus, cp.facts ?? [], userName), maxOutputTokens: 2500,
      });
      const { body, sources } = numberCitations(out.body, known);
      const name = (out.name || c.name || nameFromEmail(c.email)).slice(0, 80);
      const rank = corpus.contacts.indexOf(c);
      await store.upsertPage(wallet, {
        slug, kind: "person", title: name, summary: out.description.slice(0, 200), parent: "people", body,
        facts: [{ label: "E-Mail", value: c.email }, ...(out.facts ?? []).filter((f) => f.label.toLowerCase() !== "e-mail")].slice(0, 6), sources,
        meta: { email: c.email, name, description: out.description.slice(0, 200), priority: 100 - rank },
      });
    }));
    cp.peopleQueue = cp.peopleQueue.slice(batch.length);
    cp.peopleDone = (cp.peopleDone ?? 0) + batch.length;
    await save(0.78 + 0.2 * ((cp.peopleDone ?? 0) / Math.max(1, total)));
  }
  return "suggest";
}

async function finish(wallet: string, cp: Checkpoint): Promise<void> {
  const note = cp.updateNote?.trim();
  const c = cp.corpus;
  const basis = c
    ? [c.counts.sent ? `${c.counts.sent} gesendete E-Mails` : "", c.counts.inboxHuman ? `${c.counts.inboxHuman} E-Mails von Personen` : "",
      c.counts.events ? `${c.counts.events} Termine` : "", c.imports.length ? `${c.imports.length} Import(e)` : ""].filter(Boolean).join(", ")
    : "";
  const lead = cp.mode === "full" ? "Wiki neu aufgebaut" : "Wiki aktualisiert";
  await store.addUpdate(wallet, `${lead}${basis ? ` aus ${basis}` : ""}. ${note ?? ""}${c?.warnings.length ? ` Hinweis: ${c.warnings.join(" ")}` : ""}`.trim());
  await store.patchJob(wallet, {
    state: "ready", stage: null, progress: 1, error: c?.warnings.length ? c.warnings.join(" ") : null, attempts: 0,
    checkpoint: null, leaseUntil: null, builtAt: new Date().toISOString(),
  });
}

class BuildError extends Error {
  constructor(message: string, readonly userFacing = false) { super(message); }
}

// ---- driver ----------------------------------------------------------------------

const STAGE_PROGRESS: Record<PersonaStage, number> = { collect: 0.05, digest: 0.2, synthesize: 0.58, people: 0.78, suggest: 0.98 };

/** Advances one wallet's build as far as the time budget allows. Safe to call concurrently (lease). */
export async function tickPersonaJob(wallet: string, started = Date.now()): Promise<"idle" | "progress" | "done" | "failed"> {
  const job = await store.claimJob(wallet, new Date(), LEASE_MS);
  if (!job) return "idle";
  const deadline = started + TICK_BUDGET_MS;
  const cp: Checkpoint = job.checkpoint ?? { mode: job.mode, since: null };
  let stage: PersonaStage = job.stage ?? "collect";
  const save = async (progress: number) => { await store.patchJob(wallet, { stage, progress, checkpoint: cp }); };
  let first = true;
  try {
    for (;;) {
      // A synthesis call can take two minutes: never start one with less than that left.
      // The first stage of a tick always runs (a fresh tick has the whole budget).
      const needs = stage === "synthesize" ? 170_000 : stage === "collect" ? 90_000 : 60_000;
      if (!first && Date.now() + needs > deadline) break;
      first = false;
      await save(STAGE_PROGRESS[stage]);
      let next: PersonaStage;
      if (stage === "collect") next = await stageCollect(wallet, cp);
      else if (stage === "digest") next = await stageDigest(wallet, cp, deadline, save);
      else if (stage === "synthesize") next = await stageSynthesize(wallet, cp);
      else if (stage === "people") next = await stagePeople(wallet, cp, deadline, save);
      else { await finish(wallet, cp); return "done"; }
      const stalled = next === stage;
      stage = next;
      await store.patchJob(wallet, { stage, progress: STAGE_PROGRESS[stage], checkpoint: cp, attempts: 0 });
      if (stalled) break; // out of time inside a stage; the next tick continues
    }
    await store.patchJob(wallet, { leaseUntil: null });
    return "progress";
  } catch (err) {
    const userFacing = err instanceof BuildError && err.userFacing;
    const attempts = job.attempts + 1;
    console.error(`[chat/persona] build stage ${stage} failed (attempt ${attempts})`, err);
    if (userFacing || attempts >= MAX_ATTEMPTS) {
      await store.patchJob(wallet, {
        state: job.built_at ? "ready" : "error", stage: null, progress: 0, leaseUntil: null, checkpoint: null, attempts,
        error: userFacing ? (err as Error).message : "Der Aufbau des Wikis ist fehlgeschlagen. Bitte versuch es später noch einmal.",
      });
      return "failed";
    }
    await store.patchJob(wallet, { attempts, leaseUntil: null, checkpoint: cp, stage });
    return "progress";
  }
}

export class PersonaBusyError extends Error {}
export class PersonaRateError extends Error {}

/** Starts a build (or reports the running one). */
export async function startPersonaBuild(wallet: string, mode: "full" | "refresh"): Promise<PersonaStatus> {
  const job = await store.getJob(wallet);
  if (job?.state === "building") throw new PersonaBusyError();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const runs = await chatStore.db().from("chat_runs").select("id", { count: "exact", head: true })
    .eq("owner_wallet", wallet).eq("route", "persona:synthesize").eq("status", "ok").gte("created_at", since);
  if ((runs.count ?? 0) >= MAX_BUILDS_PER_DAY) throw new PersonaRateError();
  // A refresh reads what is new since the last build (with a day of overlap); without a wiki it is a full build.
  const effective = mode === "refresh" && job?.built_at ? "refresh" : "full";
  const from = effective === "refresh" ? new Date(new Date(job!.built_at!).getTime() - 2 * 86_400_000).toISOString() : null;
  await store.startJob(wallet, effective, from);
  return personaStatus(wallet);
}

/** Cron: continue running builds, then start the daily refresh for a few stale wikis of active users. */
export async function runPersonaCron(now: Date = new Date()): Promise<{ ticked: number; refreshed: number }> {
  const started = Date.now();
  let ticked = 0;
  for (const wallet of await store.dueJobWallets(now, 3)) {
    if (Date.now() - started > 30_000 && ticked > 0) break;
    await tickPersonaJob(wallet, started).catch((err) => console.error("[chat/persona] tick failed", err));
    ticked++;
  }
  let refreshed = 0;
  if (!ticked) {
    for (const wallet of await store.staleWallets(new Date(now.getTime() - 24 * 3_600_000), 2)) {
      // Only for people who used the assistant in the last three days: nobody pays for a wiki nobody reads.
      const active = await chatStore.db().from("chat_runs").select("id", { count: "exact", head: true })
        .eq("owner_wallet", wallet).not("route", "like", "persona:%").gte("created_at", new Date(now.getTime() - 3 * 86_400_000).toISOString());
      if (!(active.count ?? 0)) {
        // Touch updated_at so the same idle wallet is looked at again in a day, not every minute.
        await store.patchJob(wallet, {});
        continue;
      }
      try { await startPersonaBuild(wallet, "refresh"); refreshed++; } catch { /* busy or rate limited */ }
    }
  }
  return { ticked, refreshed };
}
