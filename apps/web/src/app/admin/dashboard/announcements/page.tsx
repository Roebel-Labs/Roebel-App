"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
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
import { Plus, Search, Pencil, Trash2, Megaphone, ExternalLink, Link2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import {
  deleteAnnouncement,
  toggleAnnouncementActive,
  type Announcement,
} from "@/app/actions/announcements"

export default function AnnouncementsPage() {
  const router = useRouter()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [filteredAnnouncements, setFilteredAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [activeFilter, setActiveFilter] = useState("all")

  const fetchAnnouncements = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .order("priority", { ascending: false })

      if (error) throw error
      setAnnouncements((data || []) as Announcement[])
    } catch (error) {
      console.error("Error fetching announcements:", error)
      toast.error("Fehler beim Laden der Ankündigungen")
    } finally {
      setLoading(false)
    }
  }, [])

  const filterAnnouncements = useCallback(() => {
    let filtered = announcements

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (a) =>
          a.title.toLowerCase().includes(term) ||
          a.description?.toLowerCase().includes(term)
      )
    }

    if (activeFilter === "active") {
      filtered = filtered.filter((a) => a.is_active)
    } else if (activeFilter === "inactive") {
      filtered = filtered.filter((a) => !a.is_active)
    }

    setFilteredAnnouncements(filtered)
  }, [announcements, searchTerm, activeFilter])

  useEffect(() => {
    fetchAnnouncements()
  }, [fetchAnnouncements])

  useEffect(() => {
    filterAnnouncements()
  }, [filterAnnouncements])

  const handleDelete = async (id: string) => {
    const loadingToast = toast.loading("Ankündigung wird gelöscht...")
    const result = await deleteAnnouncement(id)
    if (result.success) {
      toast.success("Ankündigung gelöscht", { id: loadingToast, description: result.message })
      fetchAnnouncements()
    } else {
      toast.error("Fehler", { id: loadingToast, description: result.error })
    }
  }

  const handleToggleActive = async (id: string, isActive: boolean) => {
    const loadingToast = toast.loading(
      isActive ? "Ankündigung wird aktiviert..." : "Ankündigung wird deaktiviert..."
    )
    const result = await toggleAnnouncementActive(id, isActive)
    if (result.success) {
      toast.success(isActive ? "Aktiviert" : "Deaktiviert", {
        id: loadingToast,
        description: result.message,
      })
      fetchAnnouncements()
    } else {
      toast.error("Fehler", { id: loadingToast, description: result.error })
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-[180px]" />
        </div>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-[10px] p-5">
              <div className="flex gap-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-3/4" />
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
          <h1 className="text-3xl font-medium text-foreground">Ankündigungen</h1>
          <p className="text-muted-foreground mt-1">
            Ankündigungen und Hinweise verwalten
          </p>
        </div>
        <Button onClick={() => router.push("/admin/dashboard/announcements/new")}>
          <Plus className="h-4 w-4 mr-2" />
          Neue Ankündigung
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Ankündigungen suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="active">Aktiv</SelectItem>
            <SelectItem value="inactive">Inaktiv</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Announcements List */}
      <div className="space-y-3">
        {filteredAnnouncements.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border rounded-[10px]">
            <Megaphone className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Keine Ankündigungen gefunden</p>
            <Button
              variant="link"
              onClick={() => router.push("/admin/dashboard/announcements/new")}
              className="mt-2"
            >
              Erste Ankündigung erstellen
            </Button>
          </div>
        ) : (
          filteredAnnouncements.map((announcement) => (
            <div
              key={announcement.id}
              className="bg-card border border-border rounded-[10px] p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex gap-4">
                {/* Image thumbnail */}
                {announcement.image_url && (
                  <div className="w-16 h-16 rounded-[8px] overflow-hidden flex-shrink-0 bg-muted">
                    <img
                      src={announcement.image_url}
                      alt={announcement.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-medium text-lg">{announcement.title}</h3>
                        {announcement.is_active ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                            Aktiv
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Inaktiv</Badge>
                        )}
                        {announcement.priority > 0 && (
                          <Badge variant="outline" className="text-xs">
                            Priorität {announcement.priority}
                          </Badge>
                        )}
                        {announcement.show_once && (
                          <Badge variant="outline" className="text-xs">
                            Einmalig
                          </Badge>
                        )}
                        {(announcement.min_app_version || announcement.max_app_version) && (
                          <Badge variant="outline" className="text-xs">
                            {announcement.min_app_version && announcement.max_app_version
                              ? `v${announcement.min_app_version}–${announcement.max_app_version}`
                              : announcement.min_app_version
                                ? `ab v${announcement.min_app_version}`
                                : `bis v${announcement.max_app_version}`}
                          </Badge>
                        )}
                      </div>
                      {announcement.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {announcement.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        {announcement.cta_link && (
                          <span className="flex items-center gap-1">
                            {announcement.cta_type === "external_url" ? (
                              <ExternalLink className="h-3 w-3" />
                            ) : (
                              <Link2 className="h-3 w-3" />
                            )}
                            {announcement.cta_label || "Mehr erfahren"}
                          </span>
                        )}
                        {announcement.starts_at && (
                          <span>
                            Ab{" "}
                            {new Date(announcement.starts_at).toLocaleDateString("de-DE", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        )}
                        {announcement.ends_at && (
                          <span>
                            Bis{" "}
                            {new Date(announcement.ends_at).toLocaleDateString("de-DE", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          router.push(`/admin/dashboard/announcements/${announcement.id}/edit`)
                        }
                      >
                        <Pencil className="h-4 w-4 mr-1.5" />
                        Bearbeiten
                      </Button>

                      <div className="flex items-center gap-1.5 px-2" title={announcement.is_active ? "Deaktivieren" : "Aktivieren"}>
                        <Switch
                          checked={announcement.is_active}
                          onCheckedChange={(checked) =>
                            handleToggleActive(announcement.id, checked)
                          }
                        />
                      </div>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost">
                            <Trash2 className="h-4 w-4 mr-1.5" />
                            Löschen
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Ankündigung löschen?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Diese Aktion kann nicht rückgängig gemacht werden. Die Ankündigung
                              wird dauerhaft gelöscht.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(announcement.id)}>
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
          ))
        )}
      </div>
    </div>
  )
}
