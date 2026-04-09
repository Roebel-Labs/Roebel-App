"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
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
import { updateCollection, deleteCollection } from "@/app/actions/help-hub"
import { createClient } from "@/lib/supabase/client"
import { ArrowLeft, Save, Trash2 } from "lucide-react"

export default function EditCollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [collectionId, setCollectionId] = useState("")
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [formData, setFormData] = useState({
    title: "",
    subtitle: "",
    icon_url: "",
    cover_image_url: "",
    display_order: "0",
    is_featured: false,
    is_published: false,
  })

  useEffect(() => {
    params.then((resolvedParams) => {
      setCollectionId(resolvedParams.id)
      fetchCollection(resolvedParams.id)
    })
  }, [params])

  const fetchCollection = async (id: string) => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("help_collections")
        .select("*")
        .eq("id", id)
        .single()

      if (error) throw error

      if (data) {
        setFormData({
          title: data.title || "",
          subtitle: data.subtitle || "",
          icon_url: data.icon_url || "",
          cover_image_url: data.cover_image_url || "",
          display_order: String(data.display_order ?? 0),
          is_featured: data.is_featured ?? false,
          is_published: data.is_published ?? false,
        })
      }
    } catch (error) {
      console.error("Error fetching collection:", error)
      toast.error("Fehler beim Laden der Sammlung")
      router.push("/admin/dashboard/help")
    } finally {
      setFetching(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const submitData = new FormData()
    submitData.append("title", formData.title)
    submitData.append("subtitle", formData.subtitle)
    submitData.append("icon_url", formData.icon_url)
    submitData.append("cover_image_url", formData.cover_image_url)
    submitData.append("display_order", formData.display_order)
    submitData.append("is_featured", String(formData.is_featured))
    submitData.append("is_published", String(formData.is_published))

    const loadingToast = toast.loading("Sammlung wird aktualisiert...")
    const result = await updateCollection(collectionId, submitData)

    if (result.success) {
      toast.success("Sammlung aktualisiert", {
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
    const loadingToast = toast.loading("Sammlung wird gelöscht...")
    const result = await deleteCollection(collectionId)

    if (result.success) {
      toast.success("Sammlung gelöscht", {
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

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-medium text-foreground">Sammlung bearbeiten</h1>
          <p className="text-muted-foreground mt-1">Bearbeiten Sie die Sammlungsinformationen</p>
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
              <AlertDialogTitle>Sammlung löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Möchten Sie diese Sammlung wirklich löschen? Alle zugehörigen Hilfe-Artikel werden
                ebenfalls gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
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
              placeholder="z.B. Erste Schritte"
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="subtitle">Untertitel</Label>
            <Textarea
              id="subtitle"
              value={formData.subtitle}
              onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
              placeholder="Kurze Beschreibung der Sammlung"
              rows={2}
              className="mt-1"
            />
          </div>
        </div>

        {/* Media */}
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <h3 className="font-medium text-lg">Medien</h3>
          <div>
            <Label>Icon</Label>
            <div className="mt-2">
              <ImageUploadDropzone
                onUploadComplete={(url) => setFormData({ ...formData, icon_url: url })}
                currentImageUrl={formData.icon_url}
                bucketName="news-images"
                maxSizeMB={2}
              />
            </div>
          </div>
          <div>
            <Label>Titelbild</Label>
            <div className="mt-2">
              <ImageUploadDropzone
                onUploadComplete={(url) => setFormData({ ...formData, cover_image_url: url })}
                currentImageUrl={formData.cover_image_url}
                bucketName="news-images"
                maxSizeMB={5}
              />
            </div>
          </div>
        </div>

        {/* Settings */}
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <h3 className="font-medium text-lg">Einstellungen</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <div className="flex items-center gap-3 pt-6">
              <Switch
                id="is_featured"
                checked={formData.is_featured}
                onCheckedChange={(checked) => setFormData({ ...formData, is_featured: checked })}
              />
              <Label htmlFor="is_featured">Hervorgehoben</Label>
            </div>
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
            disabled={loading || !formData.title}
          >
            <Save className="h-4 w-4 mr-2" />
            Änderungen speichern
          </Button>
        </div>
      </form>
    </div>
  )
}
