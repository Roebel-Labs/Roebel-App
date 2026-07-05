import { generateObject } from "ai"
import { anthropic } from "@ai-sdk/anthropic"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { gatherNewsletterContent, type NewsletterSourceData } from "./gather"
import { sendDraftReadyEmail } from "./transactional"

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://roebel.app"

const newsletterSchema = z.object({
  subject: z.string().describe("Betreffzeile, max 60 Zeichen, neugierig machend, ohne Clickbait"),
  preheader: z.string().describe("Vorschautext, max 90 Zeichen, ergänzt den Betreff"),
  sections: z
    .array(
      z.object({
        heading: z.string().describe("Kurze Abschnittsüberschrift"),
        html: z.string().describe("Abschnitts-Inhalt als HTML (nur p, ul, li, a, strong, em)"),
      })
    )
    .min(2)
    .max(6),
})

function buildPrompt(data: NewsletterSourceData): string {
  return `Du schreibst den wöchentlichen E-Mail-Newsletter der Röbel App für die Kleinstadt Röbel/Müritz.

TONALITÄT: Warm, bürgernah, norddeutsch-locker (ein "Moin" zur Begrüßung passt). Kurze Sätze. Du-Form. Kein Amtsdeutsch, kein Marketing-Sprech.

HARTE REGELN:
- Nutze AUSSCHLIESSLICH die Daten unten. Erfinde nichts dazu — keine Termine, keine Zahlen, keine Namen.
- Niemals Wallet-Adressen (0x…) erwähnen.
- Niemals "CRC", "Circles" oder Krypto-Jargon — die Stadtwährung heißt ausschließlich "Röbel-Taler".
- Erlaubte HTML-Tags im Abschnitts-HTML: <p>, <ul>, <li>, <a>, <strong>, <em>. Keine Überschriften im HTML (die kommen aus "heading").
- News-Artikel verlinkst du als <a href="${BASE_URL}/news/SLUG">Titel</a>.
- Leere Datenquellen lässt du einfach weg — kein "diese Woche gab es keine…".
- Zum Schluss ein kurzer, freundlicher Abschied (1-2 Sätze).

DATEN SEIT ${data.windowStart}:

NEUIGKEITEN (mit slug für Links):
${JSON.stringify(data.news, null, 2)}

KOMMENDE VERANSTALTUNGEN (nächste 14 Tage):
${JSON.stringify(data.events, null, 2)}

BÜRGERBETEILIGUNG / ABSTIMMUNGEN:
${JSON.stringify(data.proposals, null, 2)}

NEUE MARKTPLATZ-ANGEBOTE:
${JSON.stringify(data.listings, null, 2)}

NEUE GEWERBE IN DER APP:
${JSON.stringify(data.businesses, null, 2)}

BELIEBTE COMMUNITY-BEITRÄGE (ohne Namensnennung zitieren/zusammenfassen):
${JSON.stringify(data.posts, null, 2)}

Erstelle daraus den Newsletter dieser Woche.`
}

function sectionsToHtml(sections: Array<{ heading: string; html: string }>): string {
  return sections.map((s) => `<h2>${s.heading}</h2>\n${s.html}`).join("\n<hr>\n")
}

function sourceCounts(data: NewsletterSourceData): Record<string, number> {
  return {
    news: data.news.length,
    events: data.events.length,
    proposals: data.proposals.length,
    listings: data.listings.length,
    businesses: data.businesses.length,
    posts: data.posts.length,
  }
}

/**
 * Pure gather-data -> { subject, preheader, sections } step. Exported (rather than kept
 * module-private) so it can be smoke-tested without performing the DB insert that
 * `generateNewsletterDraft` does — the newsletter tables aren't live on the DB yet.
 */
export async function generateNewsletterContent(data: NewsletterSourceData) {
  const { object } = await generateObject({
    model: anthropic("claude-sonnet-5"),
    schema: newsletterSchema,
    prompt: buildPrompt(data),
    maxOutputTokens: 8000,
  })
  return object
}

export async function generateNewsletterDraft(opts?: {
  force?: boolean
  notify?: boolean
}): Promise<{ created: boolean; issueId?: string; reason?: string }> {
  const supabase = createAdminClient()

  if (!opts?.force) {
    const { data: existingDraft } = await supabase
      .from("newsletter_issues")
      .select("id")
      .eq("status", "draft")
      .limit(1)
      .maybeSingle()
    if (existingDraft) {
      return { created: false, reason: "Es existiert bereits ein unversendeter Entwurf." }
    }
  }

  const data = await gatherNewsletterContent()
  const total = Object.values(sourceCounts(data)).reduce((a, b) => a + b, 0)
  if (total === 0) {
    return { created: false, reason: "Keine Inhalte im Zeitraum gefunden." }
  }

  const object = await generateNewsletterContent(data)
  const { data: issue, error } = await supabase
    .from("newsletter_issues")
    .insert({
      subject: object.subject,
      preheader: object.preheader,
      content_html: sectionsToHtml(object.sections),
      status: "draft",
      generated_by: "ai",
      generation_sources: sourceCounts(data),
    })
    .select("id")
    .single()
  if (error || !issue) {
    console.error("[Newsletter] draft insert failed:", error)
    throw new Error("Entwurf konnte nicht gespeichert werden")
  }

  if (opts?.notify) {
    await sendDraftReadyEmail(issue.id, object.subject)
  }
  return { created: true, issueId: issue.id }
}

export async function regenerateIssueContent(
  issueId: string
): Promise<{ success: boolean; message: string }> {
  const supabase = createAdminClient()
  const { data: issue } = await supabase
    .from("newsletter_issues")
    .select("id, status")
    .eq("id", issueId)
    .maybeSingle()
  if (!issue) return { success: false, message: "Ausgabe nicht gefunden." }
  if (issue.status !== "draft") {
    return { success: false, message: "Nur Entwürfe können neu generiert werden." }
  }

  const data = await gatherNewsletterContent()
  const object = await generateNewsletterContent(data)
  const { error } = await supabase
    .from("newsletter_issues")
    .update({
      subject: object.subject,
      preheader: object.preheader,
      content_html: sectionsToHtml(object.sections),
      generated_by: "ai",
      generation_sources: sourceCounts(data),
      updated_at: new Date().toISOString(),
    })
    .eq("id", issueId)
  if (error) return { success: false, message: "Speichern fehlgeschlagen." }
  return { success: true, message: "Entwurf neu generiert." }
}
