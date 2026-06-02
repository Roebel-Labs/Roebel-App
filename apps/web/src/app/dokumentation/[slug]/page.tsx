import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { getChapterBySlug } from "@/lib/supabase-documentation"
import { PdfViewer } from "@/components/documentation/pdf-viewer"
import { WorkInProgressNotice } from "@/components/documentation/work-in-progress-notice"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const chapter = await getChapterBySlug(slug)
  return {
    title: chapter ? `${chapter.title} — Dokumentation` : "Dokumentation",
  }
}

export default async function ChapterPage({ params }: PageProps) {
  const { slug } = await params
  const chapter = await getChapterBySlug(slug)

  if (!chapter) notFound()

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-6">
          <Link
            href="/dokumentation"
            className="mb-3 inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Alle Kapitel
          </Link>
          <h1 className="text-3xl font-medium text-foreground">{chapter.title}</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <WorkInProgressNotice />
        </div>
        <PdfViewer url={chapter.pdf_url} title={chapter.title} />
      </main>
    </div>
  )
}
