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
import { RichTextEditor } from "@/components/editor/rich-text-editor"
import { ImageUploadDropzone } from "@/components/ui/image-upload-dropzone"
import { toast } from "sonner"
import { createNewsArticle } from "@/app/actions/news"
import { ArrowLeft, Save, Eye } from "lucide-react"

const CATEGORIES = ["Stadtnachrichten", "Veranstaltungen", "Kultur", "Politik", "Wirtschaft", "Sport", "Boxen"]

export default function NewNewsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: "",
    excerpt: "",
    content: "",
    cover_image_url: "",
    author_name: "Admin",
    author_email: "admin@roebel.de",
    category: "",
    tags: "",
    status: "draft" as "draft" | "published",
    is_featured: false,
  })

  const handleSubmit = async (e: React.FormEvent, status: "draft" | "published") => {
    e.preventDefault()
    setLoading(true)

    const submitData = new FormData()
    Object.entries({ ...formData, status }).forEach(([key, value]) => {
      submitData.append(key, String(value))
    })

    const loadingToast = toast.loading(
      status === "published" ? "Artikel wird veröffentlicht..." : "Entwurf wird gespeichert..."
    )

    const result = await createNewsArticle(submitData)

    if (result.success) {
      toast.success(status === "published" ? "Artikel veröffentlicht" : "Entwurf gespeichert", {
        id: loadingToast,
        description: result.message,
      })
      router.push("/admin/dashboard/news")
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
          <h1 className="text-3xl font-medium text-foreground">Neuer Artikel</h1>
          <p className="text-muted-foreground mt-1">Erstellen Sie einen neuen Nachrichtenartikel</p>
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
              placeholder="Geben Sie einen aussagekräftigen Titel ein"
              required
              className="mt-1"
            />
          </div>

          {/* Excerpt */}
          <div>
            <Label htmlFor="excerpt">Kurzbeschreibung</Label>
            <Textarea
              id="excerpt"
              value={formData.excerpt}
              onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
              placeholder="Eine kurze Zusammenfassung des Artikels (wird in Vorschauen angezeigt)"
              rows={3}
              className="mt-1"
            />
          </div>

          {/* Cover Image */}
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

          {/* Content Editor */}
          <div>
            <Label>Inhalt *</Label>
            <div className="mt-2">
              <RichTextEditor
                content={formData.content}
                onChange={(content) => setFormData({ ...formData, content })}
                placeholder="Schreiben Sie Ihren Artikel hier..."
              />
            </div>
          </div>
        </div>

        {/* Metadata */}
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <h3 className="font-medium text-lg">Metadaten</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Author */}
            <div>
              <Label htmlFor="author_name">Autor *</Label>
              <Input
                id="author_name"
                value={formData.author_name}
                onChange={(e) => setFormData({ ...formData, author_name: e.target.value })}
                required
                className="mt-1"
              />
            </div>

            {/* Author Email */}
            <div>
              <Label htmlFor="author_email">Autor E-Mail</Label>
              <Input
                id="author_email"
                type="email"
                value={formData.author_email}
                onChange={(e) => setFormData({ ...formData, author_email: e.target.value })}
                className="mt-1"
              />
            </div>

            {/* Category */}
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

            {/* Tags */}
            <div>
              <Label htmlFor="tags">Tags (kommagetrennt)</Label>
              <Input
                id="tags"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="Tag1, Tag2, Tag3"
                className="mt-1"
              />
            </div>
          </div>

          {/* Featured */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_featured"
              checked={formData.is_featured}
              onChange={(e) => setFormData({ ...formData, is_featured: e.target.checked })}
              className="rounded border-border"
            />
            <Label htmlFor="is_featured" className="cursor-pointer">
              Als Featured markieren (wird prominent angezeigt)
            </Label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            variant="outline"
            onClick={(e) => handleSubmit(e, "draft")}
            disabled={loading || !formData.title || !formData.content}
          >
            <Save className="h-4 w-4 mr-2" />
            Als Entwurf speichern
          </Button>
          <Button
            type="submit"
            onClick={(e) => handleSubmit(e, "published")}
            disabled={loading || !formData.title || !formData.content}
          >
            <Eye className="h-4 w-4 mr-2" />
            Veröffentlichen
          </Button>
        </div>
      </form>
    </div>
  )
}
