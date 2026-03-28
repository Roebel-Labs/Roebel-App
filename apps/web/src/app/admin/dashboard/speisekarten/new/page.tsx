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
import { Switch } from "@/components/ui/switch"
import { ArrowLeft, Save, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { createRestaurant } from "@/app/actions/restaurants"
import { generateSlug } from "@/types/restaurant"
import type { RestaurantStatus } from "@/types/restaurant"
import { ImageUploadDropzone } from "@/components/ui/image-upload-dropzone"
import { LocationPicker } from "@/components/admin/LocationPicker"

export default function NewRestaurantPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    logo_url: "",
    cover_image_url: "",
    background_color: "#4CAF50",
    address: "",
    phone: "",
    website_url: "",
    latitude: null as number | null,
    longitude: null as number | null,
    status: "pending" as RestaurantStatus,
    is_featured: false,
  })

  const handleNameChange = (name: string) => {
    setFormData({
      ...formData,
      name,
      slug: generateSlug(name),
    })
  }

  const handleSubmit = async (e: React.FormEvent, status: RestaurantStatus) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error("Bitte geben Sie einen Namen ein")
      return
    }

    if (!formData.slug.trim()) {
      toast.error("Bitte geben Sie einen Slug ein")
      return
    }

    setLoading(true)

    const result = await createRestaurant({
      ...formData,
      status,
      description: formData.description || undefined,
      logo_url: formData.logo_url || undefined,
      cover_image_url: formData.cover_image_url || undefined,
      address: formData.address || undefined,
      phone: formData.phone || undefined,
      website_url: formData.website_url || undefined,
      latitude: formData.latitude ?? undefined,
      longitude: formData.longitude ?? undefined,
    })

    if (result.success) {
      toast.success("Restaurant erstellt", {
        description: result.message,
      })
      router.push(`/admin/dashboard/speisekarten/${result.data?.id}`)
    } else {
      toast.error("Fehler", {
        description: result.error,
      })
    }

    setLoading(false)
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/admin/dashboard/speisekarten")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-medium text-foreground">Neues Restaurant</h1>
          <p className="text-muted-foreground mt-1">Erstellen Sie ein neues Restaurant</p>
        </div>
      </div>

      <form className="space-y-8">
        {/* Basic Info */}
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <h2 className="text-lg font-medium">Grundinformationen</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Restaurant Name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug *</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="restaurant-name"
                required
              />
              <p className="text-xs text-muted-foreground">
                URL-freundlicher Name (automatisch generiert)
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Beschreibung</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Kurze Beschreibung des Restaurants..."
              rows={3}
            />
          </div>
        </div>

        {/* Images */}
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <h2 className="text-lg font-medium">Bilder</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Logo</Label>
              <ImageUploadDropzone
                onUploadComplete={(url) => setFormData({ ...formData, logo_url: url })}
                currentImageUrl={formData.logo_url}
                bucketName="images"
                maxSizeMB={2}
              />
              <p className="text-xs text-muted-foreground">
                Quadratisches Logo empfohlen (max. 2MB)
              </p>
            </div>

            <div className="space-y-2">
              <Label>Hintergrundbild</Label>
              <ImageUploadDropzone
                onUploadComplete={(url) => setFormData({ ...formData, cover_image_url: url })}
                currentImageUrl={formData.cover_image_url}
                bucketName="images"
                maxSizeMB={5}
              />
              <p className="text-xs text-muted-foreground">
                16:9 Format empfohlen (max. 5MB)
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="background_color">Hintergrundfarbe (wenn kein Logo)</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="background_color"
                value={formData.background_color}
                onChange={(e) => setFormData({ ...formData, background_color: e.target.value })}
                className="w-12 h-10 rounded cursor-pointer border border-border"
              />
              <Input
                value={formData.background_color}
                onChange={(e) => setFormData({ ...formData, background_color: e.target.value })}
                placeholder="#4CAF50"
                className="w-32"
              />
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <h2 className="text-lg font-medium">Kontaktinformationen</h2>

          <div className="space-y-2">
            <Label htmlFor="address">Adresse</Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Straße 123, 12345 Stadt"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="phone">Telefon</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+49 123 456789"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="website_url">Website</Label>
              <Input
                id="website_url"
                type="url"
                value={formData.website_url}
                onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                placeholder="https://www.restaurant.de"
              />
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <h2 className="text-lg font-medium">Standort</h2>
          <LocationPicker
            latitude={formData.latitude}
            longitude={formData.longitude}
            address={formData.address}
            onCoordinatesChange={(lat, lng) =>
              setFormData({ ...formData, latitude: lat, longitude: lng })
            }
          />
        </div>

        {/* Settings */}
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <h2 className="text-lg font-medium">Einstellungen</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData({ ...formData, status: value as RestaurantStatus })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Ausstehend</SelectItem>
                  <SelectItem value="approved">Freigegeben</SelectItem>
                  <SelectItem value="rejected">Abgelehnt</SelectItem>
                  <SelectItem value="published">Veröffentlicht</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between p-4 border border-border rounded-[8px]">
              <div>
                <Label>Featured</Label>
                <p className="text-xs text-muted-foreground">
                  Als hervorgehobenes Restaurant anzeigen
                </p>
              </div>
              <Switch
                checked={formData.is_featured}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_featured: checked })
                }
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/admin/dashboard/speisekarten")}
            disabled={loading}
          >
            Abbrechen
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={(e) => handleSubmit(e, "pending")}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Als Entwurf speichern
          </Button>
          <Button
            type="button"
            onClick={(e) => handleSubmit(e, "published")}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Veröffentlichen
          </Button>
        </div>
      </form>
    </div>
  )
}
