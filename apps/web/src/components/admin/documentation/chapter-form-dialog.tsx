"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import {
  createChapterUploadTarget,
  finalizeCreateChapter,
  finalizeUpdateChapter,
} from "@/app/actions/documentation"
import type { DocumentationChapter } from "@/lib/supabase-documentation"

const BUCKET = "documentation"

interface ChapterFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set, the dialog edits this chapter; otherwise it creates a new one. */
  chapter?: DocumentationChapter | null
  onSaved: () => void
}

export function ChapterFormDialog({
  open,
  onOpenChange,
  chapter,
  onSaved,
}: ChapterFormDialogProps) {
  const isEdit = Boolean(chapter)
  const [title, setTitle] = useState(chapter?.title ?? "")
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Reset local state whenever the dialog opens for a different chapter.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setTitle(chapter?.title ?? "")
      setFile(null)
    }
    onOpenChange(next)
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Bitte einen Titel eingeben")
      return
    }
    if (!isEdit && !file) {
      toast.error("Bitte eine PDF-Datei auswählen")
      return
    }

    setSubmitting(true)
    const loadingToast = toast.loading(
      file ? "PDF wird hochgeladen…" : isEdit ? "Kapitel wird gespeichert…" : "Kapitel wird erstellt…"
    )

    try {
      // If a PDF was selected, upload it DIRECTLY from the browser to Supabase
      // Storage via a signed URL — this avoids the Server Action body limit
      // (Vercel ~4.5MB) that otherwise returns a 413.
      let uploaded: { path: string; publicUrl: string } | null = null
      if (file) {
        const target = await createChapterUploadTarget(file.name, isEdit ? chapter!.id : undefined)
        if (!target.success) {
          toast.error("Fehler", { id: loadingToast, description: target.error })
          setSubmitting(false)
          return
        }

        const supabase = createClient()
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .uploadToSignedUrl(target.path, target.token, file, {
            contentType: "application/pdf",
          })
        if (uploadError) {
          toast.error("Upload fehlgeschlagen", {
            id: loadingToast,
            description: uploadError.message,
          })
          setSubmitting(false)
          return
        }

        uploaded = { path: target.path, publicUrl: target.publicUrl }

        // For a new chapter, reuse the id the upload target was created under.
        if (!isEdit) {
          const result = await finalizeCreateChapter({
            id: target.id,
            title: title.trim(),
            storage_path: uploaded.path,
            pdf_url: uploaded.publicUrl,
          })
          finishSave(result, loadingToast)
          return
        }
      }

      // Edit (rename and/or replace), or create without a separate upload step.
      const result = isEdit
        ? await finalizeUpdateChapter(chapter!.id, {
            title: title.trim(),
            storage_path: uploaded?.path,
            pdf_url: uploaded?.publicUrl,
          })
        : // Should not reach here: create always has a file (guarded above).
          { success: false, error: "PDF-Datei ist erforderlich" }

      finishSave(result, loadingToast)
    } catch (err) {
      console.error("Chapter save failed:", err)
      toast.error("Fehler", { id: loadingToast, description: "Speichern fehlgeschlagen" })
      setSubmitting(false)
    }
  }

  const finishSave = (
    result: { success: boolean; message?: string; error?: string },
    loadingToast: string | number
  ) => {
    setSubmitting(false)
    if (result.success) {
      toast.success(isEdit ? "Kapitel gespeichert" : "Kapitel erstellt", {
        id: loadingToast,
        description: result.message,
      })
      onOpenChange(false)
      onSaved()
    } else {
      toast.error("Fehler", { id: loadingToast, description: result.error })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Kapitel bearbeiten" : "Neues Kapitel"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Titel ändern oder die PDF-Datei ersetzen. Die erste Seite wird als Vorschau angezeigt."
              : "Titel eingeben und die PDF-Datei des Kapitels hochladen. Die erste Seite wird als Vorschau verwendet."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="chapter-title">Titel</Label>
            <Input
              id="chapter-title"
              placeholder="z. B. Röbel App für Bürger"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="chapter-pdf">
              PDF-Datei {isEdit && <span className="text-muted-foreground">(optional — nur zum Ersetzen)</span>}
            </Label>
            <Input
              id="chapter-pdf"
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                Leer lassen, um die aktuelle Datei beizubehalten.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Speichern…" : isEdit ? "Speichern" : "Erstellen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ChapterFormDialog
