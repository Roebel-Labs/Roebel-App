"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { geocodeLocation } from "@/lib/utils/geocoding"
import { generateSlug } from "@/types/business"

export async function submitBusiness(formData: FormData) {
  try {
    const supabase = await createClient()

    // Handle logo upload
    let logoUrl: string | null = null
    const logoFile = formData.get("logo_file") as File

    if (logoFile && logoFile.size > 0) {
      const fileExt = logoFile.name.split(".").pop()
      const fileName = `${Date.now()}-logo-${Math.random().toString(36).substring(2)}.${fileExt}`
      const filePath = `business-images/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(filePath, logoFile, {
          cacheControl: "3600",
          upsert: false,
        })

      if (uploadError) {
        console.error("Logo upload error:", uploadError)
        return { success: false, error: "Fehler beim Hochladen des Logos." }
      }

      const { data: urlData } = supabase.storage
        .from("images")
        .getPublicUrl(filePath)
      logoUrl = urlData.publicUrl
    }

    // Handle cover image upload
    let coverImageUrl: string | null = null
    const coverFile = formData.get("cover_file") as File

    if (coverFile && coverFile.size > 0) {
      const fileExt = coverFile.name.split(".").pop()
      const fileName = `${Date.now()}-cover-${Math.random().toString(36).substring(2)}.${fileExt}`
      const filePath = `business-images/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(filePath, coverFile, {
          cacheControl: "3600",
          upsert: false,
        })

      if (uploadError) {
        console.error("Cover upload error:", uploadError)
        return { success: false, error: "Fehler beim Hochladen des Titelbilds." }
      }

      const { data: urlData } = supabase.storage
        .from("images")
        .getPublicUrl(filePath)
      coverImageUrl = urlData.publicUrl
    }

    // Get address and geocode
    const address = formData.get("address") as string
    let latitude: number | null = null
    let longitude: number | null = null

    if (address) {
      const placeData = await geocodeLocation(address)
      if (placeData) {
        latitude = placeData.latitude
        longitude = placeData.longitude
      }
    }

    // Parse opening hours from form data
    let openingHours = {}
    const openingHoursStr = formData.get("opening_hours") as string
    if (openingHoursStr) {
      try {
        openingHours = JSON.parse(openingHoursStr)
      } catch {
        console.error("Failed to parse opening hours")
      }
    }

    // Extract form data
    const name = formData.get("name") as string
    const ownerWallet = formData.get("owner_wallet_address") as string

    if (!name || !ownerWallet) {
      return { success: false, error: "Name und Wallet-Adresse sind erforderlich." }
    }

    // Generate unique slug
    let slug = generateSlug(name)
    const { data: existing } = await supabase
      .from("businesses")
      .select("slug")
      .eq("slug", slug)
      .maybeSingle()

    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`
    }

    const businessData = {
      owner_wallet_address: ownerWallet.toLowerCase(),
      name,
      slug,
      description: (formData.get("description") as string) || null,
      category: (formData.get("category") as string) || "sonstiges",
      phone: (formData.get("phone") as string) || null,
      email: (formData.get("email") as string) || null,
      website_url: (formData.get("website_url") as string) || null,
      address: address || null,
      latitude,
      longitude,
      opening_hours: openingHours,
      cover_image_url: coverImageUrl,
      logo_url: logoUrl,
      gallery_images: [],
      status: "pending",
    }

    const { data, error } = await supabase
      .from("businesses")
      .insert([businessData])
      .select()
      .single()

    if (error) {
      console.error("Database error:", error)
      return { success: false, error: "Fehler beim Einreichen des Gewerbes." }
    }

    revalidatePath("/app/gewerbe")
    revalidatePath("/app/profile")

    return { success: true, data }
  } catch (error) {
    console.error("Server error:", error)
    return { success: false, error: "Ein unerwarteter Fehler ist aufgetreten." }
  }
}
