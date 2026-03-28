"use server"

import { cookies } from "next/headers"

// Static admin credentials
const ADMIN_EMAIL = "admin@roebel-events.de"
const ADMIN_PASSWORD = "admin123"

export async function adminLogin(formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!email || !password) {
    return { success: false, error: "Email and password are required." }
  }

  // Check static credentials
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    try {
      // Set admin session cookie
      const cookieStore = await cookies()
      const sessionData = {
        email: ADMIN_EMAIL,
        name: "Admin",
        loginTime: new Date().toISOString(),
      }
      
      console.log("🍪 Setting admin session cookie:", sessionData)
      
      cookieStore.set(
        "admin-session",
        JSON.stringify(sessionData),
        {
          httpOnly: true,
          secure: false, // Always false for localhost development
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 7, // 7 days
          path: "/",
          // Don't set domain for localhost
        }
      )
      
      console.log("🍪 Cookie set successfully")
    } catch (error) {
      console.error("🍪 Error setting cookie:", error)
      return { success: false, error: "Failed to create session." }
    }
    
    // Return success - no server redirect
    console.log("✅ Login successful - returning success response")
    return { success: true, redirectTo: "/admin/dashboard" }
  }

  return { success: false, error: "Invalid email or password." }
}
