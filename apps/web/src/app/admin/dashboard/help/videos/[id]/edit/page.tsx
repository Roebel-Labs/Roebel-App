"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { ImageUploadDropzone } from "@/components/ui/image-upload-dropzone"
import { toast } from "sonner"
import { updateVideo, deleteVideo } from "@/app/actions/help-hub"
import { createClient } from "@/lib/supabase/client"
import { ArrowLeft, Save, Trash2 } from "lucide-react"

export default function EditVideoPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [videoId, setVideoId] = useState("")
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [formData, setFormData] = useState({
    title: "",
    thumbnail_url: "",
    youtube_url: "",
    duration: "",
    published_date: "",
    display_order: "0",
    is_published: false,
  })

  useEffect(() => {
    params.then((resolvedParams) => {
      setVideoId(resolvedParams.id)
      fetchVideo(resolvedParams.id)
    })
  }, [params])

  const fetchVideo = async (id: string) => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("help_videos")
        .select("*")
        .eq("id", id)
        .single()

      if (error) throw error

      if (data) {
        setFormData({
          title: data.title || "",
          thumbnail_url: data.thumbnail_url || "",
          youtube_url: data.youtube_url || "",
          duration: data.duration || "",
          published_date: data.published_date || "",
          display_order: String(data.display_order ?? 0),
          is_published: data.is_published ?? false,
        })
      }
    } catch (error) {
      console.error("Error fetching video:", error)
      toast.error("Fehler beim Laden des Videos")
      router.push("/admin/dashboard/help")
    } finally {
      setFetching(false)
    }
  }

  const isYouTubeUrl = (url: string) => {
    return url.includes("youtube.com") || url.includes("youtu.be")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const submitData = new FormData()
    submitData.append("title", formData.title)
    submitData.append("thumbnail_url", formData.thumbnail_url)
    submitData.append("youtube_url", formData.youtube_url)
    submitData.append("duration", formData.duration)
    submitData.append("published_date", formData.published_date)
    submitData.append("display_order", formData.display_order)
    submitData.append("is_published", String(formData.is_published))

    const loadingToast = toast.loading("Video wird aktualisiert...")
    const result = await updateVideo(videoId, submitData)

    if (result.success) {
      toast.success("Video aktualisiert", {
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

  const handleDelete = async () => {
    const loadingToast = toast.loading("Video wird gelöscht...")
    const result = await deleteVideo(videoId)

    if (result.success) {
      toast.success("Video gelöscht", {
        id: loadingToast,
        description: result.message,
      })
      router.push("/admin/dashboard/help")
    } else {
      toast.error("Fehler", {
        id: loadingToast,
        description: result.error,
      })
    }
  }

  if (fetching) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
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
          <h1 className="text-3xl font-medium text-foreground">Video bearbeiten</h1>
          <p className="text-muted-foreground mt-1">Bearbeiten Sie die Videoinformationen</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash2 className="h-4 w-4 mr-2" />
              Löschen
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Video löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Möchten Sie dieses Video wirklich löschen? Diese Aktion kann nicht rückgängig
                gemacht werden.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                Löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Form */}
      <form className="space-y-6">
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
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !isValid}
          >
            <Save className="h-4 w-4 mr-2" />
            Änderungen speichern
          </Button>
        </div>
      </form>
    </div>
  )
}
