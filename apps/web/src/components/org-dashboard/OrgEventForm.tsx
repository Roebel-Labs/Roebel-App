"use client"

import { useState } from "react"
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
import { AudioUploadDropzone } from "@/components/ui/audio-upload-dropzone"
import { Switch } from "@/components/ui/switch"
import { CATEGORIES } from "@/lib/constants"
import { Save, Send, Radio, QrCode, ExternalLink, Loader2 } from "lucide-react"

// Circles host "playground" — sideloads the Röbel Circles mini-app so the org can
// generate a proof-of-attendance QR inside the Circles wallet host.
export const CIRCLES_PLAYGROUND_URL =
  "https://circles.gnosis.io/playground?url=https%3A%2F%2Fcircles-inviter.vercel.app%2F"

export interface OrgEventFormValues {
  title: string
  description: string
  date: string
  time: string
  end_time: string
  location: string
  category: string
  organizer_name: string
  organizer_email: string
  organizer_phone: string
  website_url: string
  ticket_price: string
  max_attendees: string
  is_cancelled: boolean
  image_url: string
  audio_url: string
  livestream_url: string
  livestream_active: boolean
}

export const EMPTY_EVENT_VALUES: OrgEventFormValues = {
  title: "",
  description: "",
  date: "",
  time: "",
  end_time: "",
  location: "",
  category: "",
  organizer_name: "",
  organizer_email: "",
  organizer_phone: "",
  website_url: "",
  ticket_price: "",
  max_attendees: "",
  is_cancelled: false,
  image_url: "",
  audio_url: "",
  livestream_url: "",
  livestream_active: false,
}

interface OrgEventFormProps {
  initial?: OrgEventFormValues
  mode: "create" | "edit"
  submitting: boolean
  currentlyPublished?: boolean
  onSubmit: (formData: FormData, publish: boolean) => void
  extraSection?: React.ReactNode
}

export function OrgEventForm({
  initial,
  mode,
  submitting,
  currentlyPublished = false,
  onSubmit,
  extraSection,
}: OrgEventFormProps) {
  const [form, setForm] = useState<OrgEventFormValues>(initial ?? EMPTY_EVENT_VALUES)
  const set = <K extends keyof OrgEventFormValues>(key: K, value: OrgEventFormValues[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const missingRequired =
    !form.title ||
    !form.date ||
    !form.location ||
    !form.organizer_name ||
    !form.organizer_email

  const buildFormData = () => {
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => fd.append(k, String(v)))
    return fd
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        // Default primary submit = publish for create; for edit keep current state.
        onSubmit(buildFormData(), mode === "create" ? true : currentlyPublished)
      }}
      className="space-y-6"
    >
      {/* Core */}
      <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
        <div>
          <Label htmlFor="title">Titel *</Label>
          <Input
            id="title"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Event-Titel"
            required
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="description">Beschreibung</Label>
          <Textarea
            id="description"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Eine detaillierte Beschreibung des Events"
            rows={4}
            className="mt-1"
          />
        </div>

        <div>
          <Label>Event-Bild</Label>
          <div className="mt-2">
            <ImageUploadDropzone
              onUploadComplete={(url) => set("image_url", url)}
              currentImageUrl={form.image_url}
              bucketName="news-images"
              maxSizeMB={5}
            />
          </div>
        </div>

        <div>
          <Label>Event-Audio (optional)</Label>
          <p className="text-xs text-muted-foreground mb-2 mt-1">
            Wird automatisch abgespielt, wenn dieses Event als Story geöffnet wird.
          </p>
          <AudioUploadDropzone
            bucketName="story-audio"
            folder="events"
            currentAudioUrl={form.audio_url}
            onUploadComplete={(url) => set("audio_url", url)}
            maxSizeMB={10}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <Label htmlFor="date">Datum *</Label>
            <Input
              id="date"
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="time">Beginn</Label>
            <Input
              id="time"
              type="time"
              value={form.time}
              onChange={(e) => set("time", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="end_time">Ende</Label>
            <Input
              id="end_time"
              type="time"
              value={form.end_time}
              onChange={(e) => set("end_time", e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label htmlFor="location">Ort *</Label>
            <Input
              id="location"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="Veranstaltungsort"
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="category">Kategorie</Label>
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
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

      {/* Organizer */}
      <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
        <h3 className="font-medium text-lg">Organisator-Informationen</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label htmlFor="organizer_name">Name *</Label>
            <Input
              id="organizer_name"
              value={form.organizer_name}
              onChange={(e) => set("organizer_name", e.target.value)}
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
              value={form.organizer_email}
              onChange={(e) => set("organizer_email", e.target.value)}
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
              value={form.organizer_phone}
              onChange={(e) => set("organizer_phone", e.target.value)}
              placeholder="+49 123 456789"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="website_url">Webseite</Label>
            <Input
              id="website_url"
              type="url"
              value={form.website_url}
              onChange={(e) => set("website_url", e.target.value)}
              placeholder="https://beispiel.de"
              className="mt-1"
            />
          </div>
        </div>
      </div>

      {/* Extra details */}
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
              value={form.ticket_price}
              onChange={(e) => set("ticket_price", e.target.value)}
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
              value={form.max_attendees}
              onChange={(e) => set("max_attendees", e.target.value)}
              placeholder="z.B. 100"
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-[10px] border border-red-200 bg-red-50 p-4">
          <Switch
            id="is_cancelled"
            checked={form.is_cancelled}
            onCheckedChange={(checked) => set("is_cancelled", checked)}
          />
          <div>
            <Label htmlFor="is_cancelled" className="cursor-pointer font-medium text-red-700">
              Event abgesagt
            </Label>
            <p className="text-xs text-red-600">
              Zeigt ein rotes &ldquo;Abgesagt&rdquo;-Banner in der App. Das Event bleibt sichtbar.
            </p>
          </div>
        </div>
      </div>

      {/* Livestream */}
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
            value={form.livestream_url}
            onChange={(e) => set("livestream_url", e.target.value)}
            placeholder="https://youtube.com/live/..."
            className="mt-1"
          />
        </div>
        <div className="flex items-center gap-3">
          <Switch
            id="livestream_active"
            checked={form.livestream_active}
            onCheckedChange={(checked) => set("livestream_active", checked)}
            disabled={!form.livestream_url}
          />
          <Label htmlFor="livestream_active" className="cursor-pointer">
            Livestream aktiv
          </Label>
          {!form.livestream_url && (
            <span className="text-xs text-muted-foreground">(URL erforderlich)</span>
          )}
        </div>
      </div>

      {/* Attendance QR helper link */}
      <div className="bg-card border border-border rounded-[10px] p-6">
        <h3 className="font-medium text-lg flex items-center gap-2">
          <QrCode className="h-5 w-5 text-primary" />
          Anwesenheits-QR
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Erstelle einen QR-Code für den Eingang. Wer ihn scannt, erhält seinen „War in
          Röbel“-Beleg in Röbel Münzen — so misst du die tatsächliche Teilnahme.
        </p>
        <a
          href={CIRCLES_PLAYGROUND_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          QR-Code über Circles Playground erstellen
        </a>
        {mode === "edit" && (
          <p className="text-xs text-muted-foreground mt-2">
            Tipp: Im Tab „Statistik &amp; QR&ldquo; kannst du den Beleg-QR direkt mit diesem
            Event verknüpfen und die Anwesenheit live sehen.
          </p>
        )}
      </div>

      {extraSection}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={submitting || missingRequired}
          onClick={() => onSubmit(buildFormData(), false)}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Als Entwurf speichern
        </Button>
        <Button
          type="button"
          disabled={submitting || missingRequired}
          onClick={() => onSubmit(buildFormData(), true)}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          {mode === "create" ? "Veröffentlichen" : currentlyPublished ? "Aktualisieren" : "Veröffentlichen"}
        </Button>
      </div>
    </form>
  )
}
