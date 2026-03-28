"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  Plus,
  Search,
  Edit,
  Trash2,
  CheckCircle,
  RotateCcw,
  AlertTriangle,
  Droplets,
  Construction,
  CloudLightning,
  Flame,
  MapPin,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import {
  deleteServiceAlert,
  resolveServiceAlert,
  reactivateServiceAlert,
  type ServiceAlert,
} from "@/app/actions/alerts"

const alertTypeConfig: Record<string, { label: string; icon: typeof AlertTriangle }> = {
  water_outage: { label: "Wasserausfall", icon: Droplets },
  road_closure: { label: "Straßensperrung", icon: Construction },
  storm_warning: { label: "Sturmwarnung", icon: CloudLightning },
  fire_department: { label: "Feuerwehr", icon: Flame },
  general: { label: "Hinweis", icon: AlertTriangle },
}

const severityColors: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
}

const severityLabels: Record<string, string> = {
  critical: "Kritisch",
  warning: "Warnung",
  info: "Info",
}

const severityIndicator: Record<string, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
}

export default function AlertsPage() {
  const router = useRouter()
  const [alerts, setAlerts] = useState<ServiceAlert[]>([])
  const [filteredAlerts, setFilteredAlerts] = useState<ServiceAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")

  const fetchAlerts = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("service_alerts")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) throw error
      setAlerts((data || []) as ServiceAlert[])
    } catch (error) {
      console.error("Error fetching alerts:", error)
      toast.error("Fehler beim Laden der Meldungen")
    } finally {
      setLoading(false)
    }
  }, [])

  const filterAlerts = useCallback(() => {
    let filtered = alerts

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (a) =>
          a.title.toLowerCase().includes(term) ||
          a.description?.toLowerCase().includes(term) ||
          a.location?.toLowerCase().includes(term)
      )
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((a) => a.status === statusFilter)
    }

    if (typeFilter !== "all") {
      filtered = filtered.filter((a) => a.alert_type === typeFilter)
    }

    setFilteredAlerts(filtered)
  }, [alerts, searchTerm, statusFilter, typeFilter])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  useEffect(() => {
    filterAlerts()
  }, [filterAlerts])

  const handleDelete = async (id: string) => {
    const loadingToast = toast.loading("Meldung wird gelöscht...")
    const result = await deleteServiceAlert(id)
    if (result.success) {
      toast.success("Meldung gelöscht", { id: loadingToast, description: result.message })
      fetchAlerts()
    } else {
      toast.error("Fehler", { id: loadingToast, description: result.error })
    }
  }

  const handleResolve = async (id: string) => {
    const loadingToast = toast.loading("Status wird aktualisiert...")
    const result = await resolveServiceAlert(id)
    if (result.success) {
      toast.success("Meldung gelöst", { id: loadingToast, description: result.message })
      fetchAlerts()
    } else {
      toast.error("Fehler", { id: loadingToast, description: result.error })
    }
  }

  const handleReactivate = async (id: string) => {
    const loadingToast = toast.loading("Status wird aktualisiert...")
    const result = await reactivateServiceAlert(id)
    if (result.success) {
      toast.success("Meldung reaktiviert", { id: loadingToast, description: result.message })
      fetchAlerts()
    } else {
      toast.error("Fehler", { id: loadingToast, description: result.error })
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">Aktiv</Badge>
      case "resolved":
        return <Badge variant="secondary">Gelöst</Badge>
      case "draft":
        return <Badge variant="outline">Entwurf</Badge>
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-[180px]" />
          <Skeleton className="h-10 w-[180px]" />
        </div>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-[10px] p-4">
              <div className="flex gap-4">
                <Skeleton className="w-2 h-16 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-16" />
                  </div>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-medium text-foreground">Meldungen</h1>
          <p className="text-muted-foreground mt-1">
            Service-Meldungen und Warnhinweise verwalten
          </p>
        </div>
        <Button onClick={() => router.push("/admin/dashboard/alerts/new")}>
          <Plus className="h-4 w-4 mr-2" />
          Neue Meldung
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Meldungen suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="active">Aktiv</SelectItem>
            <SelectItem value="resolved">Gelöst</SelectItem>
            <SelectItem value="draft">Entwurf</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Typ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Typen</SelectItem>
            <SelectItem value="water_outage">Wasserausfall</SelectItem>
            <SelectItem value="road_closure">Straßensperrung</SelectItem>
            <SelectItem value="storm_warning">Sturmwarnung</SelectItem>
            <SelectItem value="fire_department">Feuerwehr</SelectItem>
            <SelectItem value="general">Allgemein</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Alerts List */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border rounded-[10px]">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Keine Meldungen gefunden</p>
            <Button
              variant="link"
              onClick={() => router.push("/admin/dashboard/alerts/new")}
              className="mt-2"
            >
              Erste Meldung erstellen
            </Button>
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const typeConf = alertTypeConfig[alert.alert_type] || alertTypeConfig.general
            const TypeIcon = typeConf.icon

            return (
              <div
                key={alert.id}
                className="bg-card border border-border rounded-[10px] p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex gap-4">
                  {/* Severity indicator */}
                  <div
                    className={`w-1.5 rounded-full flex-shrink-0 ${
                      severityIndicator[alert.severity] || severityIndicator.warning
                    }`}
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <TypeIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <h3 className="font-medium text-lg">{alert.title}</h3>
                          {getStatusBadge(alert.status)}
                          <Badge className={severityColors[alert.severity] || ""}>
                            {severityLabels[alert.severity] || alert.severity}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {typeConf.label}
                          </Badge>
                        </div>
                        {alert.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {alert.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          {alert.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {alert.location}
                            </span>
                          )}
                          <span>
                            {new Date(alert.starts_at).toLocaleDateString("de-DE", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {alert.ends_at && (
                            <>
                              <span>—</span>
                              <span>
                                {new Date(alert.ends_at).toLocaleDateString("de-DE", {
                                  day: "2-digit",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            router.push(`/admin/dashboard/alerts/${alert.id}/edit`)
                          }
                        >
                          <Edit className="h-4 w-4 mr-1.5" />
                          Bearbeiten
                        </Button>

                        {alert.status === "active" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResolve(alert.id)}
                          >
                            <CheckCircle className="h-4 w-4 mr-1.5" />
                            Gelöst
                          </Button>
                        ) : alert.status === "resolved" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReactivate(alert.id)}
                          >
                            <RotateCcw className="h-4 w-4 mr-1.5" />
                            Reaktivieren
                          </Button>
                        ) : null}

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost">
                              <Trash2 className="h-4 w-4 mr-1.5" />
                              Löschen
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Meldung löschen?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Diese Aktion kann nicht rückgängig gemacht werden. Die Meldung
                                wird dauerhaft gelöscht.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(alert.id)}>
                                Löschen
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
