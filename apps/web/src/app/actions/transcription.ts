"use server"

import { randomUUID } from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAuthenticated } from "@/lib/auth/session"

const TRANSCRIPTION_BUCKET = "admin-transcriptions"

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80) || "audio.mp3"
}

/**
 * Mint a signed upload URL so the browser uploads the audio DIRECTLY to the
 * private `admin-transcriptions` bucket, bypassing Vercel's ~4.5 MB request
 * body limit. The transcribe route then reads the file with the service role.
 */
export async function createTranscriptionUploadTarget(fileName: string) {
  if (!(await isAuthenticated())) {
    return { success: false as const, error: "Nicht angemeldet" }
  }
  try {
    const supabase = createAdminClient()
    const path = `uploads/${randomUUID()}-${safeName(fileName)}`
    const { data, error } = await supabase.storage.from(TRANSCRIPTION_BUCKET).createSignedUploadUrl(path)
    if (error) throw error
    return { success: true as const, path, token: data.token }
  } catch (error) {
    console.error("Error creating transcription upload target:", error)
    return { success: false as const, error: "Fehler beim Vorbereiten des Uploads" }
  }
}
