"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Clock, MapPin, User, Mail, Phone, CheckCircle, XCircle, Edit, Eye } from "lucide-react"
import { approveEvent, rejectEvent, deleteEvent } from "@/app/actions/manage-events"
import { useRouter } from "next/navigation"

interface Event {
  id: string
  title: string
  description: string | null
  date: string
  time: string | null
  end_time: string | null
  location: string
  organizer_name: string
  organizer_email: string
  organizer_phone: string | null
  category: string | null
  status: string
  image_url: string | null
  website_url: string | null
  ticket_price: number | null
  max_attendees: number | null
  created_at: string
}

interface EventManagementProps {
  events: Event[]
}

export function EventManagement({ events }: EventManagementProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const router = useRouter()

  const handleApprove = async (eventId: string) => {
    setLoading(eventId)
    try {
      await approveEvent(eventId)
      router.refresh()
    } catch (error) {
      console.error("Error approving event:", error)
    } finally {
      setLoading(null)
    }
  }

  const handleReject = async (eventId: string) => {
    setLoading(eventId)
    try {
      await rejectEvent(eventId)
      router.refresh()
    } catch (error) {
      console.error("Error rejecting event:", error)
    } finally {
      setLoading(null)
    }
  }

  const handleDelete = async (eventId: string) => {
    if (confirm("Are you sure you want to delete this event? This action cannot be undone.")) {
      setLoading(eventId)
      try {
        await deleteEvent(eventId)
        router.refresh()
      } catch (error) {
        console.error("Error deleting event:", error)
      } finally {
        setLoading(null)
      }
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-100 text-green-800">Approved</Badge>
      case "rejected":
        return <Badge className="bg-red-100 text-red-800">Rejected</Badge>
      case "pending":
        return <Badge className="bg-yellow-100 text-yellow-800">Pending Review</Badge>
      default:
        return <Badge className="bg-muted text-foreground">{status}</Badge>
    }
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-12">
        <Calendar className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-xl font-medium text-muted-foreground mb-2">No Events Found</h3>
        <p className="text-muted-foreground">No events have been submitted yet.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-medium mb-6">All Events ({events.length})</h2>
      
      <div className="space-y-6">
        {events.map((event) => (
          <Card key={event.id} className="border shadow-sm">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <CardTitle className="text-xl">{event.title}</CardTitle>
                    {getStatusBadge(event.status)}
                  </div>
                  {event.category && (
                    <Badge variant="outline" className="mb-2">{event.category}</Badge>
                  )}
                </div>
                
                <div className="flex gap-2">
                  {event.status === "pending" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(event.id)}
                        disabled={loading === event.id}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleReject(event.id)}
                        disabled={loading === event.id}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </>
                  )}
                  
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(event.id)}
                    disabled={loading === event.id}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </CardHeader>
            
            <CardContent>
              {event.description && (
                <p className="text-muted-foreground mb-4 line-clamp-3">{event.description}</p>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{new Date(event.date).toLocaleDateString()}</span>
                    {event.time && <span>at {event.time}</span>}
                    {event.end_time && <span>- {event.end_time}</span>}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{event.location}</span>
                  </div>
                  
                  {event.ticket_price !== null && event.ticket_price > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Price:</span>
                      <span className="font-medium">${event.ticket_price}</span>
                    </div>
                  )}
                  
                  {event.max_attendees && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Max Attendees:</span>
                      <span>{event.max_attendees}</span>
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{event.organizer_name}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${event.organizer_email}`} className="text-primary hover:underline">
                      {event.organizer_email}
                    </a>
                  </div>
                  
                  {event.organizer_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <a href={`tel:${event.organizer_phone}`} className="text-primary hover:underline">
                        {event.organizer_phone}
                      </a>
                    </div>
                  )}
                  
                  {event.website_url && (
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                      <a 
                        href={event.website_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Visit Website
                      </a>
                    </div>
                  )}
                </div>
              </div>
              
              {event.image_url && (
                <div className="mt-4">
                  <img 
                    src={event.image_url} 
                    alt={event.title}
                    className="w-full h-48 object-cover rounded-lg"
                  />
                </div>
              )}
              
              <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
                <p>Submitted on {new Date(event.created_at).toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}