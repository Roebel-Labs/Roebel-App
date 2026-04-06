"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { submitEvent } from "@/app/actions/submit-event"
import { Loader2, Upload, X, CheckCircle, AlertTriangle } from "lucide-react"
import { CATEGORIES } from "@/lib/constants"
import { MultiDatePicker } from "@/components/ui/multi-date-picker"
import { formatDateToString } from "@/lib/utils/recurring-events"
import { useAccount } from "@/lib/context/AccountContext"
import { useUserProfile } from "@/hooks/useUserProfile"

export function EventSubmissionForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [uploadedImage, setUploadedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isRecurring, setIsRecurring] = useState(false)
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const { toast } = useToast()
  const { activeAccount } = useAccount()
  const { user } = useUserProfile()

  // Gate: only verified citizens can submit events
  const canSubmit = user?.tier === "citizen" || user?.is_verified_citizen

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageFile(e.dataTransfer.files[0])
    }
  }

  const handleImageFile = (file: File) => {
    if (file.type.startsWith("image/")) {
      setUploadedImage(file)
      const reader = new FileReader()
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    } else {
      toast({
        title: "Ungültiger Dateityp",
        description: "Bitte laden Sie nur Bilddateien hoch.",
        variant: "destructive",
      })
    }
  }

  const removeImage = () => {
    setUploadedImage(null)
    setImagePreview(null)
  }

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true)

    try {
      if (uploadedImage) {
        formData.append("image_file", uploadedImage)
      }

      // Location is now a simple text field - geocoding happens server-side

      // Add account_id from active account
      if (activeAccount?.id) {
        formData.append("account_id", activeAccount.id)
      }

      // Add recurring event data
      formData.append("is_recurring", isRecurring.toString())
      if (isRecurring && selectedDates.length > 0) {
        formData.append("dates", JSON.stringify(selectedDates))
      }

      const result = await submitEvent(formData)

      if (result.success) {
        setIsSuccess(true)
        toast({
          title: "Event erfolgreich eingereicht!",
          description:
            "Ihr Event wurde zur Überprüfung eingereicht. Sie werden benachrichtigt, sobald es genehmigt wurde.",
        })

        setTimeout(() => {
          const form = document.getElementById("event-form") as HTMLFormElement
          form?.reset()
          setUploadedImage(null)
          setImagePreview(null)
          setIsRecurring(false)
          setSelectedDates([])
          setIsSuccess(false)
        }, 3000)
      } else {
        toast({
          title: "Einreichung fehlgeschlagen",
          description:
            result.error || "Beim Einreichen Ihres Events ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Einreichung fehlgeschlagen",
        description: "Beim Einreichen Ihres Events ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.",
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
            <h2 className="text-3xl font-medium text-foreground mb-2">Event erfolgreich eingereicht!</h2>
            <p className="text-muted-foreground mb-6">
              Ihr Event wurde zur Überprüfung eingereicht. Sie werden benachrichtigt, sobald es genehmigt wurde.
            </p>
            <Button onClick={() => setIsSuccess(false)} variant="outline" className="rounded-lg">
              Weiteres Event einreichen
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (user && !canSubmit) {
    return (
      <Card className="max-w-4xl mx-auto rounded-xl bg-card border border-border shadow-none">
        <CardContent className="p-8 md:p-12">
          <div className="text-center py-12">
            <AlertTriangle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-2xl font-medium text-foreground mb-2">Verifizierung erforderlich</h2>
            <p className="text-muted-foreground">
              Nur verifizierte Bürger können Veranstaltungen erstellen.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="max-w-4xl mx-auto rounded-xl bg-card border border-border shadow-none">
      <CardHeader className="px-4 md:px-8 lg:px-12 pt-4 md:pt-8 lg:pt-12 pb-0">
        <CardTitle className="text-2xl md:text-3xl font-medium tracking-tight text-foreground mb-2">Event einreichen</CardTitle>
        
        <p className="text-muted-foreground">Teilen Sie Ihr Event mit der Community</p>
      </CardHeader>

      <CardContent className="px-4 md:px-8 lg:px-12 ">
        <form id="event-form" action={handleSubmit} className="space-y-6 md:space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            <div className="lg:col-span-2">
              <Label htmlFor="title" className="text-sm font-medium text-foreground">
                Event Titel *
              </Label>
              <Input
                id="title"
                name="title"
                placeholder="Event Titel eingeben"
                required
                className="mt-2 bg-card border-border rounded-lg"
              />
            </div>

            <div className="lg:col-span-2">
              <Label htmlFor="description" className="text-sm font-medium text-foreground">
                Beschreibung
              </Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Beschreiben Sie Ihr Event..."
                rows={4}
                className="mt-2 bg-card border-border rounded-lg"
              />
            </div>

            <div className="lg:col-span-2">
              <Label className="text-sm font-medium text-foreground">Event Bild</Label>
              <div
                className={`mt-2 border-2 border-dashed rounded-xl p-4 md:p-6 text-center transition-colors ${
                  dragActive ? "border-primary bg-primary/5" : "border-border bg-card"
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                {imagePreview ? (
                  <div className="relative">
                    <img
                      src={imagePreview || "/placeholder.svg"}
                      alt="Preview"
                      className="max-h-32 sm:max-h-48 mx-auto rounded-lg"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2 rounded-full"
                      onClick={removeImage}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div>
                    <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-2">Bild hierher ziehen oder klicken zum Auswählen</p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => e.target.files?.[0] && handleImageFile(e.target.files[0])}
                      className="hidden"
                      id="image-upload"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-lg bg-transparent"
                      onClick={() => document.getElementById("image-upload")?.click()}
                    >
                      Datei auswählen
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Recurring Event Toggle */}
            <div className="lg:col-span-2">
              <Label className="text-sm font-medium text-foreground">
                Event wiederholt sich
              </Label>
              <button
                type="button"
                onClick={() => {
                  const newIsRecurring = !isRecurring
                  setIsRecurring(newIsRecurring)
                  if (newIsRecurring) {
                    // When enabling, check if there's a date in the form input
                    const dateInput = document.getElementById("date") as HTMLInputElement
                    if (dateInput?.value) {
                      setSelectedDates([dateInput.value])
                    }
                  } else if (selectedDates.length > 0) {
                    // When disabling, set the first selected date to the input
                    const dateInput = document.getElementById("date") as HTMLInputElement
                    if (dateInput) {
                      dateInput.value = selectedDates[0]
                    }
                  }
                }}
                className="mt-2 flex items-center gap-3 w-full"
              >
                <div className={`relative w-12 h-6 rounded-full transition-colors ${isRecurring ? "bg-primary" : "bg-muted"}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-card transition-transform ${isRecurring ? "translate-x-7" : "translate-x-1"}`} />
                </div>
                <span className="text-sm text-muted-foreground">
                  {isRecurring ? "Ja, mehrere Termine" : "Nein, nur ein Termin"}
                </span>
              </button>
            </div>

            {/* Date Selection - Single or Multi */}
            {isRecurring ? (
              <div className="lg:col-span-2">
                <Label className="text-sm font-medium text-foreground">
                  Termine auswählen *
                </Label>
                <div className="mt-2">
                  <MultiDatePicker
                    selectedDates={selectedDates}
                    onDatesChange={setSelectedDates}
                    minDate={formatDateToString(new Date())}
                  />
                </div>
                {/* Hidden input to pass first date for validation */}
                <input type="hidden" name="date" value={selectedDates[0] || ""} />
              </div>
            ) : (
              <div>
                <Label htmlFor="date" className="text-sm font-medium text-foreground">
                  Event Datum *
                </Label>
                <Input id="date" name="date" type="date" required className="mt-2 bg-card border-border rounded-lg" />
              </div>
            )}

            <div className={isRecurring ? "" : ""}>
              <Label htmlFor="category" className="text-sm font-medium text-foreground">
                Kategorie
              </Label>
              <Select name="category">
                <SelectTrigger className="mt-2 bg-card border-border rounded-lg">
                  <SelectValue placeholder="Kategorie auswählen" />
                </SelectTrigger>
                <SelectContent className="rounded-lg">
                  {CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="time" className="text-sm font-medium text-foreground">
                Startzeit
              </Label>
              <Input id="time" name="time" type="time" className="mt-2 bg-card border-border rounded-lg" />
            </div>

            <div>
              <Label htmlFor="end_time" className="text-sm font-medium text-foreground">
                Endzeit
              </Label>
              <Input id="end_time" name="end_time" type="time" className="mt-2 bg-card border-border rounded-lg" />
            </div>

            <div className="lg:col-span-2">
              <Label htmlFor="location" className="text-sm font-medium text-foreground">
                Ort *
              </Label>
              <Input
                id="location"
                name="location"
                placeholder="z.B. Rathaus Berlin, Alexanderplatz 1"
                required
                className="mt-2 bg-card border-border rounded-lg"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Der Standort wird automatisch auf Google Maps gefunden
              </p>
            </div>

            <div>
              <Label htmlFor="organizer_name" className="text-sm font-medium text-foreground">
                Ihr Name *
              </Label>
              <Input
                id="organizer_name"
                name="organizer_name"
                placeholder="Ihr vollständiger Name"
                defaultValue={activeAccount?.name ?? ""}
                required
                className="mt-2 bg-card border-border rounded-lg"
              />
            </div>

            <div>
              <Label htmlFor="organizer_email" className="text-sm font-medium text-foreground">
                Ihre E-Mail *
              </Label>
              <Input
                id="organizer_email"
                name="organizer_email"
                type="email"
                placeholder="ihre.email@beispiel.de"
                required
                className="mt-2 bg-card border-border rounded-lg"
              />
            </div>

            <div>
              <Label htmlFor="organizer_phone" className="text-sm font-medium text-foreground">
                Ihre Telefonnummer
              </Label>
              <Input
                id="organizer_phone"
                name="organizer_phone"
                type="tel"
                placeholder="0123 456789"
                className="mt-2 bg-card border-border rounded-lg"
              />
            </div>

            <div>
              <Label htmlFor="ticket_price" className="text-sm font-medium text-foreground">
                Ticketpreis (€)
              </Label>
              <Input
                id="ticket_price"
                name="ticket_price"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                className="mt-2 bg-card border-border rounded-lg"
              />
            </div>

            <div>
              <Label htmlFor="max_attendees" className="text-sm font-medium text-foreground">
                Max. Teilnehmer
              </Label>
              <Input
                id="max_attendees"
                name="max_attendees"
                type="number"
                min="1"
                placeholder="Leer lassen für unbegrenzt"
                className="mt-2 bg-card border-border rounded-lg"
              />
            </div>

            <div className="lg:col-span-2">
              <Label htmlFor="website_url" className="text-sm font-medium text-foreground">
                Event Website
              </Label>
              <Input
                id="website_url"
                name="website_url"
                type="url"
                placeholder="https://beispiel.de"
                className="mt-2 bg-card border-border rounded-lg"
              />
            </div>

          </div>

          <div className="flex flex-col sm:flex-row gap-3 md:gap-4 pt-6 md:pt-8">
            <Button type="submit" disabled={isSubmitting} className="flex-1 h-12 text-base rounded-lg">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? "Wird eingereicht..." : "Event einreichen"}
            </Button>
            <Button type="button" variant="outline" className="flex-1 h-12 text-base bg-transparent rounded-lg">
              Abbrechen
            </Button>
          </div>

          <p className="text-sm text-muted-foreground text-center">
            * Pflichtfelder. Ihr Event wird vor der Veröffentlichung überprüft.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
