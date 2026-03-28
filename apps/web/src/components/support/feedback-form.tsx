"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { submitFeedback } from "@/app/actions/feedback"
import { Loader2, CheckCircle } from "lucide-react"
import { useActiveAccount } from "thirdweb/react"
import type { FeedbackType } from "@/types/feedback"

const FEEDBACK_TYPES: { value: FeedbackType; label: string }[] = [
  { value: "bug_report", label: "Bug-Bericht" },
  { value: "feature_request", label: "Feature-Anfrage" },
  { value: "general", label: "Allgemein" },
  { value: "improvement", label: "Verbesserung" },
]

export function FeedbackForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [deviceInfo, setDeviceInfo] = useState<Record<string, any>>({})
  const account = useActiveAccount()
  const { toast } = useToast()

  // Capture device info on mount
  useEffect(() => {
    const info = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    }
    setDeviceInfo(info)
  }, [])

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true)

    try {
      // Add device info and wallet address
      formData.append("device_info", JSON.stringify(deviceInfo))
      if (account?.address) {
        formData.append("user_wallet_address", account.address)
      }

      const result = await submitFeedback(formData)

      if (result.success) {
        setIsSuccess(true)
        toast({
          title: "Feedback erfolgreich gesendet!",
          description: "Vielen Dank für Ihr Feedback. Wir werden es so schnell wie möglich bearbeiten.",
        })

        setTimeout(() => {
          const form = document.getElementById("feedback-form") as HTMLFormElement
          form?.reset()
          setIsSuccess(false)
        }, 3000)
      } else {
        toast({
          title: "Fehler beim Absenden",
          description: result.error || "Beim Absenden Ihres Feedbacks ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Fehler beim Absenden",
        description: "Beim Absenden Ihres Feedbacks ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSuccess) {
    return (
      <Card className="max-w-4xl mx-auto rounded-xl bg-card border border-border shadow-none">
        <CardContent className="p-8 md:p-12">
          <div className="text-center py-12">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-3xl font-medium text-foreground mb-2">Feedback erfolgreich gesendet!</h2>
            <p className="text-muted-foreground mb-6">
              Vielen Dank für Ihr Feedback. Wir werden es so schnell wie möglich bearbeiten.
            </p>
            <Button onClick={() => setIsSuccess(false)} variant="outline" className="rounded-lg">
              Weiteres Feedback senden
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="max-w-4xl mx-auto rounded-xl bg-card border border-border shadow-none">
      <CardHeader className="px-4 md:px-8 lg:px-12 pt-4 md:pt-8 lg:pt-12 pb-0">
        <CardTitle className="text-2xl md:text-3xl font-medium tracking-tight text-foreground mb-2">
          Feedback senden
        </CardTitle>
        <p className="text-muted-foreground">
          Helfen Sie uns, die App zu verbessern. Teilen Sie uns Fehler, Wünsche oder allgemeines Feedback mit.
        </p>
      </CardHeader>

      <CardContent className="px-4 md:px-8 lg:px-12">
        <form id="feedback-form" action={handleSubmit} className="space-y-6 md:space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            <div className="lg:col-span-2">
              <Label htmlFor="feedback_type" className="text-sm font-medium text-foreground">
                Feedback-Typ *
              </Label>
              <Select name="feedback_type" required>
                <SelectTrigger className="mt-2 bg-card border-border rounded-lg">
                  <SelectValue placeholder="Bitte wählen Sie einen Typ" />
                </SelectTrigger>
                <SelectContent className="rounded-lg">
                  {FEEDBACK_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="lg:col-span-2">
              <Label htmlFor="subject" className="text-sm font-medium text-foreground">
                Betreff *
              </Label>
              <Input
                id="subject"
                name="subject"
                placeholder="Kurze Beschreibung des Themas"
                required
                className="mt-2 bg-card border-border rounded-lg"
              />
            </div>

            <div className="lg:col-span-2">
              <Label htmlFor="message" className="text-sm font-medium text-foreground">
                Nachricht *
              </Label>
              <Textarea
                id="message"
                name="message"
                placeholder="Beschreiben Sie Ihr Anliegen im Detail..."
                rows={6}
                required
                className="mt-2 bg-card border-border rounded-lg"
              />
            </div>

            <div>
              <Label htmlFor="contact_email" className="text-sm font-medium text-foreground">
                Ihre E-Mail
              </Label>
              <Input
                id="contact_email"
                name="contact_email"
                type="email"
                placeholder="ihre.email@beispiel.de"
                className="mt-2 bg-card border-border rounded-lg"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Optional - Nur wenn Sie eine Rückmeldung wünschen
              </p>
            </div>

            <div>
              <Label htmlFor="contact_phone" className="text-sm font-medium text-foreground">
                Ihre Telefonnummer
              </Label>
              <Input
                id="contact_phone"
                name="contact_phone"
                type="tel"
                placeholder="0123 456789"
                className="mt-2 bg-card border-border rounded-lg"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Optional - Für telefonische Rückfragen
              </p>
            </div>

            {account?.address && (
              <div className="lg:col-span-2">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <strong>Wallet verbunden:</strong> {account.address.slice(0, 6)}...{account.address.slice(-4)}
                  </p>
                  <p className="text-xs text-primary mt-1">
                    Ihre Wallet-Adresse wird mit dem Feedback gespeichert.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 md:gap-4 pt-6 md:pt-8">
            <Button type="submit" disabled={isSubmitting} className="flex-1 h-12 text-base rounded-lg">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? "Wird gesendet..." : "Feedback absenden"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-12 text-base bg-transparent rounded-lg"
              onClick={() => {
                const form = document.getElementById("feedback-form") as HTMLFormElement
                form?.reset()
              }}
            >
              Zurücksetzen
            </Button>
          </div>

          <p className="text-sm text-muted-foreground text-center">
            * Pflichtfelder. Ihre Daten werden vertraulich behandelt.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
