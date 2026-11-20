"use server"

import { revalidatePath } from "next/cache"
import { isAuthenticated } from "@/lib/auth/session"
import { generateAppUpdateDraft } from "@/lib/app-updates/draft"

/** Admin: draft (or refresh the draft of) the next "Was ist neu" post. */
export async function draftAppUpdate(): Promise<{ success: boolean; message: string; articleId?: string }> {
  if (!(await isAuthenticated())) return { success: false, message: "Nicht autorisiert" }
  try {
    const result = await generateAppUpdateDraft()
    if (!result.created) return { success: false, message: result.reason ?? "Kein Entwurf erstellt." }
    revalidatePath("/admin/dashboard/news")
    return {
      success: true,
      articleId: result.articleId,
      message: result.refreshed ? "Bestehender Entwurf wurde aktualisiert." : "Entwurf erstellt.",
    }
  } catch (error) {
    console.error("[AppUpdates] draft failed:", error)
    return { success: false, message: error instanceof Error ? error.message : "Entwurf fehlgeschlagen." }
  }
}
