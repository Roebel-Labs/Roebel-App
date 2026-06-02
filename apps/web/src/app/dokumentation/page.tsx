import type { Metadata } from "next"
import { BookOpen } from "lucide-react"
import { getChapters } from "@/lib/supabase-documentation"
import { DocumentationGrid } from "@/components/documentation/documentation-grid"
import { ShareQr } from "@/components/documentation/share-qr"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Dokumentation — Röbel App",
  description: "Die Röbel App im Überblick — alle Funktionen als Kapitel zum Durchlesen.",
}

export default async function DokumentationPage() {
  const chapters = await getChapters()

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex flex-col gap-6 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-4xl font-medium text-foreground">Dokumentation</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Die Röbel App im Überblick — wähle ein Kapitel, um es direkt im Browser zu lesen
              oder herunterzuladen.
            </p>
          </div>
          {/* Share QR so attendees can pass it on */}
          <div className="hidden shrink-0 sm:block">
            <ShareQr path="/dokumentation" size={120} />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        {chapters.length === 0 ? (
          <div className="rounded-[10px] border border-border bg-card py-20 text-center">
            <BookOpen className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">Die Dokumentation wird gerade vorbereitet.</p>
          </div>
        ) : (
          <DocumentationGrid chapters={chapters} />
        )}
      </main>
    </div>
  )
}
