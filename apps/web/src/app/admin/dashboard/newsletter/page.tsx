"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Sparkles, Plus, Trash2, Mail } from "lucide-react"
import { toast } from "sonner"
import {
  listIssues, generateDraftNow, createBlankIssue, deleteIssue,
  type NewsletterIssue,
} from "@/app/actions/newsletter"
import { NewsletterNav } from "./_components/newsletter-nav"

const STATUS_BADGE: Record<NewsletterIssue["status"], { label: string; className: string }> = {
  draft: { label: "Entwurf", className: "bg-amber-100 text-amber-800" },
  sending: { label: "Wird gesendet…", className: "bg-blue-100 text-blue-800" },
  sent: { label: "Gesendet", className: "bg-green-100 text-green-800" },
  failed: { label: "Fehlgeschlagen", className: "bg-red-100 text-red-800" },
}

export default function NewsletterIssuesPage() {
  const router = useRouter()
  const [issues, setIssues] = useState<NewsletterIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setIssues(await listIssues())
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleGenerate() {
    setGenerating(true)
    const t = toast.loading("KI schreibt den Entwurf… (kann bis zu einer Minute dauern)")
    const result = await generateDraftNow()
    setGenerating(false)
    if (result.success && result.issueId) {
      toast.success("Entwurf erstellt", { id: t })
      router.push(`/admin/dashboard/newsletter/${result.issueId}`)
    } else {
      toast.error(result.message, { id: t })
    }
  }

  async function handleNewBlank() {
    const result = await createBlankIssue()
    if (result.success && result.issueId) {
      router.push(`/admin/dashboard/newsletter/${result.issueId}`)
    } else {
      toast.error("Erstellen fehlgeschlagen")
    }
  }

  async function handleDelete(id: string) {
    const result = await deleteIssue(id)
    if (result.success) {
      toast.success(result.message)
      load()
    } else {
      toast.error(result.message)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Newsletter</h1>
          <p className="text-sm text-gray-500">Wöchentlicher Newsletter — KI-Entwurf, manueller Versand</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleNewBlank}>
            <Plus className="mr-2 h-4 w-4" /> Neue Ausgabe
          </Button>
          <Button onClick={handleGenerate} disabled={generating} className="bg-[#00498B] hover:bg-[#003a70]">
            <Sparkles className="mr-2 h-4 w-4" /> Jetzt generieren
          </Button>
        </div>
      </div>

      <NewsletterNav active="ausgaben" />

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : issues.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#B4B8C1] p-12 text-center text-gray-500">
          <Mail className="mx-auto mb-3 h-8 w-8" />
          Noch keine Ausgaben. Erstelle die erste mit „Jetzt generieren“.
        </div>
      ) : (
        <div className="space-y-3">
          {issues.map((issue) => {
            const badge = STATUS_BADGE[issue.status]
            return (
              <div
                key={issue.id}
                className="flex cursor-pointer items-center justify-between rounded-xl border border-gray-200 bg-white p-4 hover:border-[#00498B]/40"
                onClick={() => router.push(`/admin/dashboard/newsletter/${issue.id}`)}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge className={badge.className}>{badge.label}</Badge>
                    {issue.generated_by === "ai" && (
                      <Badge className="bg-purple-100 text-purple-800">KI</Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate font-medium text-gray-900">
                    {issue.subject || "(Ohne Betreff)"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(issue.created_at).toLocaleDateString("de-DE")}
                    {issue.status === "sent" &&
                      ` · ${issue.recipient_count} Empfänger · ${issue.opened_count} geöffnet · ${issue.clicked_count} geklickt`}
                  </p>
                </div>
                {issue.status === "draft" && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Entwurf löschen?</AlertDialogTitle>
                        <AlertDialogDescription>Das kann nicht rückgängig gemacht werden.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(issue.id)}>Löschen</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
