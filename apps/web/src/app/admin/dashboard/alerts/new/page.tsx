"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { createServiceAlert } from "@/app/actions/alerts"
import { ArrowLeft, Save, AlertTriangle } from "lucide-react"

function toLocalDatetimeString(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function NewAlertPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    alert_type: "general",
    severity: "warning",
    location: "",
    starts_at: toLocalDatetimeString(new Date()),
    ends_at: "",
  })

  const handleSubmit = async (
    e: React.FormEvent,
    status: "draft" | "active"
  ) => {
    e.preventDefault()
    setLoading(true)

    const submitData = new FormData()
    Object.entries({ ...formData, status }).forEach(([key, value]) => {
      submitData.append(key, String(value))
    })

    const loadingToast = toast.loading(
      status === "active"
        ? "Meldung wird veröffentlicht..."
        : "Entwurf wird gespeichert..."
    )

    const result = await createServiceAlert(submitData)

    if (result.success) {
      toast.success(
        status === "active" ? "Meldung veröffentlicht" : "Entwurf gespeichert",
        { id: loadingToast, description: result.message }
      )
      router.push("/admin/dashboard/alerts")
    } else {
      toast.error("Fehler", { id: loadingToast, description: result.error })
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-medium text-foreground">Neue Meldung</h1>
          <p className="text-muted-foreground mt-1">
            Erstellen Sie eine neue Service-Meldung oder Warnung
          </p>
        </div>
      </div>

      {/* Form */}
      <form className="space-y-6">
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          {/* Title */}
          <div>
            <Label htmlFor="title">Titel *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="z.B. Wasserausfall in der Altstadt"
              required
              className="mt-1"
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">Beschreibung</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Detaillierte Beschreibung der Meldung..."
              rows={4}
              className="mt-1"
            />
          </div>

          {/* Type and Severity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label>Meldungstyp *</Label>
              <Select
                value={formData.alert_type}
                onValueChange={(value) =>
                  setFormData({ ...formData, alert_type: value })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Typ wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="water_outage">Wasserausfall</SelectItem>
                  <SelectItem value="road_closure">Straßensperrung</SelectItem>
                  <SelectItem value="storm_warning">Sturmwarnung</SelectItem>
                  <SelectItem value="fire_department">Feuerwehr</SelectItem>
                  <SelectItem value="general">Allgemein</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Dringlichkeit *</Label>
              <Select
                value={formData.severity}
                onValueChange={(value) =>
                  setFormData({ ...formData, severity: value })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Dringlichkeit wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warnung</SelectItem>
                  <SelectItem value="critical">Kritisch</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Location */}
          <div>
            <Label htmlFor="location">Ort (optional)</Label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) =>
                setFormData({ ...formData, location: e.target.value })
              }
              placeholder="z.B. Altstadt, Müritzstraße"
              className="mt-1"
            />
          </div>

          {/* Time range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="starts_at">Beginn *</Label>
              <Input
                id="starts_at"
                type="datetime-local"
                value={formData.starts_at}
                onChange={(e) =>
                  setFormData({ ...formData, starts_at: e.target.value })
                }
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="ends_at">Voraussichtliches Ende (optional)</Label>
              <Input
                id="ends_at"
                type="datetime-local"
                value={formData.ends_at}
                onChange={(e) =>
                  setFormData({ ...formData, ends_at: e.target.value })
                }
                className="mt-1"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            variant="outline"
            onClick={(e) => handleSubmit(e, "draft")}
            disabled={loading || !formData.title}
          >
            <Save className="h-4 w-4 mr-2" />
            Als Entwurf speichern
          </Button>
          <Button
            type="submit"
            onClick={(e) => handleSubmit(e, "active")}
            disabled={loading || !formData.title}
          >
            <AlertTriangle className="h-4 w-4 mr-2" />
            Sofort veröffentlichen
          </Button>
        </div>
      </form>
    </div>
  )
}
