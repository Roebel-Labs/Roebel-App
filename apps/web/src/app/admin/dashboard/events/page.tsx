"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar, MapPin, User, Eye, Trash2, Search, Star, X, Pencil } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
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
import { EventStoryAudioPanel } from "./_components/EventStoryAudioPanel"

interface Event {
  id: string
  title: string
  description: string | null
  date: string
  time: string | null
  location: string
  organizer_name: string
  organizer_email: string
  organizer_phone: string | null
  category: string | null
  status: string
  created_at: string
  image_url: string | null
  website_url: string | null
  ticket_price: number | null
  max_attendees: number | null
  is_popular?: boolean
}

export default function EventsManagementPage() {
  const router = useRouter()
  const [events, setEvents] = useState<Event[]>([])
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([])
  const [featuredEvents, setFeaturedEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  useEffect(() => {
    fetchEvents()
  }, [])

  useEffect(() => {
    filterEvents()
  }, [events, searchTerm, statusFilter])

  const fetchEvents = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase.from("events").select("*").order("date", { ascending: true })

      if (error) throw error

      const allEvents = data || []
      setEvents(allEvents)

      // Get featured events (is_popular) - up to 3
      const featured = allEvents.filter(event => event.is_popular).slice(0, 3)
      setFeaturedEvents(featured)
    } catch (error) {
      console.error("Error fetching events:", error)
      toast.error("Fehler beim Laden der Events", {
        description: "Die Events konnten nicht geladen werden."
      })
    } finally {
      setLoading(false)
    }
  }

  const filterEvents = () => {
    let filtered = events

    if (searchTerm) {
      filtered = filtered.filter(
        (event) =>
          event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          event.organizer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          event.location.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((event) => event.status === statusFilter)
    }

    setFilteredEvents(filtered)
  }

  const handleStatusChange = async (eventId: string, newStatus: "approved" | "rejected" | "pending") => {
    const loadingToast = toast.loading("Status wird aktualisiert...")

    try {
      const supabase = createClient()
      const { error } = await supabase.from("events").update({ status: newStatus }).eq("id", eventId)

      if (error) throw error

      toast.success("Status aktualisiert", {
        id: loadingToast,
        description: `Das Event wurde auf "${newStatus}" gesetzt.`
      })

      fetchEvents()
    } catch (error) {
      console.error("Error updating event status:", error)
      toast.error("Fehler", {
        id: loadingToast,
        description: "Der Status konnte nicht aktualisiert werden."
      })
    }
  }

  const handleDelete = async (eventId: string) => {
    const loadingToast = toast.loading("Event wird gelöscht...")

    try {
      const supabase = createClient()
      const { error } = await supabase.from("events").delete().eq("id", eventId)

      if (error) throw error

      toast.success("Event gelöscht", {
        id: loadingToast,
        description: "Das Event wurde erfolgreich gelöscht."
      })

      fetchEvents()
    } catch (error) {
      console.error("Error deleting event:", error)
      toast.error("Fehler", {
        id: loadingToast,
        description: "Das Event konnte nicht gelöscht werden."
      })
    }
  }

  const handlePopularToggle = async (eventId: string, isPopular: boolean) => {
    const loadingToast = toast.loading(isPopular ? "Event wird als beliebt markiert..." : "Beliebt-Status wird entfernt...")

    try {
      const supabase = createClient()

      // Check if we're trying to add a 4th popular event
      if (isPopular && featuredEvents.length >= 3) {
        toast.error("Maximum erreicht", {
          id: loadingToast,
          description: "Es können nur maximal 3 Events als beliebt markiert werden."
        })
        return
      }

      const { error } = await supabase.from("events").update({ is_popular: isPopular }).eq("id", eventId)

      if (error) throw error

      toast.success(isPopular ? "Event markiert" : "Markierung entfernt", {
        id: loadingToast,
        description: isPopular
          ? "Das Event wurde als beliebt markiert."
          : "Das Event wurde aus den beliebten Events entfernt."
      })

      fetchEvents()
    } catch (error) {
      console.error("Error toggling popular status:", error)
      toast.error("Fehler", {
        id: loadingToast,
        description: "Der Beliebtheits-Status konnte nicht aktualisiert werden."
      })
    }
  }

  const handleRemoveFromFeatured = async (eventId: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent card click
    await handlePopularToggle(eventId, false)
  }

  if (loading) {
    return (
      <div className="space-y-8">
        {/* Header Skeleton */}
        <div>
          <Skeleton className="h-9 w-80 mb-2" />
        </div>

        {/* Featured Events Skeleton */}
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="rounded-[10px] h-[500px]" />
          ))}
        </div>

        {/* All Events Section Skeleton */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-8 w-32" />
            <div className="flex items-center gap-3 flex-1 max-w-2xl">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-[180px]" />
            </div>
          </div>

          {/* Events List Skeleton */}
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-[10px] p-4">
                <div className="flex gap-4">
                  <Skeleton className="w-20 h-20 rounded-[8px] flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Create array of 3 slots for featured events
  const featuredSlots = Array.from({ length: 3 }, (_, i) => featuredEvents[i] || null)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-medium text-foreground mb-2">Veranstaltungen verwalten</h1>
      </div>

      {/* Featured Events Cards - Always 3 columns */}
      <div className="grid grid-cols-3 gap-4">
        {featuredSlots.map((event, index) => (
          event ? (
            // Actual Event Card
            <div
              key={event.id}
              className="relative rounded-[10px] overflow-hidden h-[500px] cursor-pointer group"
              onClick={() => router.push(`/events/${event.id}`)}
            >
              {event.image_url ? (
                <img
                  src={event.image_url}
                  alt={event.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-gray-400 to-gray-600"></div>
              )}

              {/* Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>

              {/* Badge */}
              <div className="absolute top-4 left-4">
                <Badge className="bg-card text-foreground hover:bg-card/90 flex items-center gap-1">
                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                  Event des Tages
                </Badge>
              </div>

              {/* Remove Button - Always visible */}
              <button
                onClick={(e) => handleRemoveFromFeatured(event.id, e)}
                className="absolute top-4 right-4 bg-card text-foreground rounded-full p-2 transition-colors hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Content */}
              <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                <h3 className="text-2xl font-medium mb-2">{event.title}</h3>
                <p className="text-sm text-white/90 mb-4 line-clamp-3">
                  {event.description || "Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua."}
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4" />
                  <span>{event.location}</span>
                </div>
              </div>
            </div>
          ) : (
            // Placeholder Card
            <div
              key={`placeholder-${index}`}
              className="relative rounded-[10px] overflow-hidden h-[500px] bg-muted flex items-center justify-center"
            >
              <div className="text-center text-muted-foreground">
                <Star className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Kein Event des Tages</p>
              </div>
            </div>
          )
        ))}
      </div>

      {/* Shared background audio for all event stories */}
      <EventStoryAudioPanel />

      {/* All Events Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-medium">Alle Events</h2>
          <div className="flex items-center gap-3 flex-1 max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Nach Titel, Organisation oder Ort suchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Alle Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="pending">Wartend</SelectItem>
                <SelectItem value="approved">Genehmigt</SelectItem>
                <SelectItem value="rejected">Abgelehnt</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Events List */}
        <div className="space-y-3">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Keine Events gefunden</p>
            </div>
          ) : (
            filteredEvents.map((event) => (
              <div
                key={event.id}
                className="bg-card border border-border rounded-[10px] p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex gap-4">
                  {/* Thumbnail */}
                  <div className="w-20 h-20 rounded-[8px] overflow-hidden flex-shrink-0 bg-muted">
                    {event.image_url ? (
                      <img
                        src={event.image_url}
                        alt={event.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Calendar className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {event.category && (
                            <Badge variant="secondary" className="text-xs">
                              {event.category}
                            </Badge>
                          )}
                          <h3 className="font-medium text-base truncate">{event.title}</h3>
                        </div>

                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>
                              {new Date(event.date).toLocaleDateString("de-DE", {
                                day: "2-digit",
                                month: "short"
                              })}
                              {event.time && ` - ${event.time}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3.5 w-3.5" />
                            <span className="truncate">{event.location}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <User className="h-3.5 w-3.5" />
                            <span className="truncate">{event.organizer_name}</span>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => router.push(`/events/${event.id}`)}
                          className="h-9"
                        >
                          <Eye className="h-4 w-4 mr-1.5" />
                          Ansehen
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => router.push(`/admin/dashboard/events/${event.id}/edit`)}
                          className="h-9"
                        >
                          <Pencil className="h-4 w-4 mr-1.5" />
                          Bearbeiten
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-9">
                              <Trash2 className="h-4 w-4 mr-1.5" />
                              Löschen
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Event löschen?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Diese Aktion kann nicht rückgängig gemacht werden. Das Event wird dauerhaft gelöscht.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(event.id)}>
                                Löschen
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>

                        <Select
                          value={event.status}
                          onValueChange={(value) => handleStatusChange(event.id, value as any)}
                        >
                          <SelectTrigger className="w-[130px] h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Wartend</SelectItem>
                            <SelectItem value="approved">Genehmigt</SelectItem>
                            <SelectItem value="rejected">Abgelehnt</SelectItem>
                          </SelectContent>
                        </Select>

                        <Button
                          size="sm"
                          variant={event.is_popular ? "default" : "outline"}
                          onClick={() => handlePopularToggle(event.id, !event.is_popular)}
                          className="h-9 w-9 p-0"
                          title={event.is_popular ? "Von beliebten Events entfernen" : "Als beliebt markieren"}
                        >
                          <Star className={`h-4 w-4 ${event.is_popular ? "fill-current" : ""}`} />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  )
}
