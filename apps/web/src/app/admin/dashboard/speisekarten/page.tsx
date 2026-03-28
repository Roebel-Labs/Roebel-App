"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
import { Plus, Search, Edit, Trash2, Star, UtensilsCrossed, MapPin, Phone } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { deleteRestaurant, toggleRestaurantFeatured } from "@/app/actions/restaurants"
import type { Restaurant, RestaurantStatus } from "@/types/restaurant"
import { getRestaurantStatusBadge } from "@/types/restaurant"

export default function SpeisekartenPage() {
  const router = useRouter()
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [filteredRestaurants, setFilteredRestaurants] = useState<Restaurant[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  const fetchRestaurants = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })

      if (error) throw error

      setRestaurants(data || [])
    } catch (error) {
      console.error("Error fetching restaurants:", error)
      toast.error("Fehler beim Laden der Restaurants")
    } finally {
      setLoading(false)
    }
  }, [])

  const filterRestaurants = useCallback(() => {
    let filtered = restaurants

    if (searchTerm) {
      filtered = filtered.filter(
        (restaurant) =>
          restaurant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          restaurant.address?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((restaurant) => restaurant.status === statusFilter)
    }

    setFilteredRestaurants(filtered)
  }, [restaurants, searchTerm, statusFilter])

  useEffect(() => {
    fetchRestaurants()
  }, [fetchRestaurants])

  useEffect(() => {
    filterRestaurants()
  }, [filterRestaurants])

  const handleDelete = async (id: string) => {
    const loadingToast = toast.loading("Restaurant wird gelöscht...")

    const result = await deleteRestaurant(id)

    if (result.success) {
      toast.success("Restaurant gelöscht", {
        id: loadingToast,
        description: result.message,
      })
      fetchRestaurants()
    } else {
      toast.error("Fehler", {
        id: loadingToast,
        description: result.error,
      })
    }
  }

  const handleToggleFeatured = async (id: string, is_featured: boolean) => {
    const loadingToast = toast.loading("Status wird aktualisiert...")

    const result = await toggleRestaurantFeatured(id, is_featured)

    if (result.success) {
      toast.success("Status aktualisiert", {
        id: loadingToast,
        description: result.message,
      })
      fetchRestaurants()
    } else {
      toast.error("Fehler", {
        id: loadingToast,
        description: result.error,
      })
    }
  }

  const getStatusBadge = (status: RestaurantStatus) => {
    const { label, className } = getRestaurantStatusBadge(status)
    return <Badge className={className}>{label}</Badge>
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-10 w-44" />
        </div>

        {/* Search and Filter Skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-[200px]" />
        </div>

        {/* Restaurants List Skeleton */}
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-[10px] p-4">
              <div className="flex gap-4">
                <Skeleton className="w-20 h-20 rounded-[8px] flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-medium text-foreground">Speisekarten</h1>
          <p className="text-muted-foreground mt-1">Verwalten Sie Restaurants und ihre Speisekarten</p>
        </div>
        <Button onClick={() => router.push("/admin/dashboard/speisekarten/new")}>
          <Plus className="h-4 w-4 mr-2" />
          Neues Restaurant
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Restaurant suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="pending">Ausstehend</SelectItem>
            <SelectItem value="approved">Freigegeben</SelectItem>
            <SelectItem value="rejected">Abgelehnt</SelectItem>
            <SelectItem value="published">Veröffentlicht</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Restaurants List */}
      <div className="space-y-3">
        {filteredRestaurants.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border rounded-[10px]">
            <UtensilsCrossed className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Keine Restaurants gefunden</p>
            <Button variant="link" onClick={() => router.push("/admin/dashboard/speisekarten/new")} className="mt-2">
              Erstes Restaurant erstellen
            </Button>
          </div>
        ) : (
          filteredRestaurants.map((restaurant) => (
            <div
              key={restaurant.id}
              className="bg-card border border-border rounded-[10px] p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex gap-4">
                {/* Logo */}
                <div
                  className="w-20 h-20 rounded-[8px] overflow-hidden flex-shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: restaurant.background_color || "#4CAF50" }}
                >
                  {restaurant.logo_url ? (
                    <img
                      src={restaurant.logo_url}
                      alt={restaurant.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UtensilsCrossed className="h-8 w-8 text-white" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-lg">{restaurant.name}</h3>
                        {getStatusBadge(restaurant.status)}
                        {restaurant.is_featured && (
                          <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                        )}
                      </div>
                      {restaurant.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1 mb-2">
                          {restaurant.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {restaurant.address && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {restaurant.address}
                          </span>
                        )}
                        {restaurant.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {restaurant.phone}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => router.push(`/admin/dashboard/speisekarten/${restaurant.id}`)}
                      >
                        <Edit className="h-4 w-4 mr-1.5" />
                        Bearbeiten
                      </Button>

                      <Button
                        size="sm"
                        variant={restaurant.is_featured ? "default" : "outline"}
                        onClick={() => handleToggleFeatured(restaurant.id, !restaurant.is_featured)}
                        className="w-9 h-9 p-0"
                        title={restaurant.is_featured ? "Featured entfernen" : "Als Featured markieren"}
                      >
                        <Star
                          className={`h-4 w-4 ${restaurant.is_featured ? "fill-current" : ""}`}
                        />
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost">
                            <Trash2 className="h-4 w-4 mr-1.5" />
                            Löschen
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Restaurant löschen?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Diese Aktion kann nicht rückgängig gemacht werden. Das Restaurant und
                              alle zugehörigen Speisekarten werden dauerhaft gelöscht.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(restaurant.id)}>
                              Löschen
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
