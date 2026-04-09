"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ImageUploadDropzone } from "@/components/ui/image-upload-dropzone"
import { toast } from "sonner"
import { createVideo } from "@/app/actions/help-hub"
import { ArrowLeft, Save, Eye } from "lucide-react"

export default function NewVideoPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: "",
    thumbnail_url: "",
    youtube_url: "",
    duration: "",
    published_date: "",
    display_order: "0",
  })

  const isYouTubeUrl = (url: string) => {
    return url.includes("youtube.com") || url.includes("youtu.be")
  }

  const handleSubmit = async (e: React.FormEvent, publish: boolean) => {
    e.preventDefault()
    setLoading(true)

    const submitData = new FormData()
    submitData.append("title", formData.title)
    submitData.append("thumbnail_url", formData.thumbnail_url)
    submitData.append("youtube_url", formData.youtube_url)
    submitData.append("duration", formData.duration)
    submitData.append("published_date", formData.published_date)
    submitData.append("display_order", formData.display_order)
    submitData.append("is_published", String(publish))

    const loadingToast = toast.loading(
      publish ? "Video wird veröffentlicht..." : "Entwurf wird gespeichert..."
    )

    const result = await createVideo(submitData)

    if (result.success) {
      toast.success(publish ? "Video veröffentlicht" : "Entwurf gespeichert", {
        id: loadingToast,
        description: result.message,
      })
      router.push("/admin/dashboard/help")
    } else {
      toast.error("Fehler", {
        id: loadingToast,
        description: result.error,
      })
      setLoading(false)
    }
  }

  const isValid =
    formData.title &&
    formData.youtube_url &&
    formData.thumbnail_url &&
    formData.duration &&
    formData.published_date

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-medium text-foreground">Neues Video</h1>
          <p className="text-muted-foreground mt-1">Fügen Sie ein neues Hilfe-Video hinzu</p>
        </div>
      </div>

      {/* Form */}
      <form className="space-y-6">
        {/* General */}
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <div>
            <Label htmlFor="title">Titel *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="z.B. Willkommen in Röbel"
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="youtube_url">YouTube URL *</Label>
            <Input
              id="youtube_url"
              type="url"
              value={formData.youtube_url}
              onChange={(e) => setFormData({ ...formData, youtube_url: e.target.value })}
              placeholder="https://www.youtube.com/watch?v=..."
              required
              className="mt-1"
            />
            {formData.youtube_url && !isYouTubeUrl(formData.youtube_url) && (
              <p className="text-xs text-red-600 mt-1">
                Bitte geben Sie eine gültige YouTube-URL ein
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="duration">Dauer *</Label>
              <Input
                id="duration"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                placeholder="z.B. 2:30"
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="published_date">Veröffentlichungsdatum *</Label>
              <Input
                id="published_date"
                type="date"
                value={formData.published_date}
                onChange={(e) => setFormData({ ...formData, published_date: e.target.value })}
                required
                className="mt-1"
              />
            </div>
          </div>
        </div>

        {/* Thumbnail */}
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <h3 className="font-medium text-lg">Vorschaubild</h3>
          <div>
            <Label>Thumbnail *</Label>
            <div className="mt-2">
              <ImageUploadDropzone
                onUploadComplete={(url) => setFormData({ ...formData, thumbnail_url: url })}
                currentImageUrl={formData.thumbnail_url}
                bucketName="news-images"
                maxSizeMB={5}
              />
            </div>
          </div>
        </div>

        {/* Settings */}
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <h3 className="font-medium text-lg">Einstellungen</h3>
          <div>
            <Label htmlFor="display_order">Reihenfolge</Label>
            <Input
              id="display_order"
              type="number"
              value={formData.display_order}
              onChange={(e) => setFormData({ ...formData, display_order: e.target.value })}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">Niedrigere Zahl = weiter oben</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between bg-card border border-border rounded-[10px] p-6">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
            Abbrechen
          </Button>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={(e) => handleSubmit(e, false)}
              disabled={loading || !isValid}
            >
              <Save className="h-4 w-4 mr-2" />
              Als Entwurf speichern
            </Button>
            <Button
              type="button"
              onClick={(e) => handleSubmit(e, true)}
              disabled={loading || !isValid}
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
