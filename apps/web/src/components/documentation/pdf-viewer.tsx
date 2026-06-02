"use client"

import { Download, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PdfViewerProps {
  url: string
  title: string
}

/**
 * Inline PDF reader. Uses the browser's native PDF viewer via <iframe>, which
 * is reliable on desktop and Android. iOS Safari renders iframes weakly, so we
 * always surface prominent "open in new tab" + download actions as the
 * reliable mobile path. No pdf.js / worker dependency here.
 */
export function PdfViewer({ url, title }: PdfViewerProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            Im Vollbild öffnen
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href={url} download>
            <Download className="mr-2 h-4 w-4" />
            Herunterladen
          </a>
        </Button>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-border bg-muted">
        <iframe
          src={url}
          title={title}
          className="h-[80vh] w-full"
          loading="lazy"
        />
      </div>

      <p className="text-center text-xs text-muted-foreground sm:hidden">
        Falls das Dokument hier nicht angezeigt wird, tippe auf „Im Vollbild öffnen“.
      </p>
    </div>
  )
}

export default PdfViewer
