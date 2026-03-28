"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Calendar, Users, Clock, CheckCircle, XCircle, MapPin, User, Mail, Phone, Eye, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"
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
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [events, setEvents] = useState<Event[]>([])
  const [stats, setStats] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    total: 0,
  })
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const supabase = createClient()

      // Get all events
      const { data: allEvents, error: eventsError } = await supabase
        .from("events")
        .select("*")
        .order("created_at", { ascending: false })

      if (eventsError) throw eventsError

      setEvents(allEvents || [])

      // Calculate stats
      const pending = allEvents?.filter((e) => e.status === "pending").length || 0
      const approved = allEvents?.filter((e) => e.status === "approved").length || 0
      const rejected = allEvents?.filter((e) => e.status === "rejected").length || 0
      const total = allEvents?.length || 0

      setStats({ pending, approved, rejected, total })
    } catch (error) {
      console.error("Error fetching data:", error)
      toast({
        title: "Fehler beim Laden der Daten",
        description: "Die Daten konnten nicht geladen werden.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleStatusChange = async (eventId: string, newStatus: "approved" | "rejected") => {
    try {
      const supabase = createClient()
      const { error } = await supabase.from("events").update({ status: newStatus }).eq("id", eventId)

      if (error) throw error

      toast({
        title: newStatus === "approved" ? "Event genehmigt" : "Event abgelehnt",
        description: `Das Event wurde erfolgreich ${newStatus === "approved" ? "genehmigt" : "abgelehnt"}.`,
      })

      fetchData() // Refresh data
    } catch (error) {
      console.error("Error updating event status:", error)
      toast({
        title: "Fehler",
        description: "Der Status konnte nicht aktualisiert werden.",
        variant: "destructive",
      })
    }
  }

  const handleDelete = async (eventId: string) => {
    try {
      const supabase = createClient()
      const { error } = await supabase.from("events").delete().eq("id", eventId)

      if (error) throw error

      toast({
        title: "Event gelöscht",
        description: "Das Event wurde erfolgreich gelöscht.",
      })

      fetchData() // Refresh data
    } catch (error) {
      console.error("Error deleting event:", error)
      toast({
        title: "Fehler",
        description: "Das Event konnte nicht gelöscht werden.",
        variant: "destructive",
      })
    }
  }

  const pendingEvents = events.filter((e) => e.status === "pending")

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Stats Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="bg-card border border-border shadow-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Pending Events Skeleton */}
        <Card className="bg-card border border-border shadow-none">
          <CardHeader>
            <Skeleton className="h-6 w-64 mb-2" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-lg overflow-hidden">
                  <div className="flex">
                    <Skeleton className="w-24 h-24 flex-shrink-0" />
                    <div className="flex-1 p-4 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-card border border-border shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Wartende Events</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-medium">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Warten auf Überprüfung</p>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Genehmigte Events</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-medium">{stats.approved}</div>
            <p className="text-xs text-muted-foreground">Aktuell veröffentlicht</p>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Abgelehnte Events</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-medium">{stats.rejected}</div>
            <p className="text-xs text-muted-foreground">Nicht genehmigt</p>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamt Events</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-medium">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Alle Einreichungen</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Events Review */}
      <Card className="bg-card border border-border shadow-none">
        <CardHeader>
          <CardTitle>Wartende Events überprüfen</CardTitle>
          <p className="text-sm text-muted-foreground">
            {stats.pending} Event{stats.pending !== 1 ? "s" : ""} warten auf Ihre Überprüfung
          </p>
        </CardHeader>
        <CardContent>
          {pendingEvents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Keine wartenden Events</p>
              <p className="text-sm">Alles erledigt! Neue Einreichungen erscheinen hier zur Überprüfung.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {pendingEvents.map((event) => (
                <div key={event.id} className="bg-card border border-border shadow-none rounded-lg overflow-hidden">
                  <div className="flex">
                    {/* Image */}
                    <div className="w-24 h-24 flex-shrink-0">
                      {event.image_url ? (
                        <img
                          src={event.image_url}
                          alt={event.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center">
                          <Calendar className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm leading-tight truncate">{event.title}</h3>
                          {event.category && (
                            <Badge variant="outline" className="text-xs mt-1">{event.category}</Badge>
                          )}
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="flex flex-col gap-1 min-w-0">
                          <Button size="sm" variant="outline" onClick={() => router.push(`/events/${event.id}?from=dashboard`)} className="w-full text-xs">
                            <Eye className="h-3 w-3 mr-1" />
                            Ansehen
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleStatusChange(event.id, "approved")}
                            className="bg-green-600 hover:bg-green-700 w-full text-xs"
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Genehmigen
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleStatusChange(event.id, "rejected")} className="w-full text-xs">
                            <XCircle className="h-3 w-3 mr-1" />
                            Ablehnen
                          </Button>
                        </div>
                      </div>

                      {/* Compact Info */}
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>{new Date(event.date).toLocaleDateString("de-DE")}</span>
                          {event.time && <span>• {event.time}</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate">{event.location}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span className="truncate">{event.organizer_name}</span>
                        </div>
                      </div>

                      {/* Delete Button */}
                      <div className="mt-2">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline" className="h-6 px-2 text-xs">
                              <Trash2 className="h-3 w-3 mr-1" />
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
                              <AlertDialogAction onClick={() => handleDelete(event.id)}>Löschen</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
