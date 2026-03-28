"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Trash2, MessageCircle, Mail, Phone, Smartphone } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { getFeedback, updateFeedbackStatus, deleteFeedback } from "@/app/actions/feedback"
import type {
  Feedback,
  FeedbackType,
  FeedbackStatus,
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUS_COLORS,
  FEEDBACK_TYPE_COLORS,
} from "@/types/feedback"
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
  DialogTrigger,
} from "@/components/ui/dialog"

const FEEDBACK_TYPE_LABELS_MAP: Record<FeedbackType, string> = {
  bug_report: "Bug Report",
  feature_request: "Feature Request",
  general: "Allgemein",
  improvement: "Verbesserung",
}

const FEEDBACK_STATUS_LABELS_MAP: Record<FeedbackStatus, string> = {
  new: "Neu",
  in_review: "In Prüfung",
  resolved: "Gelöst",
  closed: "Geschlossen",
}


export default function FeedbackPage() {
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [filteredFeedback, setFilteredFeedback] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null)

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    new: 0,
    in_review: 0,
    resolved: 0,
  })

  useEffect(() => {
    fetchFeedback()
  }, [])

  useEffect(() => {
    filterFeedback()
    calculateStats()
  }, [feedback, searchTerm, typeFilter, statusFilter])

  const fetchFeedback = async () => {
    try {
      const result = await getFeedback()

      if (result.success && result.data) {
        setFeedback(result.data)
      } else {
        toast.error("Fehler beim Laden des Feedbacks", {
          description: result.error || "Die Daten konnten nicht geladen werden.",
        })
      }
    } catch (error) {
      console.error("Error fetching feedback:", error)
      toast.error("Fehler beim Laden des Feedbacks")
    } finally {
      setLoading(false)
    }
  }

  const filterFeedback = () => {
    let filtered = feedback

    if (searchTerm) {
      filtered = filtered.filter(
        (item) =>
          item.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.user_wallet_address?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (typeFilter !== "all") {
      filtered = filtered.filter((item) => item.feedback_type === typeFilter)
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((item) => item.status === statusFilter)
    }

    setFilteredFeedback(filtered)
  }

  const calculateStats = () => {
    setStats({
      total: feedback.length,
      new: feedback.filter((f) => f.status === "new").length,
      in_review: feedback.filter((f) => f.status === "in_review").length,
      resolved: feedback.filter((f) => f.status === "resolved").length,
    })
  }

  const handleStatusChange = async (id: string, newStatus: FeedbackStatus) => {
    try {
      const result = await updateFeedbackStatus(id, newStatus)

      if (result.success) {
        toast.success("Status aktualisiert", {
          description: result.message,
        })
        fetchFeedback()
      } else {
        toast.error("Fehler", {
          description: result.error,
        })
      }
    } catch (error) {
      console.error("Error updating status:", error)
      toast.error("Fehler beim Aktualisieren des Status")
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const result = await deleteFeedback(id)

      if (result.success) {
        toast.success("Feedback gelöscht", {
          description: result.message,
        })
        fetchFeedback()
      } else {
        toast.error("Fehler", {
          description: result.error,
        })
      }
    } catch (error) {
      console.error("Error deleting feedback:", error)
      toast.error("Fehler beim Löschen")
    }
  }

  const truncateWallet = (wallet: string | null) => {
    if (!wallet) return "Anonym"
    return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Stats Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="bg-card border border-border shadow-none">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-8 w-12" />
                  </div>
                  <Skeleton className="h-4 w-4 rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters Skeleton */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-[200px]" />
          <Skeleton className="h-10 w-[200px]" />
        </div>

        {/* Feedback List Skeleton */}
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-[10px] p-4">
              <div className="flex gap-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <div className="flex gap-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-9 w-20" />
                  <Skeleton className="h-9 w-20" />
                  <Skeleton className="h-9 w-20" />
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
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-card border border-border shadow-none">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Gesamt</p>
                <h3 className="text-2xl font-medium mt-2">{stats.total}</h3>
              </div>
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-none">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Neu</p>
                <h3 className="text-2xl font-medium mt-2">{stats.new}</h3>
              </div>
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-none">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">In Prüfung</p>
                <h3 className="text-2xl font-medium mt-2">{stats.in_review}</h3>
              </div>
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-none">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Gelöst</p>
                <h3 className="text-2xl font-medium mt-2">{stats.resolved}</h3>
              </div>
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suche nach Betreff, Nachricht oder Wallet..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Typ filtern" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Typen</SelectItem>
            <SelectItem value="bug_report">Bug Report</SelectItem>
            <SelectItem value="feature_request">Feature Request</SelectItem>
            <SelectItem value="improvement">Verbesserung</SelectItem>
            <SelectItem value="general">Allgemein</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Status filtern" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="new">Neu</SelectItem>
            <SelectItem value="in_review">In Prüfung</SelectItem>
            <SelectItem value="resolved">Gelöst</SelectItem>
            <SelectItem value="closed">Geschlossen</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Feedback List */}
      <div className="space-y-3">
        {filteredFeedback.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Kein Feedback gefunden</p>
          </div>
        ) : (
          filteredFeedback.map((item) => (
            <div key={item.id} className="bg-card border border-border rounded-[10px] p-4">
              <div className="flex gap-4">
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="text-xs">
                          {FEEDBACK_TYPE_LABELS_MAP[item.feedback_type]}
                        </Badge>
                        <h3 className="font-medium text-base">{item.subject}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{item.message}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mt-2">
                    <div className="flex items-center gap-1">
                      <Smartphone className="h-3 w-3" />
                      <span>{truncateWallet(item.user_wallet_address)}</span>
                    </div>
                    {item.contact_email && (
                      <div className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        <span>{item.contact_email}</span>
                      </div>
                    )}
                    {item.contact_phone && (
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        <span>{item.contact_phone}</span>
                      </div>
                    )}
                    <span>{formatDate(item.created_at)}</span>
                    <Badge variant="outline" className="text-xs">
                      {FEEDBACK_STATUS_LABELS_MAP[item.status]}
                    </Badge>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 flex-shrink-0">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" onClick={() => setSelectedFeedback(item)}>
                          Details
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>{selectedFeedback?.subject}</DialogTitle>
                          <DialogDescription>
                            {selectedFeedback && formatDate(selectedFeedback.created_at)}
                          </DialogDescription>
                        </DialogHeader>
                        {selectedFeedback && (
                          <div className="space-y-4">
                            <div className="flex gap-2">
                              <Badge variant="secondary" className="text-xs">
                                {FEEDBACK_TYPE_LABELS_MAP[selectedFeedback.feedback_type]}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {FEEDBACK_STATUS_LABELS_MAP[selectedFeedback.status]}
                              </Badge>
                            </div>

                            <div>
                              <h4 className="font-medium mb-2">Nachricht</h4>
                              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                {selectedFeedback.message}
                              </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                              <div>
                                <h4 className="font-medium text-sm mb-1">Wallet Address</h4>
                                <p className="text-sm text-muted-foreground break-all">
                                  {selectedFeedback.user_wallet_address || "Anonym"}
                                </p>
                              </div>
                              {selectedFeedback.contact_email && (
                                <div>
                                  <h4 className="font-medium text-sm mb-1">E-Mail</h4>
                                  <p className="text-sm text-muted-foreground">{selectedFeedback.contact_email}</p>
                                </div>
                              )}
                              {selectedFeedback.contact_phone && (
                                <div>
                                  <h4 className="font-medium text-sm mb-1">Telefon</h4>
                                  <p className="text-sm text-muted-foreground">{selectedFeedback.contact_phone}</p>
                                </div>
                              )}
                            </div>

                            {selectedFeedback.device_info && Object.keys(selectedFeedback.device_info).length > 0 && (
                              <div className="pt-4 border-t">
                                <h4 className="font-medium text-sm mb-2">Geräteinformationen</h4>
                                <pre className="text-xs bg-muted p-3 rounded overflow-auto">
                                  {JSON.stringify(selectedFeedback.device_info, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>

                    <Select
                      value={item.status}
                      onValueChange={(value) => handleStatusChange(item.id, value as FeedbackStatus)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">Neu</SelectItem>
                        <SelectItem value="in_review">In Prüfung</SelectItem>
                        <SelectItem value="resolved">Gelöst</SelectItem>
                        <SelectItem value="closed">Geschlossen</SelectItem>
                      </SelectContent>
                    </Select>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Feedback löschen?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Diese Aktion kann nicht rückgängig gemacht werden. Das Feedback wird dauerhaft gelöscht.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(item.id)} className="bg-destructive">
                            Löschen
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
          ))
        )}
      </div>
    </div>
  )
}
