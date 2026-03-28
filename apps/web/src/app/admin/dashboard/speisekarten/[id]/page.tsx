"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ArrowLeft, Save, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { updateRestaurant } from "@/app/actions/restaurants"
import { generateSlug } from "@/types/restaurant"
import type { Restaurant, RestaurantStatus } from "@/types/restaurant"
import { ImageUploadDropzone } from "@/components/ui/image-upload-dropzone"
import { MenuTab } from "@/components/admin/restaurants/menu-tab"
import { SpecialMenusTab } from "@/components/admin/restaurants/special-menus-tab"
import { LocationPicker } from "@/components/admin/LocationPicker"

type TabType = "details" | "speisekarte" | "spezialmenus"

export default function RestaurantDetailPage() {
  const router = useRouter()
  const params = useParams()
  const restaurantId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>("details")
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
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

  const fetchRestaurant = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("id", restaurantId)
        .single()

      if (error) throw error

      setRestaurant(data)
      setFormData({
        name: data.name,
        slug: data.slug,
        description: data.description || "",
        logo_url: data.logo_url || "",
        cover_image_url: data.cover_image_url || "",
        background_color: data.background_color || "#4CAF50",
        address: data.address || "",
        phone: data.phone || "",
        website_url: data.website_url || "",
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        status: data.status,
        is_featured: data.is_featured,
      })
    } catch (error) {
      console.error("Error fetching restaurant:", error)
      toast.error("Restaurant nicht gefunden")
      router.push("/admin/dashboard/speisekarten")
    } finally {
      setLoading(false)
    }
  }, [restaurantId, router])

  useEffect(() => {
    fetchRestaurant()
  }, [fetchRestaurant])

  const handleNameChange = (name: string) => {
    setFormData({
      ...formData,
      name,
      slug: generateSlug(name),
    })
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Bitte geben Sie einen Namen ein")
      return
    }

    setSaving(true)

    const result = await updateRestaurant({
      id: restaurantId,
      ...formData,
      description: formData.description || undefined,
      logo_url: formData.logo_url || undefined,
      cover_image_url: formData.cover_image_url || undefined,
      address: formData.address || undefined,
      phone: formData.phone || undefined,
      website_url: formData.website_url || undefined,
      latitude: formData.latitude,
      longitude: formData.longitude,
    })

    if (result.success) {
      toast.success("Restaurant aktualisiert", {
        description: result.message,
      })
      setRestaurant(result.data || null)
    } else {
      toast.error("Fehler", {
        description: result.error,
      })
    }

    setSaving(false)
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!restaurant) {
    return null
  }

  const tabs = [
    { id: "details" as TabType, label: "Details" },
    { id: "speisekarte" as TabType, label: "Speisekarte" },
    { id: "spezialmenus" as TabType, label: "Spezialmenüs" },
  ]

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/admin/dashboard/speisekarten")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-medium text-foreground">{restaurant.name}</h1>
            <p className="text-muted-foreground mt-1">Restaurant bearbeiten</p>
          </div>
        </div>
        {activeTab === "details" && (
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Speichern
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "details" && (
        <div className="space-y-8">
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
              </div>

              <div className="space-y-2">
                <Label>Hintergrundbild</Label>
                <ImageUploadDropzone
                  onUploadComplete={(url) => setFormData({ ...formData, cover_image_url: url })}
                  currentImageUrl={formData.cover_image_url}
                  bucketName="images"
                  maxSizeMB={5}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="background_color">Hintergrundfarbe</Label>
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
        </div>
      )}

      {activeTab === "speisekarte" && (
        <MenuTab restaurantId={restaurantId} />
      )}

      {activeTab === "spezialmenus" && (
        <SpecialMenusTab restaurantId={restaurantId} />
      )}
    </div>
  )
}
