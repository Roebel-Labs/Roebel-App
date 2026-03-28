"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Bell, Send, History, Smartphone, CheckCircle, XCircle, Apple, Smartphone as AndroidIcon, TrendingUp } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { getNotificationStats, getRecentNotifications, getDeliveryStats } from "@/app/actions/push-notifications"
import type { PushNotificationStats, NotificationLogEntry } from "@/types/push-notifications"

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "Gerade eben"
  if (diffMins < 60) return `vor ${diffMins} Min.`
  if (diffHours < 24) return `vor ${diffHours} Std.`
  return `vor ${diffDays} Tag${diffDays > 1 ? "en" : ""}`
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

interface DeliveryStatsData {
  totalDelivered: number
  totalFailed: number
  totalPending: number
}

export default function NotificationsOverviewPage() {
  const [stats, setStats] = useState<PushNotificationStats | null>(null)
  const [deliveryStats, setDeliveryStats] = useState<DeliveryStatsData | null>(null)
  const [recentNotifications, setRecentNotifications] = useState<NotificationLogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      const [statsResult, recentResult, deliveryResult] = await Promise.all([
        getNotificationStats(),
        getRecentNotifications(5),
        getDeliveryStats(),
      ])

      if (statsResult.success && statsResult.data) {
        setStats(statsResult.data)
      }
      if (recentResult.success && recentResult.data) {
        setRecentNotifications(recentResult.data)
      }
      if (deliveryResult.success && deliveryResult.data) {
        setDeliveryStats(deliveryResult.data)
      }
      setIsLoading(false)
    }

    loadData()
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium">Push-Benachrichtigungen</h1>
          <p className="text-sm text-muted-foreground">Verwalten Sie Push-Benachrichtigungen für die mobile App</p>
        </div>
        <Link href="/admin/dashboard/notifications/send">
          <Button>
            <Send className="h-4 w-4 mr-2" />
            Neue Benachrichtigung
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <Card key={i} className="bg-card border border-border shadow-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card className="bg-card border border-border shadow-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Aktive Geräte</CardTitle>
                <Smartphone className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-medium">{stats?.activeDevices || 0}</div>
                <p className="text-xs text-muted-foreground">von {stats?.totalDevices || 0} registriert</p>
              </CardContent>
            </Card>

            <Card className="bg-card border border-border shadow-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Plattformen</CardTitle>
                <div className="flex gap-1">
                  <Apple className="h-4 w-4 text-muted-foreground" />
                  <AndroidIcon className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-medium">
                  {stats?.iosDevices || 0} / {stats?.androidDevices || 0}
                </div>
                <p className="text-xs text-muted-foreground">iOS / Android</p>
              </CardContent>
            </Card>

            <Card className="bg-card border border-border shadow-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Heute gesendet</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-medium">{stats?.sentToday || 0}</div>
                <p className="text-xs text-muted-foreground">Benachrichtigungen</p>
              </CardContent>
            </Card>

            <Card className="bg-card border border-border shadow-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Fehlgeschlagen</CardTitle>
                <XCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-medium text-red-600">{stats?.failedToday || 0}</div>
                <p className="text-xs text-muted-foreground">heute</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Quick Actions & Preference Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <Card className="bg-card border border-border shadow-none">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Schnellaktionen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/admin/dashboard/notifications/send" className="block">
              <Button variant="outline" className="w-full justify-start">
                <Send className="h-4 w-4 mr-2" />
                Benachrichtigung senden
              </Button>
            </Link>
            <Link href="/admin/dashboard/notifications/history" className="block">
              <Button variant="outline" className="w-full justify-start">
                <History className="h-4 w-4 mr-2" />
                Alle Logs anzeigen
              </Button>
            </Link>
            <Link href="/admin/dashboard/notifications/devices" className="block">
              <Button variant="outline" className="w-full justify-start">
                <Smartphone className="h-4 w-4 mr-2" />
                Geräte verwalten
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Preference Stats */}
        <Card className="bg-card border border-border shadow-none lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Benachrichtigungspräferenzen</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{stats?.eventsEnabled || 0} Geräte</p>
                    <p className="text-xs text-muted-foreground">Events aktiviert</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{stats?.newsEnabled || 0} Geräte</p>
                    <p className="text-xs text-muted-foreground">News aktiviert</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delivery Stats - Last 7 Days */}
      <Card className="bg-card border border-border shadow-none">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">Zustellungsstatistiken</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Letzte 7 Tage (basierend auf Expo Push Receipts)</p>
          </div>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-3 gap-4">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : deliveryStats ? (
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-2xl font-medium text-green-600">{deliveryStats.totalDelivered}</p>
                <p className="text-xs text-green-700">Zugestellt</p>
              </div>
              <div className="p-4 bg-red-50 rounded-lg">
                <p className="text-2xl font-medium text-red-600">{deliveryStats.totalFailed}</p>
                <p className="text-xs text-red-700">Fehlgeschlagen</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-2xl font-medium text-muted-foreground">
                  {deliveryStats.totalDelivered + deliveryStats.totalFailed > 0
                    ? Math.round(
                        (deliveryStats.totalDelivered /
                          (deliveryStats.totalDelivered + deliveryStats.totalFailed)) *
                          100
                      )
                    : 0}
                  %
                </p>
                <p className="text-xs text-foreground">Erfolgsrate</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Noch keine Zustellungsdaten verfügbar. Klicken Sie in der Historie auf &quot;Aktualisieren&quot; um den Status abzurufen.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Recent Notifications */}
      <Card className="bg-card border border-border shadow-none">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Letzte Benachrichtigungen</CardTitle>
          <Link href="/admin/dashboard/notifications/history">
            <Button variant="ghost" size="sm">
              Alle anzeigen
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-48 mb-2" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentNotifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Noch keine Benachrichtigungen gesendet</p>
          ) : (
            <div className="space-y-4">
              {recentNotifications.map((notification) => (
                <div key={notification.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        {getTypeBadge(notification.notification_type)}
                        <span className="font-medium text-sm">{notification.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">{notification.body}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <p className="text-sm">
                        {notification.tokens_sent} / {notification.tokens_sent + notification.tokens_failed}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatRelativeTime(notification.created_at)}</p>
                    </div>
                    {getStatusBadge(notification.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
