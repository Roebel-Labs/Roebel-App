"use server"

import { clearAdminSession } from "@/lib/auth/admin"
import { redirect } from "next/navigation"

export async function adminLogout() {
  await clearAdminSession()
  redirect("/admin/login")
}
