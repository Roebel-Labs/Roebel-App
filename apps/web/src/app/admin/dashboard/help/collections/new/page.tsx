"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { ImageUploadDropzone } from "@/components/ui/image-upload-dropzone"
import { toast } from "sonner"
import { createCollection } from "@/app/actions/help-hub"
import { ArrowLeft, Save, Eye } from "lucide-react"

export default function NewCollectionPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: "",
    subtitle: "",
    icon_url: "",
    cover_image_url: "",
    display_order: "0",
    is_featured: false,
  })

  const handleSubmit = async (e: React.FormEvent, publish: boolean) => {
    e.preventDefault()
    setLoading(true)

    const submitData = new FormData()
    submitData.append("title", formData.title)
    submitData.append("subtitle", formData.subtitle)
    submitData.append("icon_url", formData.icon_url)
    submitData.append("cover_image_url", formData.cover_image_url)
    submitData.append("display_order", formData.display_order)
    submitData.append("is_featured", String(formData.is_featured))
    submitData.append("is_published", String(publish))

    const loadingToast = toast.loading(
      publish ? "Sammlung wird veröffentlicht..." : "Entwurf wird gespeichert..."
    )

    const result = await createCollection(submitData)

    if (result.success) {
      toast.success(publish ? "Sammlung veröffentlicht" : "Entwurf gespeichert", {
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

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-medium text-foreground">Neue Sammlung</h1>
          <p className="text-muted-foreground mt-1">Erstellen Sie eine neue Hilfe-Sammlung</p>
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
              <p className="text-xs text-muted-foreground mt-1">
                Niedrigere Zahl = weiter oben
              </p>
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
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={(e) => handleSubmit(e, false)}
              disabled={loading || !formData.title}
            >
              <Save className="h-4 w-4 mr-2" />
              Als Entwurf speichern
            </Button>
            <Button
              type="button"
              onClick={(e) => handleSubmit(e, true)}
              disabled={loading || !formData.title}
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
