"use client"

import Link from "next/link"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import type { DocumentationChapter } from "@/lib/supabase-documentation"

// react-pdf renders the page-1 cover client-side only (pdf.js worker).
const PdfThumbnail = dynamic(
  () => import("@/components/documentation/pdf-thumbnail").then((m) => m.PdfThumbnail),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> }
)

interface DocumentationGridProps {
  chapters: DocumentationChapter[]
}

export function DocumentationGrid({ chapters }: DocumentationGridProps) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {chapters.map((chapter, index) => (
        <Link
          key={chapter.id}
          href={`/dokumentation/${chapter.slug}`}
          className="group block overflow-hidden rounded-[10px] border border-border bg-card transition-shadow hover:shadow-lg"
        >
          {/* A4 cover (page 1) */}
          <div className="flex aspect-[1/1.414] items-center justify-center overflow-hidden bg-muted">
            <PdfThumbnail url={chapter.pdf_url} width={420} />
          </div>
          <div className="p-5">
            <span className="text-sm font-medium text-muted-foreground">
              Kapitel {index + 1}
            </span>
            <h2 className="mt-1 text-lg font-medium text-foreground group-hover:text-[#00498B]">
              {chapter.title}
            </h2>
          </div>
        </Link>
      ))}
    </div>
  )
}

export default DocumentationGrid
