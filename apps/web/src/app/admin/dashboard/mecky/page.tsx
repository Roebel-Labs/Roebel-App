"use client"

import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  Bot,
  Check,
  X,
  ExternalLink,
  Newspaper,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"
import {
  getMeckyDrafts,
  approveMeckyDraft,
  rejectMeckyDraft,
  triggerMeckyGeneration,
} from "@/app/actions/mecky"
import type { MeckyDraft } from "@/types/mecky"

export default function MeckyDashboardPage() {
  const [drafts, setDrafts] = useState<MeckyDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [statusFilter, setStatusFilter] = useState("pending")

  const fetchDrafts = useCallback(async () => {
    try {
      const result = await getMeckyDrafts(statusFilter)
      if (result.success && result.data) {
        setDrafts(result.data)
      }
    } catch (error) {
      console.error("Error fetching drafts:", error)
      toast.error("Fehler beim Laden der Mecky-Vorschläge")
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    setLoading(true)
    fetchDrafts()
  }, [fetchDrafts])

  const handleApprove = async (draftId: string) => {
    const loadingToast = toast.loading("Vorschlag wird genehmigt...")

    const result = await approveMeckyDraft(draftId)

    if (result.success) {
      toast.success("Vorschlag genehmigt!", {
        id: loadingToast,
        description: "Der Post ist jetzt im Feed sichtbar.",
      })
      fetchDrafts()
    } else {
      toast.error("Fehler", {
        id: loadingToast,
        description: result.error,
      })
    }
  }

  const handleReject = async (draftId: string) => {
    const loadingToast = toast.loading("Vorschlag wird abgelehnt...")

    const result = await rejectMeckyDraft(draftId)

    if (result.success) {
      toast.success("Vorschlag abgelehnt", {
        id: loadingToast,
      })
      fetchDrafts()
    } else {
      toast.error("Fehler", {
        id: loadingToast,
        description: result.error,
      })
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    const loadingToast = toast.loading("Mecky generiert neue Vorschläge...")

    try {
      const result = await triggerMeckyGeneration()

      if (result.success && result.count && result.count > 0) {
        toast.success(`${result.count} neue Vorschläge generiert!`, {
          id: loadingToast,
          description: "Mecky hat neue Nachrichten für dich.",
        })
        setStatusFilter("pending")
        fetchDrafts()
      } else if (result.success) {
        toast.info(result.message, { id: loadingToast })
      } else {
        toast.error("Fehler", {
          id: loadingToast,
          description: result.message,
        })
      }
    } catch {
      toast.error("Fehler bei der Generierung", { id: loadingToast })
    } finally {
      setGenerating(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            Ausstehend
          </Badge>
        )
      case "approved":
        return (
          <Badge className="bg-green-100 text-green-800 gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Genehmigt
          </Badge>
        )
      case "rejected":
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Abgelehnt
          </Badge>
        )
      default:
        return null
    }
  }

  const pendingCount = drafts.filter((d) => d.status === "pending").length

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-10 w-[180px]" />
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="bg-card border border-border rounded-[10px] p-5"
            >
              <Skeleton className="h-4 w-3/4 mb-2" />
              <Skeleton className="h-3 w-full mb-1" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-medium text-foreground">Mecky Bot</h1>
            <Bot className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground mt-1">
            KI-generierte Nachrichtenvorschläge prüfen und genehmigen
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="gap-2"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {generating ? "Generiert..." : "Jetzt generieren"}
          </Button>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">
              Ausstehend{" "}
              {statusFilter !== "pending" && pendingCount > 0
                ? `(${pendingCount})`
                : ""}
            </SelectItem>
            <SelectItem value="approved">Genehmigt</SelectItem>
            <SelectItem value="rejected">Abgelehnt</SelectItem>
            <SelectItem value="all">Alle</SelectItem>
          </SelectContent>
        </Select>
        </div>
      </div>

      {/* Drafts List */}
      <div className="space-y-3">
        {drafts.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border rounded-[10px]">
            <Bot className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              {statusFilter === "pending"
                ? "Keine ausstehenden Vorschläge"
                : "Keine Vorschläge gefunden"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Mecky generiert täglich um 7 Uhr neue Nachrichtenvorschläge
            </p>
          </div>
        ) : (
          drafts.map((draft) => (
            <div
              key={draft.id}
              className="bg-card border border-border rounded-[10px] p-5 hover:shadow-md transition-shadow"
            >
              {/* Post Content Preview */}
              <div className="mb-3">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    {getStatusBadge(draft.status)}
                    <span className="text-xs text-muted-foreground">
                      {new Date(draft.created_at).toLocaleDateString("de-DE", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                {/* Mecky-style post preview */}
                <div className="bg-muted/50 rounded-lg p-4 border border-border/50">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center overflow-hidden">
                      <img
                        src="/mecky/mecky.png"
                        alt="Mecky"
                        className="h-8 w-8 object-cover"
                      />
                    </div>
                    <div>
                      <span className="text-sm font-medium">Mecky</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        Röbel Bot
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {draft.content}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {draft.content.length}/500 Zeichen
                  </p>
                </div>
              </div>

              {/* Source Info */}
              {draft.source_url && (
                <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
                  <Newspaper className="h-3.5 w-3.5" />
                  <span>
                    Quelle: {draft.source_site} &mdash;{" "}
                    <span className="italic">
                      {draft.source_title?.slice(0, 80)}
                      {(draft.source_title?.length || 0) > 80 ? "..." : ""}
                    </span>
                  </span>
                  <a
                    href={draft.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Öffnen
                  </a>
                </div>
              )}

              {/* Action Buttons */}
              {draft.status === "pending" && (
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Button
                    size="sm"
                    onClick={() => handleApprove(draft.id)}
                    className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                  >
                    <Check className="h-4 w-4" />
                    Genehmigen
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="gap-1.5">
                        <X className="h-4 w-4" />
                        Ablehnen
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Vorschlag ablehnen?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Der Vorschlag wird als abgelehnt markiert und nicht im
                          Feed veröffentlicht.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleReject(draft.id)}
                        >
                          Ablehnen
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}

              {/* Reviewed info */}
              {draft.reviewed_at && (
                <p className="text-xs text-muted-foreground mt-2">
                  Bearbeitet am{" "}
                  {new Date(draft.reviewed_at).toLocaleDateString("de-DE", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
