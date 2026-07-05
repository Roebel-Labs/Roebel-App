"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { subscribeToNewsletter } from "@/app/actions/newsletter-public"

export function NewsletterSignupForm() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await subscribeToNewsletter(email)
    setResult(res)
    if (res.success) setEmail("")
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex gap-2">
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="deine@email.de"
          className="flex-1"
        />
        <Button type="submit" disabled={loading} className="bg-[#00498B] hover:bg-[#003a70]">
          {loading ? "Wird gesendet…" : "Anmelden"}
        </Button>
      </div>
      {result && (
        <p className={result.success ? "text-sm text-green-700" : "text-sm text-red-600"}>
          {result.message}
        </p>
      )}
      <p className="text-xs text-gray-500">
        Mit der Anmeldung stimmst du zu, dass wir dir wöchentlich unseren Newsletter senden.
        Hinweise zum Datenschutz findest du in unserer{" "}
        <a href="/datenschutz" className="underline">Datenschutzerklärung</a>. Abmeldung ist
        jederzeit über den Link in jeder E-Mail möglich.
      </p>
    </form>
  )
}
