import { cookies } from "next/headers"

export interface AdminSession {
  email: string
  loginTime: string
  name?: string
}

export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get("admin-session")

    if (!sessionCookie) {
      return null
    }

    const session = JSON.parse(sessionCookie.value) as AdminSession

    // Check if session is expired (7 days)
    const loginTime = new Date(session.loginTime)
    const now = new Date()
    const daysDiff = (now.getTime() - loginTime.getTime()) / (1000 * 60 * 60 * 24)

    if (daysDiff > 7) {
      return null
    }

    return session
  } catch (error) {
    console.error("Error checking admin session:", error)
    return null
  }
}

export async function clearAdminSession() {
  const cookieStore = await cookies()
  cookieStore.delete("admin-session")
}
