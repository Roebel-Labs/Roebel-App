import { generateObject } from "ai"
import { anthropic } from "@ai-sdk/anthropic"
import { z } from "zod"
import type { RSSItem } from "./rss"

const MeckyPostsSchema = z.object({
  posts: z.array(
    z.object({
      content: z
        .string()
        .max(500)
        .describe("Der Post-Text in Meckys Stimme, max 500 Zeichen"),
      // NOTE: no .min(0) here — Anthropic's native structured-outputs API
      // (used by @ai-sdk/anthropic v3) rejects the `minimum` JSON-schema
      // keyword on integer types with a 400. Range is validated in code below.
      source_index: z
        .number()
        .int()
        .describe("Index des Nachrichtenartikels aus der Liste (0-basiert)"),
    })
  ),
})

const MECKY_SYSTEM_PROMPT = `Du bist "Mecky", das Maskottchen der Röbel/Müritz Community-App.
Du bist ein kleiner schwarzer Bulle mit einer goldenen Krone. Du lebst in Röbel an der Müritz in Mecklenburg-Vorpommern.

DEINE PERSÖNLICHKEIT:
- Freundlich, warmherzig und nordisch-locker (norddeutsche Freundlichkeit aus MV)
- Gelegentlich Plattdeutsch-Einsprengsel: "Moin!", "Dat is ja klasse!", "Jo, dat geiht!", "Na, wat seggst du?", "Düsse Woch..."
- Aber Hauptsächlich auf Hochdeutsch, damit alle es verstehen
- Stolz auf die Müritz-Region und Röbel
- Kurz und knackig - jeder Post MAXIMAL 500 Zeichen
- Informativ mit einem Augenzwinkern
- Maximal 1-2 Emojis pro Post, nicht übertreiben

DEINE AUFGABE:
Wähle die 3 relevantesten und interessantesten Nachrichten für die Röbel/Müritz-Gemeinde aus.

REGELN:
- KEINE politischen Posts (wirklich nur wenn extrem wichtig für die Region, z.B. Infrastruktur)
- Fokus auf positive, interessante oder wichtige Nachrichten (Veranstaltungen, Wetter, Kultur, Sport, Lokales)
- Wetterwarnungen IMMER aufnehmen (Sicherheit geht vor)
- Nachrichten die direkt Röbel, Müritz, oder die Region betreffen haben Priorität
- Du bist KEIN Journalist - du fasst öffentliche Infos zusammen und verlinkst die Quelle
- Erwähne die Quelle kurz am Ende, z.B. "(via NDR)" oder "(via Nordkurier)"
- Wenn weniger als 3 relevante Nachrichten vorhanden sind, generiere nur so viele wie sinnvoll sind (minimum 1)

BEISPIEL-POSTS:
- "Moin Röbel! 🌊 Am Wochenende wird's sonnig an der Müritz - perfekt für'n Ausflug ans Wasser. Bis zu 24 Grad sind drin! Na, wer kommt mit? (via NDR)"
- "Dat Stadtfest in Waren steht vor der Tür! Vom 15.-17. Juli gibt's Livemusik, Kunsthandwerk und jede Menge Leckeres. Auch für uns Röbler'n Ausflug wert! (via Nordkurier)"
- "Achtung Leute! ⚠️ Der DWD warnt vor starkem Gewitter heute Nachmittag im Müritz-Gebiet. Haltet euch drinnen auf und sichert lose Gegenstände! (via NDR)"`

export type MeckyPostProposal = z.infer<
  typeof MeckyPostsSchema
>["posts"][number]

export async function generateMeckyPosts(
  articles: Array<RSSItem & { site: string }>,
  periodLabel = "letzte 48 Stunden"
): Promise<MeckyPostProposal[]> {
  if (articles.length === 0) {
    console.log("No articles to process for Mecky")
    return []
  }

  const articlesText = articles
    .map(
      (a, i) =>
        `[${i}] ${a.title}\n    ${a.description?.slice(0, 200) || "Keine Beschreibung"}\n    Quelle: ${a.site} | URL: ${a.link}`
    )
    .join("\n\n")

  const { object } = await generateObject({
    model: anthropic("claude-haiku-4-5"),
    schema: MeckyPostsSchema,
    system: MECKY_SYSTEM_PROMPT,
    prompt: `Hier sind die Nachrichtenartikel aus der Region aus dem Zeitraum "${periodLabel}". Wähle die 3 relevantesten für Röbel/Müritz aus und schreibe jeweils einen Post in Meckys Stimme.

${articlesText}

Datum heute: ${new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
Zeitraum der Artikel: ${periodLabel}

Wenn der Zeitraum nicht "heute" ist, formuliere zeitlich passend (z.B. "gestern") statt "heute".`,
  })

  // Validate source indices and content length
  return object.posts.filter((post) => {
    if (post.source_index < 0 || post.source_index >= articles.length) {
      console.warn(
        `Invalid source_index ${post.source_index}, skipping post`
      )
      return false
    }
    if (post.content.length > 500) {
      console.warn(`Post too long (${post.content.length} chars), skipping`)
      return false
    }
    return true
  })
}

const MeckyLinkPostSchema = z.object({
  content: z
    .string()
    .max(500)
    .describe("Der Post-Text in Meckys Stimme, max 500 Zeichen"),
})

/**
 * One post for an article an admin handed in by link. Claude only sees the
 * publisher's share snippet (og:title/og:description) plus the admin's notes,
 * never the article body: some regional publishers (Nordkurier) opt out of AI
 * crawling, so the page itself is not fed to the model.
 */
export async function generateMeckyPostFromLink(article: {
  title: string | null
  description: string | null
  site: string
  url: string
  notes: string | null
}): Promise<string | null> {
  const { object } = await generateObject({
    model: anthropic("claude-haiku-4-5"),
    schema: MeckyLinkPostSchema,
    system: MECKY_SYSTEM_PROMPT,
    prompt: `Ein Admin möchte, dass du diesen Artikel in einem Post erwähnst. Schreibe genau EINEN Post in Meckys Stimme.
Nutze nur die Angaben unten, erfinde keine Zahlen, Daten oder Namen dazu.

Titel: ${article.title || "unbekannt"}
Teaser: ${article.description?.slice(0, 400) || "keiner"}
Quelle: ${article.site} | URL: ${article.url}
Hinweise vom Admin: ${article.notes || "keine"}

Datum heute: ${new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`,
  })

  if (object.content.length > 500) {
    console.warn(`Post too long (${object.content.length} chars), skipping`)
    return null
  }
  return object.content
}
