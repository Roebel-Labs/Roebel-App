"use client"

import { useEffect, useState } from "react"
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
import { updateMovie, deleteMovie, type Movie } from "@/app/actions/movies"
import { createClient } from "@/lib/supabase/client"
import { ArrowLeft, Save, Trash2 } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

const FSK_OPTIONS = ["FSK 0", "FSK 6", "FSK 12", "FSK 16", "FSK 18"]

export default function EditMoviePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [movieId, setMovieId] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [fetchingMovie, setFetchingMovie] = useState(true)
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    date: "",
    time: "",
    cover_image_url: "",
    trailer_youtube_url: "",
    fsk: "",
    status: "draft" as "draft" | "published" | "archived",
  })

  useEffect(() => {
    params.then((resolvedParams) => {
      setMovieId(resolvedParams.id)
      fetchMovie(resolvedParams.id)
    })
  }, [params])

  const fetchMovie = async (id: string) => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("movies")
        .select("*")
        .eq("id", id)
        .single()

      if (error) throw error

      if (data) {
        setFormData({
          title: data.title || "",
          description: data.description || "",
          date: data.date || "",
          time: data.time || "",
          cover_image_url: data.cover_image_url || "",
          trailer_youtube_url: data.trailer_youtube_url || "",
          fsk: data.fsk || "",
          status: data.status || "draft",
        })
      }
    } catch (error) {
      console.error("Error fetching movie:", error)
      toast.error("Fehler beim Laden des Films")
      router.push("/admin/dashboard/movies")
    } finally {
      setFetchingMovie(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent, status: "draft" | "published" | "archived") => {
    e.preventDefault()
    setLoading(true)

    const submitData = new FormData()
    Object.entries({ ...formData, status }).forEach(([key, value]) => {
      submitData.append(key, String(value))
    })

    const loadingToast = toast.loading("Film wird aktualisiert...")

    const result = await updateMovie(movieId, submitData)

    if (result.success) {
      toast.success("Film aktualisiert", {
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

  const handleDelete = async () => {
    const loadingToast = toast.loading("Film wird gelöscht...")

    const result = await deleteMovie(movieId)

    if (result.success) {
      toast.success("Film gelöscht", {
        id: loadingToast,
        description: result.message,
      })
      router.push("/admin/dashboard/movies")
    } else {
      toast.error("Fehler", {
        id: loadingToast,
        description: result.error,
      })
    }
  }

  const isYouTubeUrl = (url: string) => {
    return url.includes("youtube.com") || url.includes("youtu.be")
  }

  if (fetchingMovie) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
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
          <h1 className="text-3xl font-medium text-foreground">Film bearbeiten</h1>
          <p className="text-muted-foreground mt-1">Bearbeiten Sie die Filminformationen</p>
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
              <AlertDialogTitle>Film löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Möchten Sie diesen Film wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700"
              >
                Löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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

          {/* Status */}
          <div>
            <Label htmlFor="status">Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value: "draft" | "published" | "archived") =>
                setFormData({ ...formData, status: value })
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Entwurf</SelectItem>
                <SelectItem value="published">Veröffentlicht</SelectItem>
                <SelectItem value="archived">Archiviert</SelectItem>
              </SelectContent>
            </Select>
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
          <Button
            type="button"
            onClick={(e) => handleSubmit(e, formData.status)}
            disabled={loading || !formData.title || !formData.date}
          >
            <Save className="h-4 w-4 mr-2" />
            Änderungen speichern
          </Button>
        </div>
      </form>
    </div>
  )
}
