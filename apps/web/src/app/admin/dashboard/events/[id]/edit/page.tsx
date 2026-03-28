"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ImageUploadDropzone } from "@/components/ui/image-upload-dropzone"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { updateEvent, deleteEvent, addEventDates, cancelEventDate, deleteEventDate } from "@/app/actions/manage-events"
import { createClient } from "@/lib/supabase/client"
import { CATEGORIES } from "@/lib/constants"
import { ArrowLeft, Save, Trash2, Plus, X, Calendar, Radio } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { formatDateForDisplay, isDatePast } from "@/lib/utils/recurring-events"
import type { EventDate } from "@/types/event-dates"
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

export default function EditEventPage() {
  const router = useRouter()
  const params = useParams()
  const eventId = params.id as string

  const [loading, setLoading] = useState(false)
  const [fetchingEvent, setFetchingEvent] = useState(true)
  const [eventDates, setEventDates] = useState<EventDate[]>([])
  const [newDateInput, setNewDateInput] = useState("")
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    date: "",
    time: "",
    location: "",
    category: "",
    organizer_name: "",
    organizer_email: "",
    organizer_phone: "",
    website_url: "",
    ticket_price: "",
    max_attendees: "",
    status: "pending" as "pending" | "approved" | "rejected",
    is_popular: false,
    is_recurring: false,
    image_url: "",
    livestream_url: "",
    livestream_active: false,
  })

  const fetchEvent = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .single()

      if (error) throw error

      if (data) {
        setFormData({
          title: data.title || "",
          description: data.description || "",
          date: data.date || "",
          time: data.time || "",
          location: data.location || "",
          category: data.category || "",
          organizer_name: data.organizer_name || "",
          organizer_email: data.organizer_email || "",
          organizer_phone: data.organizer_phone || "",
          website_url: data.website_url || "",
          ticket_price: data.ticket_price?.toString() || "",
          max_attendees: data.max_attendees?.toString() || "",
          status: data.status || "pending",
          is_popular: data.is_popular || false,
          is_recurring: data.is_recurring || false,
          image_url: data.image_url || "",
          livestream_url: data.livestream_url || "",
          livestream_active: data.livestream_active || false,
        })

        // Fetch event dates
        const { data: datesData, error: datesError } = await supabase
          .from("event_dates")
          .select("*")
          .eq("event_id", eventId)
          .order("date", { ascending: true })

        if (!datesError && datesData) {
          setEventDates(datesData)
        }
      }
    } catch (error) {
      console.error("Error fetching event:", error)
      toast.error("Fehler beim Laden des Events")
      router.push("/admin/dashboard/events")
    } finally {
      setFetchingEvent(false)
    }
  }, [eventId, router])

  useEffect(() => {
    fetchEvent()
  }, [fetchEvent])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const submitData = new FormData()
    Object.entries(formData).forEach(([key, value]) => {
      submitData.append(key, String(value))
    })

    const loadingToast = toast.loading("Event wird aktualisiert...")

    const result = await updateEvent(eventId, submitData)

    if (result.success) {
      toast.success("Event aktualisiert", {
        id: loadingToast,
        description: result.message,
      })
      router.push("/admin/dashboard/events")
    } else {
      toast.error("Fehler", {
        id: loadingToast,
        description: result.error,
      })
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    const loadingToast = toast.loading("Event wird gelöscht...")

    const result = await deleteEvent(eventId)

    if (result.success) {
      toast.success("Event gelöscht", {
        id: loadingToast,
        description: result.message,
      })
      router.push("/admin/dashboard/events")
    } else {
      toast.error("Fehler", {
        id: loadingToast,
        description: result.error,
      })
    }
  }

  const handleAddDate = async () => {
    if (!newDateInput) return

    const loadingToast = toast.loading("Termin wird hinzugefügt...")
    const result = await addEventDates(eventId, [newDateInput])

    if (result.success) {
      toast.success("Termin hinzugefügt", { id: loadingToast })
      setNewDateInput("")
      fetchEvent() // Refresh dates
    } else {
      toast.error("Fehler", { id: loadingToast, description: result.error })
    }
  }

  const handleCancelDate = async (dateId: string) => {
    const loadingToast = toast.loading("Termin wird abgesagt...")
    const result = await cancelEventDate(dateId)

    if (result.success) {
      toast.success("Termin abgesagt", { id: loadingToast })
      fetchEvent() // Refresh dates
    } else {
      toast.error("Fehler", { id: loadingToast, description: result.error })
    }
  }

  const handleDeleteDate = async (dateId: string) => {
    const loadingToast = toast.loading("Termin wird gelöscht...")
    const result = await deleteEventDate(dateId)

    if (result.success) {
      toast.success("Termin gelöscht", { id: loadingToast })
      fetchEvent() // Refresh dates
    } else {
      toast.error("Fehler", { id: loadingToast, description: result.error })
    }
  }

  if (fetchingEvent) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-medium text-foreground">Event bearbeiten</h1>
          <p className="text-muted-foreground mt-1">Bearbeiten Sie die Event-Details</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Event löschen
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Event wirklich löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Diese Aktion kann nicht rückgängig gemacht werden. Das Event wird dauerhaft aus der Datenbank gelöscht.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Event löschen
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
              placeholder="Event-Titel"
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
              placeholder="Eine detaillierte Beschreibung des Events"
              rows={4}
              className="mt-1"
            />
          </div>

          {/* Event Image */}
          <div>
            <Label>Event-Bild</Label>
            <div className="mt-2">
              <ImageUploadDropzone
                onUploadComplete={(url) => setFormData({ ...formData, image_url: url })}
                currentImageUrl={formData.image_url}
                bucketName="news-images"
                maxSizeMB={5}
              />
            </div>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="date">Datum *</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="time">Uhrzeit</Label>
              <Input
                id="time"
                type="time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          {/* Location and Category */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="location">Ort *</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Veranstaltungsort"
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="category">Kategorie</Label>
              <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Kategorie wählen" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Organizer Information */}
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <h3 className="font-medium text-lg">Organisator-Informationen</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="organizer_name">Name *</Label>
              <Input
                id="organizer_name"
                value={formData.organizer_name}
                onChange={(e) => setFormData({ ...formData, organizer_name: e.target.value })}
                placeholder="Name des Veranstalters"
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="organizer_email">E-Mail *</Label>
              <Input
                id="organizer_email"
                type="email"
                value={formData.organizer_email}
                onChange={(e) => setFormData({ ...formData, organizer_email: e.target.value })}
                placeholder="kontakt@beispiel.de"
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="organizer_phone">Telefon</Label>
              <Input
                id="organizer_phone"
                type="tel"
                value={formData.organizer_phone}
                onChange={(e) => setFormData({ ...formData, organizer_phone: e.target.value })}
                placeholder="+49 123 456789"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="website_url">Webseite</Label>
              <Input
                id="website_url"
                type="url"
                value={formData.website_url}
                onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                placeholder="https://beispiel.de"
                className="mt-1"
              />
            </div>
          </div>
        </div>

        {/* Additional Details */}
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <h3 className="font-medium text-lg">Zusätzliche Details</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="ticket_price">Ticketpreis (€)</Label>
              <Input
                id="ticket_price"
                type="number"
                step="0.01"
                min="0"
                value={formData.ticket_price}
                onChange={(e) => setFormData({ ...formData, ticket_price: e.target.value })}
                placeholder="0.00"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="max_attendees">Max. Teilnehmer</Label>
              <Input
                id="max_attendees"
                type="number"
                min="0"
                value={formData.max_attendees}
                onChange={(e) => setFormData({ ...formData, max_attendees: e.target.value })}
                placeholder="z.B. 100"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value as any })}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Wartend</SelectItem>
                  <SelectItem value="approved">Genehmigt</SelectItem>
                  <SelectItem value="rejected">Abgelehnt</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Popular Event Toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_popular"
              checked={formData.is_popular}
              onChange={(e) => setFormData({ ...formData, is_popular: e.target.checked })}
              className="rounded border-border"
            />
            <Label htmlFor="is_popular" className="cursor-pointer">
              Als &ldquo;Event des Tages&rdquo; markieren (max. 3 Events)
            </Label>
          </div>
        </div>

        {/* Livestream Settings */}
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <h3 className="font-medium text-lg flex items-center gap-2">
            <Radio className="h-5 w-5" />
            Livestream
          </h3>

          <div>
            <Label htmlFor="livestream_url">Livestream URL</Label>
            <Input
              id="livestream_url"
              type="url"
              value={formData.livestream_url}
              onChange={(e) => setFormData({ ...formData, livestream_url: e.target.value })}
              placeholder="https://youtube.com/live/..."
              className="mt-1"
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="livestream_active"
              checked={formData.livestream_active}
              onCheckedChange={(checked) => setFormData({ ...formData, livestream_active: checked })}
              disabled={!formData.livestream_url}
            />
            <Label htmlFor="livestream_active" className="cursor-pointer">
              Livestream aktiv
            </Label>
            {!formData.livestream_url && (
              <span className="text-xs text-muted-foreground">(URL erforderlich)</span>
            )}
          </div>
        </div>

        {/* Termine Section - shown when is_recurring or has multiple dates */}
        {(formData.is_recurring || eventDates.length > 1) && (
          <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                <h3 className="font-medium text-lg">Termine ({eventDates.length})</h3>
              </div>
            </div>

            {/* Dates List */}
            <div className="space-y-2">
              {eventDates.map((eventDate) => {
                const isPast = isDatePast(eventDate.date)
                const isCancelled = eventDate.is_cancelled

                return (
                  <div
                    key={eventDate.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      isCancelled
                        ? "bg-muted border-border"
                        : isPast
                          ? "bg-muted border-border"
                          : "bg-card border-border"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`font-medium ${isCancelled || isPast ? "text-muted-foreground" : "text-foreground"}`}>
                        {formatDateForDisplay(eventDate.date)}
                      </span>
                      {isCancelled ? (
                        <Badge variant="secondary" className="bg-red-100 text-red-700">
                          Abgesagt
                        </Badge>
                      ) : isPast ? (
                        <Badge variant="secondary" className="bg-muted text-muted-foreground">
                          Vergangen
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-green-100 text-green-700">
                          Kommend
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!isCancelled && !isPast && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancelDate(eventDate.id)}
                          className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                        >
                          Absagen
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteDate(eventDate.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Add New Date */}
            <div className="flex items-end gap-2 pt-2 border-t border-border">
              <div className="flex-1">
                <Label htmlFor="new_date" className="text-sm">Neuen Termin hinzufügen</Label>
                <Input
                  id="new_date"
                  type="date"
                  value={newDateInput}
                  onChange={(e) => setNewDateInput(e.target.value)}
                  className="mt-1"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleAddDate}
                disabled={!newDateInput}
              >
                <Plus className="h-4 w-4 mr-1" />
                Hinzufügen
              </Button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            disabled={loading || !formData.title || !formData.date || !formData.location || !formData.organizer_name || !formData.organizer_email}
          >
            <Save className="h-4 w-4 mr-2" />
            Änderungen speichern
          </Button>
        </div>
      </form>
    </div>
  )
}
