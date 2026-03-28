"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { createAppNotification } from "@/app/actions/app-notifications"

export async function approveEvent(eventId: string) {
  try {

    const supabase = await createClient()

    // Update event status to approved
    const { data, error } = await supabase
      .from("events")
      .update({
        status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId)
      .eq("status", "pending") // Only approve pending events
      .select()

    if (error) {
      console.error("Database error approving event:", error)
      return { success: false, error: "Failed to approve event. Please try again." }
    }

    if (!data || data.length === 0) {
      return { success: false, error: "Event not found or already processed." }
    }

    // Create activity notification
    createAppNotification({
      type: "event_new",
      title: `Neues Event: ${data[0].title}`,
      body: data[0].description?.substring(0, 120) || null,
      link: `/app/events/${data[0].id}`,
      reference_id: data[0].id,
      image_url: data[0].image_url || null,
    }).catch(console.error)

    // Revalidate pages to show updated data
    revalidatePath("/admin/dashboard")
    revalidatePath("/")

    return { success: true, message: "Event approved successfully!" }
  } catch (error) {
    console.error("Server error approving event:", error)
    return { success: false, error: "An unexpected error occurred." }
  }
}

export async function rejectEvent(eventId: string) {
  try {

    const supabase = await createClient()

    // Update event status to rejected
    const { data, error } = await supabase
      .from("events")
      .update({
        status: "rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId)
      .eq("status", "pending") // Only reject pending events
      .select()

    if (error) {
      console.error("Database error rejecting event:", error)
      return { success: false, error: "Failed to reject event. Please try again." }
    }

    if (!data || data.length === 0) {
      return { success: false, error: "Event not found or already processed." }
    }

    // Revalidate pages to show updated data
    revalidatePath("/admin/dashboard")
    revalidatePath("/")

    return { success: true, message: "Event rejected successfully!" }
  } catch (error) {
    console.error("Server error rejecting event:", error)
    return { success: false, error: "An unexpected error occurred." }
  }
}

export async function deleteEvent(eventId: string) {
  try {

    const supabase = await createClient()

    // Delete the event
    const { error } = await supabase.from("events").delete().eq("id", eventId)

    if (error) {
      console.error("Database error deleting event:", error)
      return { success: false, error: "Failed to delete event. Please try again." }
    }

    // Revalidate pages to show updated data
    revalidatePath("/admin/dashboard")
    revalidatePath("/")

    return { success: true, message: "Event deleted successfully!" }
  } catch (error) {
    console.error("Server error deleting event:", error)
    return { success: false, error: "An unexpected error occurred." }
  }
}

export async function updateEvent(eventId: string, formData: FormData) {
  try {
    const supabase = await createClient()

    const title = formData.get("title") as string
    const description = formData.get("description") as string
    const date = formData.get("date") as string
    const time = formData.get("time") as string
    const location = formData.get("location") as string
    const category = formData.get("category") as string
    const organizer_name = formData.get("organizer_name") as string
    const organizer_email = formData.get("organizer_email") as string
    const organizer_phone = formData.get("organizer_phone") as string
    const website_url = formData.get("website_url") as string
    const ticket_price = formData.get("ticket_price") as string
    const max_attendees = formData.get("max_attendees") as string
    const status = formData.get("status") as string
    const is_popular = formData.get("is_popular") === "true"
    const image_url = formData.get("image_url") as string
    const livestream_url = formData.get("livestream_url") as string
    const livestream_active = formData.get("livestream_active") === "true"

    const { data, error } = await supabase
      .from("events")
      .update({
        title,
        description: description || null,
        date,
        time: time || null,
        location,
        category: category || null,
        organizer_name,
        organizer_email,
        organizer_phone: organizer_phone || null,
        website_url: website_url || null,
        ticket_price: ticket_price ? parseFloat(ticket_price) : null,
        max_attendees: max_attendees ? parseInt(max_attendees) : null,
        status,
        is_popular,
        image_url: image_url || null,
        livestream_url: livestream_url || null,
        livestream_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId)
      .select()
      .single()

    if (error) {
      console.error("Database error updating event:", error)
      return { success: false, error: "Failed to update event. Please try again." }
    }

    // Revalidate pages to show updated data
    revalidatePath("/admin/dashboard/events")
    revalidatePath("/events")
    revalidatePath(`/events/${eventId}`)

    return { success: true, data, message: "Event erfolgreich aktualisiert!" }
  } catch (error) {
    console.error("Server error updating event:", error)
    return { success: false, error: "An unexpected error occurred." }
  }
}

// Event Dates Management Actions

export async function addEventDates(eventId: string, dates: string[]) {
  try {
    const supabase = await createClient()

    const eventDates = dates.map(date => ({
      event_id: eventId,
      date: date,
    }))

    const { error } = await supabase.from("event_dates").insert(eventDates)

    if (error) {
      console.error("Database error adding event dates:", error)
      return { success: false, error: "Failed to add dates. Please try again." }
    }

    // Update event to be recurring if it now has multiple dates
    await supabase
      .from("events")
      .update({ is_recurring: true, updated_at: new Date().toISOString() })
      .eq("id", eventId)

    revalidatePath(`/admin/dashboard/events/${eventId}/edit`)
    revalidatePath("/events")

    return { success: true, message: "Termine erfolgreich hinzugefügt!" }
  } catch (error) {
    console.error("Server error adding event dates:", error)
    return { success: false, error: "An unexpected error occurred." }
  }
}

export async function cancelEventDate(dateId: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from("event_dates")
      .update({ is_cancelled: true })
      .eq("id", dateId)

    if (error) {
      console.error("Database error cancelling event date:", error)
      return { success: false, error: "Failed to cancel date. Please try again." }
    }

    revalidatePath("/admin/dashboard/events")
    revalidatePath("/events")

    return { success: true, message: "Termin erfolgreich abgesagt!" }
  } catch (error) {
    console.error("Server error cancelling event date:", error)
    return { success: false, error: "An unexpected error occurred." }
  }
}

export async function deleteEventDate(dateId: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from("event_dates")
      .delete()
      .eq("id", dateId)

    if (error) {
      console.error("Database error deleting event date:", error)
      return { success: false, error: "Failed to delete date. Please try again." }
    }

    revalidatePath("/admin/dashboard/events")
    revalidatePath("/events")

    return { success: true, message: "Termin erfolgreich gelöscht!" }
  } catch (error) {
    console.error("Server error deleting event date:", error)
    return { success: false, error: "An unexpected error occurred." }
  }
}
