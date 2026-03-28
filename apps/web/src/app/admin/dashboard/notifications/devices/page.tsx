"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { ArrowLeft, Search, RefreshCw, Smartphone, Apple, Ban, CheckCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { toast } from "sonner"
import { getDevices, deactivateToken, reactivateToken } from "@/app/actions/push-notifications"
import type { PushToken, DeviceFilter } from "@/types/push-notifications"

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

function truncate(str: string, length: number = 20): string {
  if (str.length <= length) return str
  return str.slice(0, length) + "..."
}

export default function DeviceManagementPage() {
  const [devices, setDevices] = useState<PushToken[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [platformFilter, setPlatformFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage] = useState(0)
  const pageSize = 20

  const loadDevices = useCallback(async () => {
    setIsLoading(true)

    const filters: DeviceFilter = {
      limit: pageSize,
      offset: page * pageSize,
    }

    if (searchTerm) {
      filters.search = searchTerm
    }
    if (platformFilter !== "all") {
      filters.platform = platformFilter as "ios" | "android"
    }
    if (statusFilter !== "all") {
      filters.isActive = statusFilter === "active"
    }

    const result = await getDevices(filters)

    if (result.success && result.data) {
      setDevices(result.data)
      setTotal(result.total || 0)
    }

    setIsLoading(false)
  }, [searchTerm, platformFilter, statusFilter, page])

  useEffect(() => {
    loadDevices()
  }, [loadDevices])

  const handleDeactivate = async (deviceId: string) => {
    const result = await deactivateToken(deviceId)
    if (result.success) {
      toast.success("Gerät deaktiviert")
      loadDevices()
    } else {
      toast.error(result.error || "Fehler beim Deaktivieren")
    }
  }

  const handleReactivate = async (deviceId: string) => {
    const result = await reactivateToken(deviceId)
    if (result.success) {
      toast.success("Gerät reaktiviert")
      loadDevices()
    } else {
      toast.error(result.error || "Fehler beim Reaktivieren")
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  // Calculate stats
  const activeCount = devices.filter((d) => d.is_active).length
  const iosCount = devices.filter((d) => d.platform === "ios").length
  const androidCount = devices.filter((d) => d.platform === "android").length

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
          <h1 className="text-2xl font-medium">Geräteverwaltung</h1>
          <p className="text-sm text-muted-foreground">Registrierte Push-Token verwalten</p>
        </div>
        <Button variant="outline" onClick={loadDevices} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Aktualisieren
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border border-border shadow-none">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-medium">{activeCount}</p>
                <p className="text-sm text-muted-foreground">Aktive Geräte</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-none">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <Apple className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-medium">{iosCount}</p>
                <p className="text-sm text-muted-foreground">iOS Geräte</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-none">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-50 rounded-lg">
                <Smartphone className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-medium">{androidCount}</p>
                <p className="text-sm text-muted-foreground">Android Geräte</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-card border border-border shadow-none">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Device ID suchen..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setPage(0)
                  }}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="w-40">
              <Select
                value={platformFilter}
                onValueChange={(v) => {
                  setPlatformFilter(v)
                  setPage(0)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Plattform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Plattformen</SelectItem>
                  <SelectItem value="ios">iOS</SelectItem>
                  <SelectItem value="android">Android</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v)
                  setPage(0)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Status</SelectItem>
                  <SelectItem value="active">Aktiv</SelectItem>
                  <SelectItem value="inactive">Inaktiv</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground self-center">
              {total} Gerät{total !== 1 ? "e" : ""} gefunden
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
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-4 w-48 flex-1" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>
          ) : devices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">Keine Geräte gefunden</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium text-sm">Device ID</th>
                    <th className="pb-3 font-medium text-sm">Plattform</th>
                    <th className="pb-3 font-medium text-sm">Token</th>
                    <th className="pb-3 font-medium text-sm">Letzte Aktivität</th>
                    <th className="pb-3 font-medium text-sm">Status</th>
                    <th className="pb-3 font-medium text-sm"></th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((device) => (
                    <tr key={device.id} className="border-b last:border-0 hover:bg-accent">
                      <td className="py-3">
                        <code className="text-xs bg-muted px-2 py-1 rounded">{truncate(device.device_id, 16)}</code>
                      </td>
                      <td className="py-3">
                        {device.platform === "ios" ? (
                          <Badge variant="outline" className="gap-1">
                            <Apple className="h-3 w-3" /> iOS
                          </Badge>
                        ) : device.platform === "android" ? (
                          <Badge variant="outline" className="gap-1">
                            <Smartphone className="h-3 w-3" /> Android
                          </Badge>
                        ) : (
                          <Badge variant="outline">Unbekannt</Badge>
                        )}
                      </td>
                      <td className="py-3">
                        <code className="text-xs text-muted-foreground">{truncate(device.expo_push_token, 30)}</code>
                      </td>
                      <td className="py-3 text-sm text-muted-foreground">{formatRelativeTime(device.last_used_at)}</td>
                      <td className="py-3">
                        {device.is_active ? (
                          <Badge className="bg-green-100 text-green-800">Aktiv</Badge>
                        ) : (
                          <Badge className="bg-muted text-foreground">Inaktiv</Badge>
                        )}
                      </td>
                      <td className="py-3">
                        {device.is_active ? (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                                <Ban className="h-4 w-4 mr-1" />
                                Deaktivieren
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Gerät deaktivieren?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Das Gerät wird keine Push-Benachrichtigungen mehr erhalten. Diese Aktion kann
                                  rückgängig gemacht werden.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeactivate(device.device_id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Deaktivieren
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-600 hover:text-green-700"
                            onClick={() => handleReactivate(device.device_id)}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Reaktivieren
                          </Button>
                        )}
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
