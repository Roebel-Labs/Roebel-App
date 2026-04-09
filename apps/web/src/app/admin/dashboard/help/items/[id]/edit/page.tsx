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
import { updateItem, deleteItem } from "@/app/actions/help-hub"
import { createClient } from "@/lib/supabase/client"
import { ArrowLeft, Save, Trash2, Plus, X, ChevronUp, ChevronDown } from "lucide-react"

export default function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [itemId, setItemId] = useState("")
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [collections, setCollections] = useState<{ id: string; title: string }[]>([])
  const [formData, setFormData] = useState({
    collection_id: "",
    title: "",
    subtitle: "",
    icon_url: "",
    hero_media_url: "",
    hero_media_type: "image",
    body_text: "",
    steps: [] as string[],
    action_enabled: false,
    action_label: "",
    action_route: "",
    display_order: "0",
    is_published: false,
  })

  useEffect(() => {
    params.then((resolvedParams) => {
      setItemId(resolvedParams.id)
      fetchItem(resolvedParams.id)
    })
  }, [params])

  useEffect(() => {
    const fetchCollections = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from("help_collections")
        .select("id, title")
        .order("display_order", { ascending: true })
      setCollections(data || [])
    }
    fetchCollections()
  }, [])

  const fetchItem = async (id: string) => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("help_items")
        .select("*")
        .eq("id", id)
        .single()

      if (error) throw error

      if (data) {
        setFormData({
          collection_id: data.collection_id || "",
          title: data.title || "",
          subtitle: data.subtitle || "",
          icon_url: data.icon_url || "",
          hero_media_url: data.hero_media_url || "",
          hero_media_type: data.hero_media_type || "image",
          body_text: data.body_text || "",
          steps: Array.isArray(data.steps) ? data.steps : [],
          action_enabled: data.action_enabled ?? false,
          action_label: data.action_label || "",
          action_route: data.action_route || "",
          display_order: String(data.display_order ?? 0),
          is_published: data.is_published ?? false,
        })
      }
    } catch (error) {
      console.error("Error fetching item:", error)
      toast.error("Fehler beim Laden des Artikels")
      router.push("/admin/dashboard/help")
    } finally {
      setFetching(false)
    }
  }

  const isYouTubeUrl = (url: string) => {
    return url.includes("youtube.com") || url.includes("youtu.be")
  }

  // Steps management
  const addStep = () => setFormData({ ...formData, steps: [...formData.steps, ""] })
  const removeStep = (index: number) =>
    setFormData({ ...formData, steps: formData.steps.filter((_, i) => i !== index) })
  const updateStep = (index: number, value: string) => {
    const newSteps = [...formData.steps]
    newSteps[index] = value
    setFormData({ ...formData, steps: newSteps })
  }
  const moveStep = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= formData.steps.length) return
    const newSteps = [...formData.steps]
    ;[newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]]
    setFormData({ ...formData, steps: newSteps })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const submitData = new FormData()
    submitData.append("collection_id", formData.collection_id)
    submitData.append("title", formData.title)
    submitData.append("subtitle", formData.subtitle)
    submitData.append("icon_url", formData.icon_url)
    submitData.append("hero_media_url", formData.hero_media_url)
    submitData.append("hero_media_type", formData.hero_media_type)
    submitData.append("body_text", formData.body_text)
    submitData.append("steps", JSON.stringify(formData.steps.filter((s) => s.trim())))
    submitData.append("action_enabled", String(formData.action_enabled))
    submitData.append("action_label", formData.action_label)
    submitData.append("action_route", formData.action_route)
    submitData.append("display_order", formData.display_order)
    submitData.append("is_published", String(formData.is_published))

    const loadingToast = toast.loading("Artikel wird aktualisiert...")
    const result = await updateItem(itemId, submitData)

    if (result.success) {
      toast.success("Artikel aktualisiert", {
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
    const loadingToast = toast.loading("Artikel wird gelöscht...")
    const result = await deleteItem(itemId)

    if (result.success) {
      toast.success("Artikel gelöscht", {
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
          <h1 className="text-3xl font-medium text-foreground">Hilfe-Artikel bearbeiten</h1>
          <p className="text-muted-foreground mt-1">Bearbeiten Sie die Artikelinformationen</p>
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
              <AlertDialogTitle>Artikel löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Möchten Sie diesen Artikel wirklich löschen? Diese Aktion kann nicht rückgängig
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
        {/* General */}
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <div>
            <Label htmlFor="collection_id">Sammlung *</Label>
            <Select
              value={formData.collection_id || "none"}
              onValueChange={(value) =>
                setFormData({ ...formData, collection_id: value === "none" ? "" : value })
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Sammlung auswählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" disabled>
                  Sammlung auswählen
                </SelectItem>
                {collections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="title">Titel *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="z.B. Die Grundlagen"
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="subtitle">Untertitel</Label>
            <Input
              id="subtitle"
              value={formData.subtitle}
              onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
              placeholder="Kurze Beschreibung"
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
            <Label>Hero-Medientyp</Label>
            <Select
              value={formData.hero_media_type}
              onValueChange={(value) => setFormData({ ...formData, hero_media_type: value })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="image">Bild</SelectItem>
                <SelectItem value="video">Video</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Hero-Medium</Label>
            {formData.hero_media_type === "image" ? (
              <div className="mt-2">
                <ImageUploadDropzone
                  onUploadComplete={(url) => setFormData({ ...formData, hero_media_url: url })}
                  currentImageUrl={formData.hero_media_url}
                  bucketName="news-images"
                  maxSizeMB={5}
                />
              </div>
            ) : (
              <div className="mt-1">
                <Input
                  type="url"
                  value={formData.hero_media_url}
                  onChange={(e) => setFormData({ ...formData, hero_media_url: e.target.value })}
                  placeholder="https://www.youtube.com/watch?v=..."
                />
                {formData.hero_media_url && !isYouTubeUrl(formData.hero_media_url) && (
                  <p className="text-xs text-red-600 mt-1">
                    Bitte geben Sie eine gültige YouTube-URL ein
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <h3 className="font-medium text-lg">Inhalt</h3>
          <div>
            <Label htmlFor="body_text">Beschreibung</Label>
            <Textarea
              id="body_text"
              value={formData.body_text}
              onChange={(e) => setFormData({ ...formData, body_text: e.target.value })}
              placeholder="Ausführliche Beschreibung des Hilfe-Artikels"
              rows={6}
              className="mt-1"
            />
          </div>
        </div>

        {/* Steps */}
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-lg">Schritte</h3>
            <Button type="button" variant="outline" size="sm" onClick={addStep}>
              <Plus className="h-4 w-4 mr-1" />
              Schritt hinzufügen
            </Button>
          </div>
          {formData.steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Schritte hinzugefügt. Klicken Sie auf &quot;Schritt hinzufügen&quot;.
            </p>
          ) : (
            <div className="space-y-3">
              {formData.steps.map((step, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground w-6 text-center flex-shrink-0">
                    {index + 1}.
                  </span>
                  <Input
                    value={step}
                    onChange={(e) => updateStep(index, e.target.value)}
                    placeholder={`Schritt ${index + 1}`}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => moveStep(index, -1)}
                    disabled={index === 0}
                    className="h-8 w-8 flex-shrink-0"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => moveStep(index, 1)}
                    disabled={index === formData.steps.length - 1}
                    className="h-8 w-8 flex-shrink-0"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeStep(index)}
                    className="h-8 w-8 flex-shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <h3 className="font-medium text-lg">Aktion</h3>
          <div className="flex items-center gap-3">
            <Switch
              id="action_enabled"
              checked={formData.action_enabled}
              onCheckedChange={(checked) => setFormData({ ...formData, action_enabled: checked })}
            />
            <Label htmlFor="action_enabled">Aktionsbutton anzeigen</Label>
          </div>
          {formData.action_enabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="action_label">Button-Text</Label>
                <Input
                  id="action_label"
                  value={formData.action_label}
                  onChange={(e) => setFormData({ ...formData, action_label: e.target.value })}
                  placeholder="z.B. Zur Abstimmung"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="action_route">Ziel-Route</Label>
                <Input
                  id="action_route"
                  value={formData.action_route}
                  onChange={(e) => setFormData({ ...formData, action_route: e.target.value })}
                  placeholder="z.B. /governance"
                  className="mt-1"
                />
              </div>
            </div>
          )}
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
            disabled={loading || !formData.title || !formData.collection_id}
          >
            <Save className="h-4 w-4 mr-2" />
            Änderungen speichern
          </Button>
        </div>
      </form>
    </div>
  )
}
