"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { RichTextEditor } from "@/components/editor/rich-text-editor"
import { ImageUploadDropzone } from "@/components/ui/image-upload-dropzone"
import { ArrowLeft, Save, Eye, Pencil, Send, Sparkles, FlaskConical, Copy } from "lucide-react"
import { toast } from "sonner"
import {
  getIssue, updateIssue, previewIssueEmail, sendTestEmail, regenerateDraft,
  getActiveSubscriberCount, getUnsentSendCount, editDraftWithAI, duplicateIssue, type NewsletterIssue,
} from "@/app/actions/newsletter"
import { sanitizeNewsletterHtml } from "@/lib/newsletter/sanitize"

export default function NewsletterIssueEditorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [issue, setIssue] = useState<NewsletterIssue | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [subject, setSubject] = useState("")
  const [preheader, setPreheader] = useState("")
  const [contentHtml, setContentHtml] = useState("")
  const [heroImageUrl, setHeroImageUrl] = useState("")
  const [showPreview, setShowPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState("")
  const [testEmail, setTestEmail] = useState("")
  const [aiInstruction, setAiInstruction] = useState("")
  const [aiEditing, setAiEditing] = useState(false)
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [sending, setSending] = useState(false)
  const [unsentCount, setUnsentCount] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await getIssue(id)
    if (data) {
      setIssue(data)
      setSubject(data.subject)
      setPreheader(data.preheader ?? "")
      setContentHtml(data.content_html)
      setHeroImageUrl(data.hero_image_url ?? "")
      if (data.status === "sent" || data.status === "failed" || data.status === "sending") {
        setUnsentCount(await getUnsentSendCount(data.id))
      } else {
        setUnsentCount(0)
      }
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const isDraft = issue?.status === "draft"

  async function handleSave(): Promise<boolean> {
    setSaving(true)
    const result = await updateIssue(id, { subject, preheader, content_html: contentHtml, hero_image_url: heroImageUrl || null })
    setSaving(false)
    if (result.success) toast.success(result.message)
    else toast.error(result.message)
    return result.success
  }

  async function handlePreviewToggle() {
    if (!showPreview) {
      if (isDraft) await handleSave()
      setPreviewHtml(await previewIssueEmail(id))
    }
    setShowPreview(!showPreview)
  }

  async function handleTestSend() {
    if (isDraft) await handleSave()
    const result = await sendTestEmail(id, testEmail)
    if (result.success) toast.success(result.message)
    else toast.error(result.message)
  }


  async function handleAiEdit() {
    if (!aiInstruction.trim()) return
    await handleSave()
    setAiEditing(true)
    const t = toast.loading("KI überarbeitet den Entwurf…")
    const result = await editDraftWithAI(id, aiInstruction)
    setAiEditing(false)
    if (result.success) {
      toast.success(result.message, { id: t })
      setAiInstruction("")
      load()
    } else {
      toast.error(result.message, { id: t })
    }
  }


  async function handleDuplicate() {
    const result = await duplicateIssue(id)
    if (result.success && result.issueId) {
      toast.success(result.message)
      router.push(`/admin/dashboard/newsletter/${result.issueId}`)
    } else {
      toast.error(result.message)
    }
  }

  async function handleRegenerate() {
    const t = toast.loading("KI schreibt neu… (kann bis zu einer Minute dauern)")
    const result = await regenerateDraft(id)
    if (result.success) {
      toast.success(result.message, { id: t })
      load()
    } else {
      toast.error(result.message, { id: t })
    }
  }

  async function openSendDialog() {
    setRecipientCount(await getActiveSubscriberCount())
  }

  async function handleSend() {
    if (!(await handleSave())) return
    setSending(true)
    const t = toast.loading("Newsletter wird versendet…")
    try {
      const res = await fetch("/api/newsletter/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId: id }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Gesendet an ${data.sent} Empfänger${data.failed ? `, ${data.failed} fehlgeschlagen` : ""}.`, { id: t })
        load()
      } else {
        toast.error(data.error ?? "Versand fehlgeschlagen.", { id: t })
      }
    } catch {
      toast.error("Versand fehlgeschlagen.", { id: t })
    }
    setSending(false)
  }

  async function handleRetryFailed() {
    setSending(true)
    const t = toast.loading("Fehlgeschlagene werden erneut gesendet…")
    const res = await fetch("/api/newsletter/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueId: id, retryFailedOnly: true }),
    })
    const data = await res.json()
    if (res.ok) toast.success(`${data.sent} erneut gesendet.`, { id: t })
    else toast.error(data.error ?? "Fehlgeschlagen.", { id: t })
    setSending(false)
    load()
  }

  if (loading) return <div className="p-6"><Skeleton className="h-96 w-full rounded-xl" /></div>
  if (!issue) return <div className="p-6 text-gray-500">Ausgabe nicht gefunden.</div>

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/admin/dashboard/newsletter")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {isDraft ? "Ausgabe bearbeiten" : issue.subject || "Ausgabe"}
            </h1>
            {issue.status === "sent" && issue.sent_at && (
              <p className="text-xs text-gray-500">
                Gesendet am {new Date(issue.sent_at).toLocaleString("de-DE")} ·{" "}
                {issue.recipient_count} Empfänger · {issue.delivered_count} zugestellt ·{" "}
                {issue.opened_count} geöffnet · {issue.clicked_count} geklickt · {issue.bounced_count} Bounces
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {isDraft && issue.generated_by === "ai" && (
            <Button variant="outline" onClick={handleRegenerate}>
              <Sparkles className="mr-2 h-4 w-4" /> Neu generieren
            </Button>
          )}
          <Button variant="outline" onClick={handlePreviewToggle}>
            {showPreview ? <Pencil className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
            {showPreview ? "Bearbeiten" : "Vorschau"}
          </Button>
          {isDraft && (
            <>
              <Button variant="outline" onClick={handleSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" /> Speichern
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="bg-[#00498B] hover:bg-[#003a70]" onClick={openSendDialog} disabled={sending}>
                    <Send className="mr-2 h-4 w-4" /> Senden
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Newsletter jetzt versenden?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {recipientCount === null
                        ? "Empfänger werden gezählt…"
                        : `Diese Ausgabe wird sofort an ${recipientCount} aktive Abonnenten gesendet. Das kann nicht rückgängig gemacht werden.`}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSend} disabled={!recipientCount}>
                      Jetzt senden
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
          {!isDraft && (
            <Button variant="outline" onClick={handleDuplicate}>
              <Copy className="mr-2 h-4 w-4" /> Als Entwurf duplizieren
            </Button>
          )}
          {(issue.status === "failed" || issue.status === "sent" || issue.status === "sending") && unsentCount > 0 && (
            <Button variant="outline" onClick={handleRetryFailed} disabled={sending}>
              Fehlgeschlagene erneut senden ({unsentCount})
            </Button>
          )}
        </div>
      </div>

      {showPreview ? (
        <iframe
          srcDoc={previewHtml}
          title="E-Mail-Vorschau"
          sandbox=""
          className="h-[75vh] w-full rounded-xl border border-gray-200 bg-white"
        />
      ) : (
        <div className="space-y-4">
          <div>
            <Label>Header-Bild (optional, volle Breite oben in der E-Mail)</Label>
            <div className="mt-2">
              {isDraft ? (
                <ImageUploadDropzone
                  onUploadComplete={(url) => setHeroImageUrl(url)}
                  currentImageUrl={heroImageUrl}
                  bucketName="news-images"
                  folder="newsletter"
                  maxSizeMB={5}
                />
              ) : heroImageUrl ? (
                <img src={heroImageUrl} alt="Header" className="max-h-48 rounded-xl border border-gray-200" />
              ) : null}
              {isDraft && heroImageUrl && (
                <Button variant="ghost" size="sm" className="mt-1 text-gray-500" onClick={() => setHeroImageUrl("")}>
                  Bild entfernen
                </Button>
              )}
            </div>
          </div>
          <div>
            <Label htmlFor="subject">Betreff</Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!isDraft} placeholder="Betreff der Ausgabe" />
          </div>
          <div>
            <Label htmlFor="preheader">Vorschautext (Preheader)</Label>
            <Input id="preheader" value={preheader} onChange={(e) => setPreheader(e.target.value)} disabled={!isDraft} placeholder="Kurzer Text, der im Posteingang neben dem Betreff erscheint" />
          </div>
          <div>
            <Label>Inhalt</Label>
            {isDraft ? (
              <RichTextEditor content={contentHtml} onChange={setContentHtml} placeholder="Newsletter-Inhalt…" />
            ) : (
              <div className="prose max-w-none rounded-xl border border-gray-200 bg-white p-6" dangerouslySetInnerHTML={{ __html: sanitizeNewsletterHtml(issue.content_html) }} />
            )}
          </div>
          {isDraft && (
            <div className="flex items-end gap-2 rounded-xl border border-[#00498B]/20 bg-[#00498B]/5 p-4">
              <div className="flex-1">
                <Label htmlFor="ai-instruction">Mit KI bearbeiten</Label>
                <Input
                  id="ai-instruction"
                  value={aiInstruction}
                  onChange={(e) => setAiInstruction(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !aiEditing && handleAiEdit()}
                  placeholder='z.B. "Füge Links zu allen erwähnten Veranstaltungen und Abstimmungen hinzu"'
                />
              </div>
              <Button onClick={handleAiEdit} disabled={aiEditing || !aiInstruction.trim()} className="bg-[#00498B] hover:bg-[#003a70]">
                <Sparkles className="mr-2 h-4 w-4" /> Anwenden
              </Button>
            </div>
          )}
          {isDraft && (
            <div className="flex items-end gap-2 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex-1">
                <Label htmlFor="test-email">Test-E-Mail an</Label>
                <Input id="test-email" type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="deine@email.de" />
              </div>
              <Button variant="outline" onClick={handleTestSend}>
                <FlaskConical className="mr-2 h-4 w-4" /> Test senden
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
