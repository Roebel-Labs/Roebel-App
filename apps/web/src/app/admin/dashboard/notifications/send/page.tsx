"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Send, Bell } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { sendPushNotification, getEventsForSelection, getNewsForSelection } from "@/app/actions/push-notifications"
import type { SendNotificationPayload } from "@/types/push-notifications"

const EVENT_CATEGORIES = [
  "Kultur",
  "Musik",
  "Essen & Trinken",
  "Kirchliches",
  "Ausstellungen",
  "Stadt",
  "Sport",
  "Sonstige",
]

export default function SendNotificationPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [notificationType, setNotificationType] = useState<"broadcast" | "category" | "test">("broadcast")
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [testToken, setTestToken] = useState("")
  const [linkType, setLinkType] = useState<"none" | "event" | "news">("none")
  const [linkId, setLinkId] = useState("")

  // State for event/news dropdown options
  const [events, setEvents] = useState<{ id: string; title: string; date: string }[]>([])
  const [newsArticles, setNewsArticles] = useState<{ id: string; title: string; slug: string }[]>([])
  const [isLoadingOptions, setIsLoadingOptions] = useState(true)

  // Fetch events and news on mount
  useEffect(() => {
    async function loadOptions() {
      setIsLoadingOptions(true)
      const [eventsResult, newsResult] = await Promise.all([getEventsForSelection(), getNewsForSelection()])
      if (eventsResult.data) setEvents(eventsResult.data)
      if (newsResult.data) setNewsArticles(newsResult.data)
      setIsLoadingOptions(false)
    }
    loadOptions()
  }, [])

  // Reset linkId when linkType changes
  useEffect(() => {
    setLinkId("")
  }, [linkType])

  const handleCategoryToggle = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim()) {
      toast.error("Bitte geben Sie einen Titel ein")
      return
    }
    if (!body.trim()) {
      toast.error("Bitte geben Sie eine Nachricht ein")
      return
    }
    if (notificationType === "category" && selectedCategories.length === 0) {
      toast.error("Bitte wählen Sie mindestens eine Kategorie aus")
      return
    }
    if (notificationType === "test" && !testToken.trim()) {
      toast.error("Bitte geben Sie ein Test-Token ein")
      return
    }

    setIsSubmitting(true)
    const loadingToast = toast.loading("Benachrichtigung wird gesendet...")

    try {
      const payload: SendNotificationPayload = {
        type: notificationType,
        title: title.trim(),
        body: body.trim(),
        ...(notificationType === "category" && { categories: selectedCategories }),
        ...(notificationType === "test" && { testToken: testToken.trim() }),
        ...(linkType === "event" &&
          linkId && {
            data: {
              type: "event",
              eventId: linkId,
            },
          }),
        ...(linkType === "news" &&
          linkId && {
            data: {
              type: "news",
              slug: linkId,
            },
          }),
      }

      const result = await sendPushNotification(payload)

      if (result.success) {
        toast.success(`Benachrichtigung gesendet: ${result.sent} erfolgreich, ${result.failed} fehlgeschlagen`, {
          id: loadingToast,
        })
        router.push("/admin/dashboard/notifications")
      } else {
        toast.error(result.error || "Fehler beim Senden", { id: loadingToast })
      }
    } catch (error) {
      console.error("Error sending notification:", error)
      toast.error("Ein unerwarteter Fehler ist aufgetreten", { id: loadingToast })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/dashboard/notifications">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-medium">Benachrichtigung senden</h1>
          <p className="text-sm text-muted-foreground">Senden Sie Push-Benachrichtigungen an Ihre App-Nutzer</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Notification Type */}
          <Card className="bg-card border border-border shadow-none">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Benachrichtigungstyp</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label
                  className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                    notificationType === "broadcast" ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                  }`}
                >
                  <input
                    type="radio"
                    name="type"
                    value="broadcast"
                    checked={notificationType === "broadcast"}
                    onChange={() => setNotificationType("broadcast")}
                    className="sr-only"
                  />
                  <div>
                    <p className="font-medium text-sm">Broadcast</p>
                    <p className="text-xs text-muted-foreground">Alle Geräte</p>
                  </div>
                </label>

                <label
                  className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                    notificationType === "category" ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                  }`}
                >
                  <input
                    type="radio"
                    name="type"
                    value="category"
                    checked={notificationType === "category"}
                    onChange={() => setNotificationType("category")}
                    className="sr-only"
                  />
                  <div>
                    <p className="font-medium text-sm">Nach Kategorie</p>
                    <p className="text-xs text-muted-foreground">Events-Abonnenten</p>
                  </div>
                </label>

                <label
                  className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                    notificationType === "test" ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
                  }`}
                >
                  <input
                    type="radio"
                    name="type"
                    value="test"
                    checked={notificationType === "test"}
                    onChange={() => setNotificationType("test")}
                    className="sr-only"
                  />
                  <div>
                    <p className="font-medium text-sm">Test</p>
                    <p className="text-xs text-muted-foreground">Einzelnes Gerät</p>
                  </div>
                </label>
              </div>

              {/* Category Selection */}
              {notificationType === "category" && (
                <div className="pt-4 border-t">
                  <Label className="text-sm font-medium mb-3 block">Kategorien auswählen</Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {EVENT_CATEGORIES.map((category) => (
                      <label
                        key={category}
                        className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-accent"
                      >
                        <Checkbox
                          checked={selectedCategories.includes(category)}
                          onCheckedChange={() => handleCategoryToggle(category)}
                        />
                        <span className="text-sm">{category}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Test Token Input */}
              {notificationType === "test" && (
                <div className="pt-4 border-t">
                  <Label htmlFor="testToken" className="text-sm font-medium">
                    Expo Push Token
                  </Label>
                  <Input
                    id="testToken"
                    value={testToken}
                    onChange={(e) => setTestToken(e.target.value)}
                    placeholder="ExponentPushToken[...]"
                    className="mt-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Das Token finden Sie in den Geräteeinstellungen der App
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Content */}
          <Card className="bg-card border border-border shadow-none">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Inhalt</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title" className="text-sm font-medium">
                  Titel *
                </Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Benachrichtigungstitel"
                  maxLength={50}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">{title.length}/50 Zeichen</p>
              </div>

              <div>
                <Label htmlFor="body" className="text-sm font-medium">
                  Nachricht *
                </Label>
                <Textarea
                  id="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Ihre Nachricht..."
                  rows={3}
                  maxLength={200}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">{body.length}/200 Zeichen</p>
              </div>
            </CardContent>
          </Card>

          {/* Optional Data */}
          <Card className="bg-card border border-border shadow-none">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Verlinkung (optional)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="linkType" className="text-sm font-medium">
                    Link-Typ
                  </Label>
                  <Select value={linkType} onValueChange={(v) => setLinkType(v as "none" | "event" | "news")}>
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Keine Verlinkung</SelectItem>
                      <SelectItem value="event">Event</SelectItem>
                      <SelectItem value="news">News-Artikel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {linkType === "event" && (
                  <div>
                    <Label htmlFor="linkId" className="text-sm font-medium">
                      Event auswählen
                    </Label>
                    <Select value={linkId} onValueChange={setLinkId} disabled={isLoadingOptions}>
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder={isLoadingOptions ? "Laden..." : "Event auswählen..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {events.length === 0 ? (
                          <SelectItem value="none" disabled>
                            Keine Events verfügbar
                          </SelectItem>
                        ) : (
                          events.map((event) => (
                            <SelectItem key={event.id} value={event.id}>
                              {event.title} ({new Date(event.date).toLocaleDateString("de-DE")})
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {linkType === "news" && (
                  <div>
                    <Label htmlFor="linkId" className="text-sm font-medium">
                      News-Artikel auswählen
                    </Label>
                    <Select value={linkId} onValueChange={setLinkId} disabled={isLoadingOptions}>
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder={isLoadingOptions ? "Laden..." : "Artikel auswählen..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {newsArticles.length === 0 ? (
                          <SelectItem value="none" disabled>
                            Keine Artikel verfügbar
                          </SelectItem>
                        ) : (
                          newsArticles.map((article) => (
                            <SelectItem key={article.id} value={article.slug}>
                              {article.title}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Beim Tippen auf die Benachrichtigung wird der Nutzer zur verlinkten Seite weitergeleitet.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Preview & Actions */}
        <div className="space-y-6">
          {/* Preview */}
          <Card className="bg-card border border-border shadow-none">
            <CardHeader>
              <CardTitle className="text-sm font-medium">Vorschau</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-muted rounded-xl p-4">
                <div className="bg-card rounded-lg shadow-sm p-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center shrink-0">
                      <Bell className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">RÖBEL APP</p>
                      <p className="font-medium text-sm truncate">{title || "Titel der Benachrichtigung"}</p>
                      <p className="text-sm text-muted-foreground line-clamp-2">{body || "Nachrichtentext..."}</p>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-center text-muted-foreground mt-2">iOS Vorschau</p>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card className="bg-card border border-border shadow-none">
            <CardContent className="pt-6 space-y-3">
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                <Send className="h-4 w-4 mr-2" />
                {isSubmitting ? "Wird gesendet..." : "Benachrichtigung senden"}
              </Button>
              <Link href="/admin/dashboard/notifications" className="block">
                <Button type="button" variant="outline" className="w-full">
                  Abbrechen
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Info */}
          <Card className="bg-blue-50 border border-blue-200 shadow-none">
            <CardContent className="pt-6">
              <p className="text-sm text-blue-800">
                <strong>Hinweis:</strong> Benachrichtigungen werden sofort an alle ausgewählten Geräte gesendet. Diese
                Aktion kann nicht rückgängig gemacht werden.
              </p>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  )
}
