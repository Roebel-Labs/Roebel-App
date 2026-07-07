import { generateObject } from "ai"
import { anthropic } from "@ai-sdk/anthropic"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { gatherNewsletterContent, type NewsletterSourceData } from "./gather"
import { sendDraftReadyEmail } from "./transactional"
import { sanitizeNewsletterHtml } from "./sanitize"

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

function buildDataBlock(data: NewsletterSourceData): string {
  // URLs vorberechnen, damit das Modell nur noch verlinken muss (nie raten).
  // Artikelbilder als serverseitig quadratisch zugeschnittene Variante (Supabase render/image).
  const toSquare = (url: string | null) =>
    url && url.includes("/storage/v1/object/public/")
      ? url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") +
        "?width=600&height=600&resize=cover&quality=80"
      : null
  const news = data.news.map((n) => ({
    title: n.title,
    excerpt: n.excerpt,
    category: n.category,
    url: `${BASE_URL}/news/${n.slug}`,
    img_1x1: toSquare(n.cover_image_url),
  }))
  const events = data.events.map((e) => ({ ...e, url: `${BASE_URL}/events/${e.id}` }))
  return `DATEN SEIT ${data.windowStart}:

NEUIGKEITEN (jede mit fertiger url):
${JSON.stringify(news, null, 2)}

KOMMENDE VERANSTALTUNGEN (nächste 14 Tage, jede mit fertiger url):
${JSON.stringify(events, null, 2)}

BÜRGERBETEILIGUNG / ABSTIMMUNGEN (Übersichtsseite: ${BASE_URL}/proposals):
${JSON.stringify(data.proposals, null, 2)}

NEUE MARKTPLATZ-ANGEBOTE (Übersichtsseite: ${BASE_URL}/app/marktplatz):
${JSON.stringify(data.listings, null, 2)}

NEUE GEWERBE IN DER APP:
${JSON.stringify(data.businesses, null, 2)}

BELIEBTE COMMUNITY-BEITRÄGE (ohne Namensnennung zitieren/zusammenfassen):
${JSON.stringify(data.posts, null, 2)}`
}

const HARD_RULES = `TONALITÄT: Warm, bürgernah, norddeutsch-locker (ein "Moin" zur Begrüßung passt). Kurze Sätze. Du-Form. Kein Amtsdeutsch, kein Marketing-Sprech.

HARTE REGELN:
- Nutze AUSSCHLIESSLICH die bereitgestellten Daten. Erfinde nichts dazu — keine Termine, keine Zahlen, keine Namen, keine URLs.
- Niemals Wallet-Adressen (0x…) erwähnen.
- Niemals "CRC", "Circles" oder Krypto-Jargon — die Stadtwährung heißt ausschließlich "Röbel-Taler".
- Erlaubte HTML-Tags im Abschnitts-HTML: <p>, <ul>, <li>, <a>, <strong>, <em>, <img>. Keine Überschriften im HTML (die kommen aus "heading").
- Hat eine Neuigkeit ein Bild (Feld "img_1x1"), setze GENAU dieses Bild direkt vor ihre Erwähnung: <img src="IMG_1X1_URL">. Keine anderen Bildquellen, nichts an der URL ändern.
- VERLINKE KONSEQUENT: Jede erwähnte Neuigkeit und jede erwähnte Veranstaltung bekommt ihren Link aus dem Datenfeld "url" (<a href="URL">Titel</a>). Erwähnst du Abstimmungen, verlinke die Übersichtsseite; erwähnst du Marktplatz-Angebote, verlinke deren Übersichtsseite.
- Leere Datenquellen lässt du einfach weg — kein "diese Woche gab es keine…".
- SCHREIBSTIL: Klingt wie ein Mensch aus Röbel, nicht wie eine KI. Keine Gedankenstriche (– oder —) als Stilmittel und keine mit "-" abgesetzten Einschübe; nutze Kommas oder mach zwei Sätze draus. Keine Floskeln wie "Tauche ein", "Egal ob ... oder ...", "Lass dich überraschen". Nicht jede Aufzählung als <ul>-Liste; erzähl lieber im Fließtext.
- Zum Schluss ein kurzer, freundlicher Abschied (1-2 Sätze).`

function buildPrompt(data: NewsletterSourceData): string {
  return `Du schreibst den wöchentlichen E-Mail-Newsletter der Röbel App für die Kleinstadt Röbel/Müritz.

${HARD_RULES}

${buildDataBlock(data)}

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
    const { data: existingDraft, error: draftCheckError } = await supabase
      .from("newsletter_issues")
      .select("id")
      .eq("status", "draft")
      .eq("generated_by", "ai")
      .limit(1)
      .maybeSingle()
    if (draftCheckError) {
      console.error("[Newsletter] draft check failed:", draftCheckError)
      return { created: false, reason: "Entwurfs-Prüfung fehlgeschlagen — bitte erneut versuchen." }
    }
    if (existingDraft) {
      return { created: false, reason: "Es existiert bereits ein unversendeter KI-Entwurf." }
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
      content_html: sanitizeNewsletterHtml(sectionsToHtml(object.sections)),
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
  const { data: issue, error: lookupError } = await supabase
    .from("newsletter_issues")
    .select("id, status")
    .eq("id", issueId)
    .maybeSingle()
  if (lookupError) {
    console.error("[Newsletter] issue lookup failed:", lookupError)
    return { success: false, message: "Datenbankfehler — bitte erneut versuchen." }
  }
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
      content_html: sanitizeNewsletterHtml(sectionsToHtml(object.sections)),
      generated_by: "ai",
      generation_sources: sourceCounts(data),
      updated_at: new Date().toISOString(),
    })
    .eq("id", issueId)
  if (error) return { success: false, message: "Speichern fehlgeschlagen." }
  return { success: true, message: "Entwurf neu generiert." }
}


const editSchema = z.object({
  subject: z.string().describe("Betreffzeile (unverändert lassen, wenn die Anweisung nichts anderes verlangt)"),
  preheader: z.string().describe("Vorschautext (unverändert lassen, wenn die Anweisung nichts anderes verlangt)"),
  html: z.string().describe("Der vollständige überarbeitete Newsletter-Body als HTML (h2, h3, p, ul, li, a, strong, em, hr)"),
})

export async function editIssueContentWithAI(
  issueId: string,
  instruction: string
): Promise<{ success: boolean; message: string }> {
  const supabase = createAdminClient()
  const { data: issue, error: lookupError } = await supabase
    .from("newsletter_issues")
    .select("id, status, subject, preheader, content_html")
    .eq("id", issueId)
    .maybeSingle()
  if (lookupError) {
    console.error("[Newsletter] issue lookup failed:", lookupError)
    return { success: false, message: "Datenbankfehler — bitte erneut versuchen." }
  }
  if (!issue) return { success: false, message: "Ausgabe nicht gefunden." }
  if (issue.status !== "draft") {
    return { success: false, message: "Nur Entwürfe können bearbeitet werden." }
  }

  const data = await gatherNewsletterContent()
  const { object } = await generateObject({
    model: anthropic("claude-sonnet-5"),
    schema: editSchema,
    prompt: `Du überarbeitest den wöchentlichen E-Mail-Newsletter der Röbel App nach einer Anweisung der Redaktion.

${HARD_RULES}

AKTUELLER STAND:
Betreff: ${issue.subject}
Vorschautext: ${issue.preheader ?? ""}
Body-HTML:
${issue.content_html}

${buildDataBlock(data)}

ANWEISUNG DER REDAKTION:
${instruction}

Führe NUR diese Anweisung aus und lass alles andere inhaltlich unverändert. Gib den vollständigen überarbeiteten Body als HTML zurück (mit <h2>-Abschnittsüberschriften und <hr> zwischen Abschnitten, wie im aktuellen Stand).`,
    maxOutputTokens: 8000,
  })

  const { error } = await supabase
    .from("newsletter_issues")
    .update({
      subject: object.subject,
      preheader: object.preheader,
      content_html: sanitizeNewsletterHtml(object.html),
      updated_at: new Date().toISOString(),
    })
    .eq("id", issueId)
    .eq("status", "draft")
  if (error) return { success: false, message: "Speichern fehlgeschlagen." }
  return { success: true, message: "Entwurf mit KI überarbeitet." }
}
