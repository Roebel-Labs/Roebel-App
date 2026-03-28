"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { ArrowLeft, Search, RefreshCw, Eye } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { getNotificationLog, fetchDeliveryReceipts } from "@/app/actions/push-notifications"
import type { NotificationLogEntry, NotificationLogFilter } from "@/types/push-notifications"
import { toast } from "sonner"

function formatDateTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getStatusBadge(status: string) {
  switch (status) {
    case "sent":
      return <Badge className="bg-green-100 text-green-800">Gesendet</Badge>
    case "partial":
      return <Badge className="bg-yellow-100 text-yellow-800">Teilweise</Badge>
    case "failed":
      return <Badge className="bg-red-100 text-red-800">Fehlgeschlagen</Badge>
    default:
      return <Badge className="bg-muted text-foreground">Ausstehend</Badge>
  }
}

function getTypeBadge(type: string) {
  switch (type) {
    case "broadcast":
      return <Badge variant="outline">Broadcast</Badge>
    case "category":
      return <Badge variant="outline">Kategorie</Badge>
    case "event_new":
      return <Badge variant="outline">Event</Badge>
    case "news_breaking":
      return <Badge variant="outline">Eilmeldung</Badge>
    case "news_featured":
      return <Badge variant="outline">Featured</Badge>
    case "test":
      return <Badge variant="outline">Test</Badge>
    default:
      return <Badge variant="outline">{type}</Badge>
  }
}

export default function NotificationHistoryPage() {
  const [notifications, setNotifications] = useState<NotificationLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage] = useState(0)
  const [fetchingReceipts, setFetchingReceipts] = useState<string | null>(null)
  const pageSize = 20

  const handleFetchReceipts = async (notificationId: string) => {
    setFetchingReceipts(notificationId)
    try {
      const result = await fetchDeliveryReceipts(notificationId)
      if (result.success) {
        toast.success(`Zugestellt: ${result.delivered}, Fehlgeschlagen: ${result.failed}`)
        // Refresh the list to show updated delivery status
        loadNotifications()
      } else {
        toast.error(result.error || "Fehler beim Abrufen der Zustellungsdaten")
      }
    } catch (error) {
      toast.error("Ein Fehler ist aufgetreten")
    } finally {
      setFetchingReceipts(null)
    }
  }

  const loadNotifications = useCallback(async () => {
    setIsLoading(true)

    const filters: NotificationLogFilter = {
      limit: pageSize,
      offset: page * pageSize,
    }

    if (typeFilter !== "all") {
      filters.type = typeFilter
    }
    if (statusFilter !== "all") {
      filters.status = statusFilter
    }

    const result = await getNotificationLog(filters)

    if (result.success && result.data) {
      setNotifications(result.data)
      setTotal(result.total || 0)
    }

    setIsLoading(false)
  }, [typeFilter, statusFilter, page])

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/dashboard/notifications">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-medium">Benachrichtigungsverlauf</h1>
          <p className="text-sm text-muted-foreground">Alle gesendeten Push-Benachrichtigungen</p>
        </div>
        <Button variant="outline" onClick={loadNotifications} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Aktualisieren
        </Button>
      </div>

      {/* Filters */}
      <Card className="bg-card border border-border shadow-none">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="w-48">
              <Select
                value={typeFilter}
                onValueChange={(v) => {
                  setTypeFilter(v)
                  setPage(0)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Typ filtern" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Typen</SelectItem>
                  <SelectItem value="broadcast">Broadcast</SelectItem>
                  <SelectItem value="category">Kategorie</SelectItem>
                  <SelectItem value="event_new">Event</SelectItem>
                  <SelectItem value="news_breaking">Eilmeldung</SelectItem>
                  <SelectItem value="news_featured">Featured</SelectItem>
                  <SelectItem value="test">Test</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v)
                  setPage(0)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status filtern" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Status</SelectItem>
                  <SelectItem value="sent">Gesendet</SelectItem>
                  <SelectItem value="partial">Teilweise</SelectItem>
                  <SelectItem value="failed">Fehlgeschlagen</SelectItem>
                  <SelectItem value="pending">Ausstehend</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 text-right text-sm text-muted-foreground">
              {total} Benachrichtigung{total !== 1 ? "en" : ""} gefunden
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-card border border-border shadow-none">
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-3 border-b">
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-4 w-48 flex-1" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">Keine Benachrichtigungen gefunden</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium text-sm">Typ</th>
                    <th className="pb-3 font-medium text-sm">Titel</th>
                    <th className="pb-3 font-medium text-sm text-center">Gesendet</th>
                    <th className="pb-3 font-medium text-sm text-center">Zugestellt</th>
                    <th className="pb-3 font-medium text-sm">Status</th>
                    <th className="pb-3 font-medium text-sm">Datum</th>
                    <th className="pb-3 font-medium text-sm"></th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.map((notification) => (
                    <tr key={notification.id} className="border-b last:border-0 hover:bg-accent">
                      <td className="py-3">{getTypeBadge(notification.notification_type)}</td>
                      <td className="py-3">
                        <div>
                          <p className="font-medium text-sm">{notification.title}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">{notification.body}</p>
                        </div>
                      </td>
                      <td className="py-3 text-center text-sm">{notification.tokens_sent}</td>
                      <td className="py-3 text-center text-sm">
                        {notification.delivery_status ? (
                          <span className="text-green-600">
                            {notification.delivery_status.delivered}/{notification.delivery_status.total}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-3">{getStatusBadge(notification.status)}</td>
                      <td className="py-3 text-sm text-muted-foreground">{formatDateTime(notification.created_at)}</td>
                      <td className="py-3">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Benachrichtigungsdetails</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">Typ</p>
                                <div className="mt-1">{getTypeBadge(notification.notification_type)}</div>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">Titel</p>
                                <p className="mt-1">{notification.title}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">Nachricht</p>
                                <p className="mt-1">{notification.body}</p>
                              </div>
                              <div className="grid grid-cols-3 gap-4">
                                <div>
                                  <p className="text-sm font-medium text-muted-foreground">Gesendet</p>
                                  <p className="mt-1 text-lg font-medium text-green-600">{notification.tokens_sent}</p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-muted-foreground">Fehlgeschlagen</p>
                                  <p className="mt-1 text-lg font-medium text-red-600">{notification.tokens_failed}</p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-muted-foreground">Status</p>
                                  <div className="mt-1">{getStatusBadge(notification.status)}</div>
                                </div>
                              </div>

                              {/* Delivery Status Section */}
                              <div className="border-t pt-4">
                                <div className="flex items-center justify-between mb-3">
                                  <p className="text-sm font-medium text-muted-foreground">Zustellungsstatus</p>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleFetchReceipts(notification.id)}
                                    disabled={fetchingReceipts === notification.id || !notification.expo_ticket_ids?.length}
                                  >
                                    <RefreshCw className={`h-3 w-3 mr-1 ${fetchingReceipts === notification.id ? "animate-spin" : ""}`} />
                                    {fetchingReceipts === notification.id ? "Lädt..." : "Aktualisieren"}
                                  </Button>
                                </div>
                                {notification.delivery_status ? (
                                  <div className="grid grid-cols-3 gap-4 p-3 bg-muted rounded-lg">
                                    <div>
                                      <p className="text-xs text-muted-foreground">Zugestellt</p>
                                      <p className="text-lg font-medium text-green-600">{notification.delivery_status.delivered}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Fehlgeschlagen</p>
                                      <p className="text-lg font-medium text-red-600">{notification.delivery_status.failed}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Gesamt</p>
                                      <p className="text-lg font-medium">{notification.delivery_status.total}</p>
                                    </div>
                                    <div className="col-span-3">
                                      <p className="text-xs text-muted-foreground">
                                        Zuletzt geprüft: {formatDateTime(notification.delivery_status.last_checked)}
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground">
                                    {notification.expo_ticket_ids?.length
                                      ? "Klicken Sie auf 'Aktualisieren' um den Zustellungsstatus abzurufen."
                                      : "Keine Ticket-IDs verfügbar (ältere Benachrichtigung)"}
                                  </p>
                                )}
                              </div>

                              {notification.data && (
                                <div>
                                  <p className="text-sm font-medium text-muted-foreground">Daten</p>
                                  <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">
                                    {JSON.stringify(notification.data, null, 2)}
                                  </pre>
                                </div>
                              )}
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">Gesendet am</p>
                                <p className="mt-1">{formatDateTime(notification.created_at)}</p>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t mt-4">
              <p className="text-sm text-muted-foreground">
                Seite {page + 1} von {totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
                  Zurück
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages - 1}
                >
                  Weiter
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
