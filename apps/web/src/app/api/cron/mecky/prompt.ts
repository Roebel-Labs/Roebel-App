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
      source_index: z
        .number()
        .int()
        .min(0)
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
  articles: Array<RSSItem & { site: string }>
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
    model: anthropic("claude-sonnet-4-6"),
    schema: MeckyPostsSchema,
    system: MECKY_SYSTEM_PROMPT,
    prompt: `Hier sind die aktuellen Nachrichtenartikel aus der Region. Wähle die 3 relevantesten für Röbel/Müritz aus und schreibe jeweils einen Post in Meckys Stimme.

${articlesText}

Datum heute: ${new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`,
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
