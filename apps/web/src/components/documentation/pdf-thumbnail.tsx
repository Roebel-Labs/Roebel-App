"use client"

import { useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import { FileText } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

// Pin the worker to the exact pdfjs version bundled with react-pdf to avoid
// the "API version does not match Worker version" crash. This is the ONLY
// place pdf.js is used — the reader/download path does not depend on it.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PdfThumbnailProps {
  url: string
  width?: number
}

export function PdfThumbnail({ url, width = 320 }: PdfThumbnailProps) {
  const [error, setError] = useState(false)

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted">
        <FileText className="h-12 w-12 text-muted-foreground" />
      </div>
    )
  }

  return (
    <Document
      file={url}
      onLoadError={() => setError(true)}
      loading={<Skeleton className="h-full w-full" />}
      error={
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <FileText className="h-12 w-12 text-muted-foreground" />
        </div>
      }
    >
      <Page
        pageNumber={1}
        width={width}
        renderTextLayer={false}
        renderAnnotationLayer={false}
        loading={<Skeleton className="h-full w-full" />}
      />
    </Document>
  )
}

export default PdfThumbnail
