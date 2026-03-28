"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { updateServiceAlert, type ServiceAlert } from "@/app/actions/alerts"
import { ArrowLeft, Save } from "lucide-react"

function toLocalDatetimeString(dateStr: string) {
  const date = new Date(dateStr)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function EditAlertPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    alert_type: "general",
    severity: "warning",
    status: "draft" as "active" | "resolved" | "draft",
    location: "",
    starts_at: "",
    ends_at: "",
  })

  useEffect(() => {
    async function fetchAlert() {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("service_alerts")
          .select("*")
          .eq("id", id)
          .single()

        if (error) throw error

        const alert = data as ServiceAlert
        setFormData({
          title: alert.title,
          description: alert.description || "",
          alert_type: alert.alert_type,
          severity: alert.severity,
          status: alert.status,
          location: alert.location || "",
          starts_at: toLocalDatetimeString(alert.starts_at),
          ends_at: alert.ends_at ? toLocalDatetimeString(alert.ends_at) : "",
        })
      } catch (error) {
        console.error("Error fetching alert:", error)
        toast.error("Fehler beim Laden der Meldung")
        router.push("/admin/dashboard/alerts")
      } finally {
        setLoading(false)
      }
    }

    fetchAlert()
  }, [id, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const submitData = new FormData()
    Object.entries(formData).forEach(([key, value]) => {
      submitData.append(key, String(value))
    })

    const loadingToast = toast.loading("Meldung wird aktualisiert...")
    const result = await updateServiceAlert(id, submitData)

    if (result.success) {
      toast.success("Meldung aktualisiert", {
        id: loadingToast,
        description: result.message,
      })
      router.push("/admin/dashboard/alerts")
    } else {
      toast.error("Fehler", { id: loadingToast, description: result.error })
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="h-[500px] w-full rounded-[10px]" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-medium text-foreground">
            Meldung bearbeiten
          </h1>
          <p className="text-muted-foreground mt-1">
            Bearbeiten Sie die Service-Meldung
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
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

          {/* Type, Severity, Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

            <div>
              <Label>Status *</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    status: value as "active" | "resolved" | "draft",
                  })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Status wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Entwurf</SelectItem>
                  <SelectItem value="active">Aktiv</SelectItem>
                  <SelectItem value="resolved">Gelöst</SelectItem>
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
            disabled={saving || !formData.title}
          >
            <Save className="h-4 w-4 mr-2" />
            Speichern
          </Button>
        </div>
      </form>
    </div>
  )
}
