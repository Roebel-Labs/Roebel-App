"use client"

import { useEffect, useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Plus, Edit, Trash2, ArrowUp, ArrowDown, QrCode, ExternalLink, BookOpen } from "lucide-react"
import { toast } from "sonner"
import {
  getChapters,
  type DocumentationChapter,
} from "@/lib/supabase-documentation"
import { deleteChapter, reorderChapter } from "@/app/actions/documentation"
import { ChapterFormDialog } from "@/components/admin/documentation/chapter-form-dialog"
import { ShareQr } from "@/components/documentation/share-qr"

// react-pdf must only run client-side (no SSR) because of the pdf.js worker.
const PdfThumbnail = dynamic(
  () => import("@/components/documentation/pdf-thumbnail").then((m) => m.PdfThumbnail),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> }
)

export default function DokumentationPage() {
  const [chapters, setChapters] = useState<DocumentationChapter[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<DocumentationChapter | null>(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchChapters = useCallback(async () => {
    const data = await getChapters()
    setChapters(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchChapters()
  }, [fetchChapters])

  const handleNew = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const handleEdit = (chapter: DocumentationChapter) => {
    setEditing(chapter)
    setFormOpen(true)
  }

  const handleDelete = async (id: string) => {
    const loadingToast = toast.loading("Kapitel wird gelöscht…")
    const result = await deleteChapter(id)
    if (result.success) {
      toast.success("Kapitel gelöscht", { id: loadingToast, description: result.message })
      fetchChapters()
    } else {
      toast.error("Fehler", { id: loadingToast, description: result.error })
    }
  }

  const handleReorder = async (id: string, direction: "up" | "down") => {
    setBusyId(id)
    const result = await reorderChapter(id, direction)
    setBusyId(null)
    if (result.success) {
      fetchChapters()
    } else {
      toast.error("Fehler", { description: result.error })
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-[10px] border border-border bg-card p-4">
              <div className="flex gap-4">
                <Skeleton className="h-28 w-20 flex-shrink-0 rounded-[8px]" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-medium text-foreground">Dokumentation</h1>
          <p className="mt-1 text-muted-foreground">
            Kapitel als PDF verwalten — hochladen, sortieren, ersetzen
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setQrOpen(true)}>
            <QrCode className="mr-2 h-4 w-4" />
            QR teilen
          </Button>
          <Button onClick={handleNew}>
            <Plus className="mr-2 h-4 w-4" />
            Neues Kapitel
          </Button>
        </div>
      </div>

      {/* Chapter list */}
      <div className="space-y-3">
        {chapters.length === 0 ? (
          <div className="rounded-[10px] border border-border bg-card py-12 text-center">
            <BookOpen className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">Noch keine Kapitel</p>
            <Button variant="link" onClick={handleNew} className="mt-2">
              Erstes Kapitel hinzufügen
            </Button>
          </div>
        ) : (
          chapters.map((chapter, index) => (
            <div
              key={chapter.id}
              className="rounded-[10px] border border-border bg-card p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex gap-4">
                {/* Thumbnail (page 1) */}
                <div className="flex h-28 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-border bg-muted">
                  <PdfThumbnail url={chapter.pdf_url} width={80} />
                </div>

                {/* Content */}
                <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground">
                        {index + 1}.
                      </span>
                      <h3 className="truncate text-lg font-medium">{chapter.title}</h3>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      /{chapter.slug}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Aktualisiert:{" "}
                      {new Date(chapter.updated_at).toLocaleDateString("de-DE", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9"
                      disabled={index === 0 || busyId === chapter.id}
                      onClick={() => handleReorder(chapter.id, "up")}
                      title="Nach oben"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9"
                      disabled={index === chapters.length - 1 || busyId === chapter.id}
                      onClick={() => handleReorder(chapter.id, "down")}
                      title="Nach unten"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <a href={`/dokumentation/${chapter.slug}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-1.5 h-4 w-4" />
                        Ansehen
                      </a>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(chapter)}>
                      <Edit className="mr-1.5 h-4 w-4" />
                      Bearbeiten
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost">
                          <Trash2 className="mr-1.5 h-4 w-4" />
                          Löschen
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Kapitel löschen?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Diese Aktion kann nicht rückgängig gemacht werden. Das Kapitel und
                            seine PDF-Datei werden dauerhaft gelöscht.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(chapter.id)}>
                            Löschen
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create / edit dialog */}
      <ChapterFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        chapter={editing}
        onSaved={fetchChapters}
      />

      {/* QR share dialog (project this on screen at the presentation) */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dokumentation teilen</DialogTitle>
            <DialogDescription>
              QR-Code scannen, um die Dokumentation auf dem Smartphone zu öffnen.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <ShareQr path="/dokumentation" size={256} showUrl />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
