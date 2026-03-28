"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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
import { toast } from "sonner"
import { createMovie } from "@/app/actions/movies"
import { ArrowLeft, Save, Eye } from "lucide-react"

const FSK_OPTIONS = ["FSK 0", "FSK 6", "FSK 12", "FSK 16", "FSK 18"]

export default function NewMoviePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    date: "",
    time: "",
    cover_image_url: "",
    trailer_youtube_url: "",
    fsk: "",
    status: "draft" as "draft" | "published",
  })

  const handleSubmit = async (e: React.FormEvent, status: "draft" | "published") => {
    e.preventDefault()
    setLoading(true)

    const submitData = new FormData()
    Object.entries({ ...formData, status }).forEach(([key, value]) => {
      submitData.append(key, String(value))
    })

    const loadingToast = toast.loading(
      status === "published" ? "Film wird veröffentlicht..." : "Entwurf wird gespeichert..."
    )

    const result = await createMovie(submitData)

    if (result.success) {
      toast.success(status === "published" ? "Film veröffentlicht" : "Entwurf gespeichert", {
        id: loadingToast,
        description: result.message,
      })
      router.push("/admin/dashboard/movies")
    } else {
      toast.error("Fehler", {
        id: loadingToast,
        description: result.error,
      })
      setLoading(false)
    }
  }

  const isYouTubeUrl = (url: string) => {
    return url.includes("youtube.com") || url.includes("youtu.be")
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-medium text-foreground">Neuer Film</h1>
          <p className="text-muted-foreground mt-1">Fügen Sie einen neuen Film zum Kinoprogramm hinzu</p>
        </div>
      </div>

      {/* Form */}
      <form className="space-y-6">
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          {/* Title */}
          <div>
            <Label htmlFor="title">Titel *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Geben Sie den Filmtitel ein"
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
              placeholder="Eine kurze Beschreibung oder Synopsis des Films"
              rows={4}
              className="mt-1"
            />
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">Vorführungsdatum *</Label>
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
              <p className="text-xs text-muted-foreground mt-1">
                Vorführungszeit (optional)
              </p>
            </div>
          </div>

          {/* FSK Rating */}
          <div>
            <Label htmlFor="fsk">FSK-Freigabe</Label>
            <Select
              value={formData.fsk || "none"}
              onValueChange={(value) => setFormData({ ...formData, fsk: value === "none" ? "" : value })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Wählen Sie eine FSK-Freigabe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Keine Angabe</SelectItem>
                {FSK_OPTIONS.map((fsk) => (
                  <SelectItem key={fsk} value={fsk}>
                    {fsk}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Freiwillige Selbstkontrolle der Filmwirtschaft (Altersfreigabe)
            </p>
          </div>
        </div>

        {/* Media */}
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <h3 className="font-medium text-lg">Medien</h3>

          {/* Cover Image */}
          <div>
            <Label>Filmplakat</Label>
            <div className="mt-2">
              <ImageUploadDropzone
                onUploadComplete={(url) => setFormData({ ...formData, cover_image_url: url })}
                currentImageUrl={formData.cover_image_url}
                bucketName="news-images"
                maxSizeMB={5}
              />
            </div>
          </div>

          {/* Trailer URL */}
          <div>
            <Label htmlFor="trailer_youtube_url">Trailer URL (YouTube)</Label>
            <Input
              id="trailer_youtube_url"
              type="url"
              value={formData.trailer_youtube_url}
              onChange={(e) => setFormData({ ...formData, trailer_youtube_url: e.target.value })}
              placeholder="https://www.youtube.com/watch?v=..."
              className="mt-1"
            />
            {formData.trailer_youtube_url && !isYouTubeUrl(formData.trailer_youtube_url) && (
              <p className="text-xs text-red-600 mt-1">
                Bitte geben Sie eine gültige YouTube-URL ein
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              YouTube-Link zum Filmtrailer (optional)
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between bg-card border border-border rounded-[10px] p-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={loading}
          >
            Abbrechen
          </Button>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={(e) => handleSubmit(e, "draft")}
              disabled={loading || !formData.title || !formData.date}
            >
              <Save className="h-4 w-4 mr-2" />
              Als Entwurf speichern
            </Button>
            <Button
              type="button"
              onClick={(e) => handleSubmit(e, "published")}
              disabled={loading || !formData.title || !formData.date}
            >
              <Eye className="h-4 w-4 mr-2" />
              Veröffentlichen
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
