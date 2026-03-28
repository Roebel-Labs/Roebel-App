"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ImageUploadDropzone } from "@/components/ui/image-upload-dropzone"
import { toast } from "sonner"
import { updateAnnouncement, deleteAnnouncement, type Announcement } from "@/app/actions/announcements"
import { createClient } from "@/lib/supabase/client"
import { ArrowLeft, Save, Trash2 } from "lucide-react"
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

function toLocalDatetimeString(dateStr: string) {
  const date = new Date(dateStr)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

interface EventOption {
  id: string
  title: string
  date: string
}

export default function EditAnnouncementPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [fetchingAnnouncement, setFetchingAnnouncement] = useState(true)
  const [saving, setSaving] = useState(false)
  const [events, setEvents] = useState<EventOption[]>([])
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    image_url: "",
    cta_label: "Mehr erfahren",
    cta_link: "",
    cta_type: "external_url",
    is_active: true,
    priority: "0",
    show_once: false,
    starts_at: "",
    ends_at: "",
    min_app_version: "",
    max_app_version: "",
  })

  const fetchAnnouncement = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .eq("id", id)
        .single()

      if (error) throw error

      const a = data as Announcement
      setFormData({
        title: a.title,
        description: a.description || "",
        image_url: a.image_url || "",
        cta_label: a.cta_label || "Mehr erfahren",
        cta_link: a.cta_link || "",
        cta_type: a.cta_type || "external_url",
        is_active: a.is_active,
        priority: a.priority?.toString() || "0",
        show_once: a.show_once || false,
        starts_at: a.starts_at ? toLocalDatetimeString(a.starts_at) : "",
        ends_at: a.ends_at ? toLocalDatetimeString(a.ends_at) : "",
        min_app_version: a.min_app_version || "",
        max_app_version: a.max_app_version || "",
      })
    } catch (error) {
      console.error("Error fetching announcement:", error)
      toast.error("Fehler beim Laden der Ankündigung")
      router.push("/admin/dashboard/announcements")
    } finally {
      setFetchingAnnouncement(false)
    }
  }, [id, router])

  useEffect(() => {
    fetchAnnouncement()
  }, [fetchAnnouncement])

  useEffect(() => {
    async function fetchEvents() {
      const supabase = createClient()
      const { data } = await supabase
        .from("events")
        .select("id, title, date")
        .eq("status", "approved")
        .order("date", { ascending: true })
      if (data) setEvents(data)
    }
    fetchEvents()
  }, [])

  // Derive the currently selected event ID from cta_link (format: /app/events/{id})
  const selectedEventId =
    formData.cta_type === "deep_link" && formData.cta_link.startsWith("/app/events/")
      ? formData.cta_link.replace("/app/events/", "")
      : ""

  const handleCtaTypeChange = (value: string) => {
    setFormData({ ...formData, cta_type: value, cta_link: "" })
  }

  const handleEventSelect = (eventId: string) => {
    setFormData({ ...formData, cta_link: `/app/events/${eventId}` })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const submitData = new FormData()
    Object.entries(formData).forEach(([key, value]) => {
      submitData.append(key, String(value))
    })

    const loadingToast = toast.loading("Ankündigung wird aktualisiert...")
    const result = await updateAnnouncement(id, submitData)

    if (result.success) {
      toast.success("Ankündigung aktualisiert", {
        id: loadingToast,
        description: result.message,
      })
      router.push("/admin/dashboard/announcements")
    } else {
      toast.error("Fehler", { id: loadingToast, description: result.error })
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    const loadingToast = toast.loading("Ankündigung wird gelöscht...")
    const result = await deleteAnnouncement(id)

    if (result.success) {
      toast.success("Ankündigung gelöscht", {
        id: loadingToast,
        description: result.message,
      })
      router.push("/admin/dashboard/announcements")
    } else {
      toast.error("Fehler", { id: loadingToast, description: result.error })
    }
  }

  if (fetchingAnnouncement) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-medium text-foreground">Ankündigung bearbeiten</h1>
          <p className="text-muted-foreground mt-1">Bearbeiten Sie die Ankündigungs-Details</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Löschen
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Ankündigung wirklich löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Diese Aktion kann nicht rückgängig gemacht werden. Die Ankündigung wird dauerhaft gelöscht.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          {/* Title */}
          <div>
            <Label htmlFor="title">Titel *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Titel der Ankündigung"
              required
              className="mt-1"
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">Beschreibung</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Beschreibung der Ankündigung..."
              rows={4}
              className="mt-1"
            />
          </div>

          {/* Image */}
          <div>
            <Label>Bild</Label>
            <div className="mt-2">
              <ImageUploadDropzone
                onUploadComplete={(url) => setFormData({ ...formData, image_url: url })}
                currentImageUrl={formData.image_url}
                bucketName="news-images"
                maxSizeMB={5}
              />
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <h3 className="font-medium text-lg">Call-to-Action</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="cta_label">Button-Text</Label>
              <Input
                id="cta_label"
                value={formData.cta_label}
                onChange={(e) => setFormData({ ...formData, cta_label: e.target.value })}
                placeholder="Mehr erfahren"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Link-Typ</Label>
              <Select value={formData.cta_type} onValueChange={handleCtaTypeChange}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Typ wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="external_url">Externer Link</SelectItem>
                  <SelectItem value="deep_link">Deep Link (In-App)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Conditional link field */}
          {formData.cta_type === "deep_link" ? (
            <div>
              <Label>Event auswählen</Label>
              <Select value={selectedEventId} onValueChange={handleEventSelect}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Event auswählen..." />
                </SelectTrigger>
                <SelectContent>
                  {events.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      Keine genehmigten Events gefunden
                    </SelectItem>
                  ) : (
                    events.map((event) => (
                      <SelectItem key={event.id} value={event.id}>
                        {event.title} —{" "}
                        {new Date(event.date).toLocaleDateString("de-DE", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {selectedEventId && (
                <p className="text-xs text-muted-foreground mt-1">
                  Link: /app/events/{selectedEventId}
                </p>
              )}
            </div>
          ) : (
            <div>
              <Label htmlFor="cta_link">URL</Label>
              <Input
                id="cta_link"
                value={formData.cta_link}
                onChange={(e) => setFormData({ ...formData, cta_link: e.target.value })}
                placeholder="https://..."
                type="url"
                className="mt-1"
              />
            </div>
          )}
        </div>

        {/* Settings */}
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <h3 className="font-medium text-lg">Einstellungen</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <Label htmlFor="priority">Priorität</Label>
              <Input
                id="priority"
                type="number"
                min="0"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Höhere Werte = höhere Priorität</p>
            </div>

            <div>
              <Label htmlFor="starts_at">Startdatum</Label>
              <Input
                id="starts_at"
                type="datetime-local"
                value={formData.starts_at}
                onChange={(e) => setFormData({ ...formData, starts_at: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="ends_at">Enddatum (optional)</Label>
              <Input
                id="ends_at"
                type="datetime-local"
                value={formData.ends_at}
                onChange={(e) => setFormData({ ...formData, ends_at: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="min_app_version">Min. App-Version (optional)</Label>
              <Input
                id="min_app_version"
                value={formData.min_app_version}
                onChange={(e) => setFormData({ ...formData, min_app_version: e.target.value })}
                placeholder="z.B. 1.2.0"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="max_app_version">Max. App-Version (optional)</Label>
              <Input
                id="max_app_version"
                value={formData.max_app_version}
                onChange={(e) => setFormData({ ...formData, max_app_version: e.target.value })}
                placeholder="z.B. 2.0.0"
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label htmlFor="is_active" className="cursor-pointer">
                Aktiv
              </Label>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="show_once"
                checked={formData.show_once}
                onCheckedChange={(checked) => setFormData({ ...formData, show_once: checked })}
              />
              <Label htmlFor="show_once" className="cursor-pointer">
                Nur einmal anzeigen
              </Label>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={saving || !formData.title}>
            <Save className="h-4 w-4 mr-2" />
            Änderungen speichern
          </Button>
        </div>
      </form>
    </div>
  )
}
