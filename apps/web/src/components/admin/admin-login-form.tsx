"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { adminLogin } from "@/app/actions/admin-login"

export function AdminLoginForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const formData = new FormData(e.currentTarget)
      console.log("🚀 Submitting login...")
      
      const result = await adminLogin(formData)
      console.log("📥 Login result:", result)

      if (result.success) {
        console.log("✅ Login successful, navigating to:", result.redirectTo)
        window.location.href = result.redirectTo || "/admin/dashboard"
      } else {
        setError(result.error || "Login failed")
        setIsLoading(false)
      }
    } catch (error) {
      console.error("❌ Login error:", error)
      setError("An unexpected error occurred. Please try again.")
      setIsLoading(false)
    }
  }

  return (
    <>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="email">E-Mail</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="admin@roebel-events.de"
            required
            className="mt-1 bg-card"
            disabled={isLoading}
          />
        </div>

        <div>
          <Label htmlFor="password">Passwort</Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="Passwort eingeben"
            required
            className="mt-1 bg-card"
            disabled={isLoading}
          />
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Anmelden..." : "Anmelden"}
        </Button>

        <div className="text-sm text-muted-foreground text-center space-y-1">
          <p>Demo Zugangsdaten:</p>
          <p>E-Mail: admin@roebel-events.de</p>
          <p>Passwort: admin123</p>
        </div>
      </form>
    </>
  )
}
