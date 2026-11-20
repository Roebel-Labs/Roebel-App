// "Was ist neu": drafts a product update post from the git history. The post is
// a `news_articles` row in category App-Update, so it shows up in the app's news,
// on /neu, in the newsletter and can be read aloud like every other article.
// A human always publishes: this only ever writes drafts.
import "server-only"
import { generateObject } from "ai"
import { anthropic } from "@ai-sdk/anthropic"
import { z } from "zod"
import { tracked } from "@/lib/ai-usage/tracked"
import { createAdminClient } from "@/lib/supabase/admin"
import { resend, EMAIL_CONFIG } from "@/lib/resend"
import { sanitizeNewsletterHtml } from "@/lib/newsletter/sanitize"
import {
  APP_UPDATE_CATEGORY,
  groupByArea,
  updateSlug,
  userFacingChanges,
  type RawCommit,
  type UserFacingChange,
} from "./commits"

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://roebel.app"
const GH = "https://api.github.com"
const FALLBACK_WINDOW_DAYS = 14
const MAX_WINDOW_DAYS = 45
const MAX_PAGES = 3
/** Fewer noticeable changes than this is not worth a post. */
const MIN_CHANGES = 3
const MAX_CHANGES_IN_PROMPT = 120

function repo(): string {
  return process.env.APP_UPDATES_REPO || process.env.GITHUB_TICKETS_REPO || "Roebel-Labs/Roebel-App"
}

function branches(): string[] {
  return (process.env.APP_UPDATES_BRANCHES || "main")
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean)
}

type GhCommit = { sha: string; commit: { message: string; committer?: { date?: string }; author?: { date?: string } } }

async function fetchBranchCommits(branch: string, since: string): Promise<RawCommit[]> {
  const token = process.env.GITHUB_TICKETS_TOKEN
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  const out: RawCommit[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${GH}/repos/${repo()}/commits?sha=${encodeURIComponent(branch)}&since=${encodeURIComponent(since)}&per_page=100&page=${page}`
    const res = await fetch(url, { headers, cache: "no-store" })
    if (!res.ok) throw new Error(`GitHub ${res.status} beim Laden der Änderungen (${branch})`)
    const rows = (await res.json()) as GhCommit[]
    for (const row of rows) {
      out.push({
        sha: row.sha,
        subject: row.commit.message.split("\n")[0],
        date: row.commit.committer?.date ?? row.commit.author?.date ?? since,
      })
    }
    if (rows.length < 100) break
  }
  return out
}

export async function fetchCommitsSince(since: string): Promise<RawCommit[]> {
  const perBranch = await Promise.all(branches().map((b) => fetchBranchCommits(b, since)))
  const bySha = new Map<string, RawCommit>()
  for (const commit of perBranch.flat()) bySha.set(commit.sha, commit)
  return [...bySha.values()]
}

const updateSchema = z.object({
  title: z.string().describe("Überschrift, max 70 Zeichen, nennt die wichtigste Neuerung beim Namen"),
  excerpt: z.string().describe("Ein bis zwei Sätze Zusammenfassung, max 200 Zeichen"),
  html: z.string().describe("Der Beitrag als HTML (nur h2, p, ul, li, strong, em)"),
})

function buildPrompt(changes: UserFacingChange[], since: string): string {
  const groups = groupByArea(changes.slice(0, MAX_CHANGES_IN_PROMPT)).map((g) => ({
    bereich: g.area,
    aenderungen: g.changes.map((c) => ({ art: c.kind === "feat" ? "neu" : "behoben", notiz: c.text })),
  }))
  return `Du schreibst den Beitrag "Was ist neu" für die Röbel App, die Bürger-App der Kleinstadt Röbel/Müritz. Leser sind Einwohner, Vereine und Gewerbetreibende, keine Entwickler.

Unten stehen die Arbeitsnotizen der Entwickler seit ${since.slice(0, 10)}. Sie sind englisch, knapp und technisch. Deine Aufgabe: daraus erzählen, was sich für die Menschen in Röbel geändert hat.

SO SCHREIBST DU:
- Deutsch, Du-Form, warm und sachlich. Kurze Sätze. Kein Werbe-Ton, keine Superlative.
- Beginne mit dem, was die meisten betrifft. Zwei bis vier Abschnitte mit <h2>, jeweils Fließtext. Eine Liste nur für kleine Verbesserungen und behobene Fehler am Ende.
- Sag bei jeder Neuerung, wo man sie findet und wofür sie gut ist. Wenn die Notiz das nicht hergibt, beschreibe nur, was sie sicher sagt.
- Fasse viele kleine Notizen zum selben Thema zu einer Aussage zusammen. Interne Umbauten, Tests und Infrastruktur lässt du weg.
- Keine Gedankenstriche als Stilmittel, keine Floskeln wie "Tauche ein" oder "Lass dich überraschen".

HARTE REGELN:
- Erfinde nichts. Keine Funktionen, Zahlen, Termine oder Versprechen, die nicht in den Notizen stehen.
- Keine Fachwörter: kein Commit, Branch, API, Backend, OTA, Migration, Smart Contract, Wallet, Blockchain, Token. Keine Dateinamen, keine Versionskürzel, keine Adressen, die mit 0x beginnen.
- Die Münzen der Stadt heißen immer "Röbel Münzen". Nenne sie nie Währung, nie Geld, nie CRC oder Circles.
- Nenne keine Namen von Personen.
- Was nur getestet wird oder noch nicht freigeschaltet ist (Notizen mit "test", "preview", "spike", "wip"), erwähnst du nicht als verfügbar.
- Erlaubtes HTML: <h2>, <p>, <ul>, <li>, <strong>, <em>. Keine Links, keine Bilder.

ARBEITSNOTIZEN NACH BEREICH:
${JSON.stringify(groups, null, 2)}

Schreibe daraus den Beitrag.`
}

async function notifyDraftReady(articleId: string, title: string): Promise<void> {
  if (!resend) return
  const to = process.env.NEWSLETTER_ADMIN_EMAIL || EMAIL_CONFIG.replyTo
  const url = `${BASE_URL}/admin/dashboard/news/${articleId}/edit`
  const { error } = await resend.emails.send({
    from: EMAIL_CONFIG.fromNewsletter,
    to,
    subject: `"Was ist neu"-Entwurf bereit: ${title}`,
    html: `<p style="font-size:15px;line-height:1.6;color:#374151;">Der Entwurf für den nächsten Beitrag "Was ist neu" ist fertig. Bitte prüfen, bei Bedarf anpassen und veröffentlichen. Erst dann erscheint er in der App, auf der Website und im Newsletter.</p><p><a href="${url}" style="display:inline-block;background:#00498B;color:#ffffff;font-size:15px;font-weight:600;padding:12px 24px;border-radius:10px;text-decoration:none;">Entwurf öffnen</a></p>`,
  })
  if (error) console.error("[AppUpdates] draft-ready email failed:", error)
}

export type DraftResult = { created: boolean; articleId?: string; refreshed?: boolean; reason?: string }

/**
 * Drafts (or refreshes the existing unpublished draft of) the next update post.
 * Window: since the last published update, at most MAX_WINDOW_DAYS back.
 */
export async function generateAppUpdateDraft(opts?: { notify?: boolean }): Promise<DraftResult> {
  const supabase = createAdminClient()

  const { data: lastPublished, error: lastError } = await supabase
    .from("news_articles")
    .select("published_at")
    .eq("category", APP_UPDATE_CATEGORY)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastError) throw new Error(`Letzter Beitrag konnte nicht geladen werden: ${lastError.message}`)

  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const earliest = now - MAX_WINDOW_DAYS * day
  const wanted = lastPublished?.published_at
    ? new Date(lastPublished.published_at).getTime()
    : now - FALLBACK_WINDOW_DAYS * day
  const since = new Date(Math.max(wanted, earliest)).toISOString()

  const changes = userFacingChanges(await fetchCommitsSince(since))
  if (changes.length < MIN_CHANGES) {
    return { created: false, reason: "Seit dem letzten Beitrag gab es zu wenig Neues für einen eigenen Beitrag." }
  }

  const { object } = await generateObject({
    model: tracked(anthropic("claude-sonnet-5"), "app-updates.draft"),
    schema: updateSchema,
    prompt: buildPrompt(changes, since),
    maxOutputTokens: 6000,
  })
  const content = sanitizeNewsletterHtml(object.html)

  const { data: existingDraft, error: draftError } = await supabase
    .from("news_articles")
    .select("id")
    .eq("category", APP_UPDATE_CATEGORY)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (draftError) throw new Error(`Entwurfs-Prüfung fehlgeschlagen: ${draftError.message}`)

  if (existingDraft) {
    const { error } = await supabase
      .from("news_articles")
      .update({ title: object.title, excerpt: object.excerpt, content, updated_at: new Date().toISOString() })
      .eq("id", existingDraft.id)
      .eq("status", "draft")
    if (error) throw new Error(`Entwurf konnte nicht aktualisiert werden: ${error.message}`)
    if (opts?.notify) await notifyDraftReady(existingDraft.id, object.title)
    return { created: true, refreshed: true, articleId: existingDraft.id }
  }

  const { data: article, error } = await supabase
    .from("news_articles")
    .insert({
      title: object.title,
      slug: updateSlug(object.title, new Date().toISOString()),
      excerpt: object.excerpt,
      content,
      author_name: "Röbel App",
      category: APP_UPDATE_CATEGORY,
      tags: ["Was ist neu"],
      status: "draft",
      is_featured: false,
    })
    .select("id")
    .single()
  if (error || !article) throw new Error(`Entwurf konnte nicht gespeichert werden: ${error?.message ?? "unbekannt"}`)

  if (opts?.notify) await notifyDraftReady(article.id, object.title)
  return { created: true, articleId: article.id }
}
