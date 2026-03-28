"use client"

import { useState, useEffect } from "react"
import { EventsGrid } from "@/components/events/events-grid"
import { EventsFilters } from "@/components/events/events-filters"
import { EventsGridSkeleton, FilterSkeleton } from "@/components/skeletons"
import { createClient } from "@/lib/supabase/client"

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
  image_url: string | null
  website_url: string | null
  ticket_price: number | null
  max_attendees: number | null
  created_at: string
}

interface EventsPageProps {
  initialEvents: Event[]
  initialCategory?: string
}

export function EventsPage({ initialEvents, initialCategory = "All Events" }: EventsPageProps) {
  const [events, setEvents] = useState<Event[]>(initialEvents)
  const [loading, setLoading] = useState(false)
  const [currentCategory, setCurrentCategory] = useState(initialCategory)
  
  const supabase = createClient()

  const handleCategoryChange = async (category: string) => {
    if (category === currentCategory) return
    
    setLoading(true)
    setCurrentCategory(category)

    try {
      let query = supabase.from("events").select("*").eq("status", "approved").order("date", { ascending: true })

      if (category !== "All Events") {
        query = query.eq("category", category)
      }

      const { data, error } = await query

      if (error) {
        console.error("Error fetching filtered events:", error)
        setEvents([])
      } else {
        setEvents(data || [])
      }
    } catch (error) {
      console.error("Error filtering events:", error)
      setEvents([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="container mx-auto px-4 md:px-6 py-6 md:py-8">
    
      <div id="events">
        {loading ? (
          <EventsGridSkeleton />
        ) : (
          <EventsGrid events={events} />
        )}
      </div>
    </main>
  )
}