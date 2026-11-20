// "Was ist neu": the public changelog of the Röbel App. Posts are news articles
// in category App-Update, written from the development history and published by a human.
import type { Metadata } from "next"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { EventsHeader } from "@/components/events/events-header"
import { NewsletterSignupForm } from "@/app/newsletter/signup-form"
import { hasSupabase } from "@/lib/record"
import { APP_UPDATE_CATEGORY } from "@/lib/app-updates/commits"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Was ist neu | Röbel App",
  description: "Alle Neuerungen der Röbel App: was dazugekommen ist, was besser geworden ist und was als Nächstes kommt.",
  alternates: { types: { "application/rss+xml": "/neu/feed.xml" } },
}

type UpdateRow = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  cover_image_url: string | null
  published_at: string
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })
}

export default async function WhatsNewPage() {
  let updates: UpdateRow[] = []
  if (hasSupabase) {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("news_articles")
      .select("id, slug, title, excerpt, cover_image_url, published_at")
      .eq("status", "published")
      .eq("category", APP_UPDATE_CATEGORY)
      .order("published_at", { ascending: false })
      .limit(100)
    if (error) console.error("[Neu] updates fetch failed:", error.message)
    updates = (data as UpdateRow[] | null) ?? []
  }

  return (
    <div className="min-h-screen bg-white">
      <EventsHeader />
      <main className="mx-auto max-w-2xl px-4 pt-12 pb-20">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#00498B]">Röbel App</p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900 md:text-4xl">Was ist neu</h1>
        <p className="mt-3 text-gray-600">
          Die Röbel App wird offen entwickelt. Hier steht, was dazugekommen ist und was besser
          geworden ist. Jeden Beitrag kannst du dir auch vorlesen lassen.
        </p>

        <section className="mt-8 rounded-2xl border border-[#B4B8C1]/60 bg-gray-50 p-5">
          <h2 className="text-base font-semibold text-gray-900">Per E-Mail auf dem Laufenden bleiben</h2>
          <p className="mt-1 mb-4 text-sm text-gray-600">
            Einmal pro Woche: Neues aus der App und aus Röbel. Kostenlos, jederzeit abbestellbar.
          </p>
          {hasSupabase ? (
            <NewsletterSignupForm />
          ) : (
            <p className="text-sm text-gray-600">Der Newsletter ist in diesem Fork nicht verfügbar.</p>
          )}
        </section>

        <ol className="mt-12 space-y-10">
          {updates.length === 0 && (
            <li className="text-gray-500">Der erste Beitrag erscheint in Kürze.</li>
          )}
          {updates.map((update) => (
            <li key={update.id} className="border-l-2 border-[#00498B]/20 pl-5">
              <time dateTime={update.published_at} className="text-sm text-[#6B7280]">
                {formatDate(update.published_at)}
              </time>
              <h2 className="mt-1 text-xl font-semibold text-gray-900">
                <Link href={`/news/${update.slug}`} className="hover:text-[#00498B]">
                  {update.title}
                </Link>
              </h2>
              {update.excerpt && <p className="mt-2 text-gray-600">{update.excerpt}</p>}
              <Link
                href={`/news/${update.slug}`}
                className="mt-3 inline-block text-sm font-medium text-[#00498B] underline-offset-4 hover:underline"
              >
                Lesen oder anhören
              </Link>
            </li>
          ))}
        </ol>

        <p className="mt-14 text-sm text-gray-500">
          Lieber im Feed-Reader?{" "}
          <a href="/neu/feed.xml" className="underline">
            RSS-Feed abonnieren
          </a>
          .
        </p>
      </main>
    </div>
  )
}
