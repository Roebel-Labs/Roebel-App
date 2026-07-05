"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { sendConfirmationEmail } from "@/lib/newsletter/transactional"

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

export async function subscribeToNewsletter(email: string): Promise<{ success: boolean; message: string }> {
  const normalized = email.trim().toLowerCase()
  if (!EMAIL_RE.test(normalized)) {
    return { success: false, message: "Bitte gib eine gültige E-Mail-Adresse ein." }
  }
  const supabase = createAdminClient()
  const { data: existing } = await supabase
    .from("newsletter_subscribers")
    .select("id, status")
    .eq("email", normalized)
    .maybeSingle()

  // Silent success for already-active addresses — never reveal subscription state.
  const okMessage = "Fast geschafft! Bitte bestätige deine Anmeldung über den Link in deinem Postfach."

  if (existing?.status === "active") {
    return { success: true, message: okMessage }
  }

  // Spam-Beschwerde: diese Adresse darf nie wieder angeschrieben werden —
  // stille Erfolgsmeldung, kein Versand, keine Statusänderung.
  if (existing?.status === "complained") {
    return { success: true, message: okMessage }
  }

  if (existing) {
    const { data: updated, error: updateError } = await supabase
      .from("newsletter_subscribers")
      .update({
        status: "pending",
        confirm_token: crypto.randomUUID(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("confirm_token")
      .single()
    if (updateError) console.error("[Newsletter] subscribe update failed:", updateError)
    if (updated) await sendConfirmationEmail(normalized, updated.confirm_token, "signup")
    return { success: true, message: okMessage }
  }
  const { data: created, error } = await supabase
    .from("newsletter_subscribers")
    .insert({ email: normalized, status: "pending", source: "signup" })
    .select("confirm_token")
    .single()
  if (error) {
    console.error("[Newsletter] subscribe insert failed:", error)
    return { success: false, message: "Etwas ist schiefgelaufen. Bitte versuche es später erneut." }
  }
  await sendConfirmationEmail(normalized, created.confirm_token, "signup")
  return { success: true, message: okMessage }
}

export async function confirmSubscription(token: string): Promise<{ success: boolean }> {
  if (!token) return { success: false }
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("newsletter_subscribers")
    .update({
      status: "active",
      confirmed_at: new Date().toISOString(),
      unsubscribed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("confirm_token", token)
    .in("status", ["pending", "active"])
    .select("id")
  return { success: !!data?.length }
}

export async function unsubscribeByToken(token: string): Promise<{ success: boolean }> {
  if (!token) return { success: false }
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("newsletter_subscribers")
    .update({
      status: "unsubscribed",
      unsubscribed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("unsubscribe_token", token)
    .select("id")
  return { success: !!data?.length }
}
