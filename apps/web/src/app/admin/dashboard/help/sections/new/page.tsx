"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { createSection } from "@/app/actions/help-hub"
import { ArrowLeft, Save, Eye } from "lucide-react"

export default function NewSectionPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: "",
    view_mode: "grid",
    display_order: "0",
  })

  const handleSubmit = async (e: React.FormEvent, publish: boolean) => {
    e.preventDefault()
    setLoading(true)

    const submitData = new FormData()
    submitData.append("title", formData.title)
    submitData.append("view_mode", formData.view_mode)
    submitData.append("display_order", formData.display_order)
    submitData.append("is_published", String(publish))

    const loadingToast = toast.loading(
      publish ? "Bereich wird veröffentlicht..." : "Entwurf wird gespeichert..."
    )

    const result = await createSection(submitData)

    if (result.success) {
      toast.success(publish ? "Bereich veröffentlicht" : "Entwurf gespeichert", {
        id: loadingToast,
        description: result.message,
      })
      router.push("/admin/dashboard/help")
    } else {
      toast.error("Fehler", {
        id: loadingToast,
        description: result.error,
      })
      setLoading(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-medium text-foreground">Neuer Bereich</h1>
          <p className="text-muted-foreground mt-1">
            Bereiche gruppieren Sammlungen in labelbare Abschnitte
          </p>
        </div>
      </div>

      {/* Form */}
      <form className="space-y-6">
        <div className="bg-card border border-border rounded-[10px] p-6 space-y-6">
          <div>
            <Label htmlFor="title">Titel *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="z.B. Erste Schritte"
              required
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="view_mode">Ansichtsmodus</Label>
            <Select
              value={formData.view_mode}
              onValueChange={(value) => setFormData({ ...formData, view_mode: value })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="grid">Grid-Ansicht</SelectItem>
                <SelectItem value="list">Listen-Ansicht</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Wie die Sammlungen in diesem Bereich dargestellt werden
            </p>
          </div>

          <div>
            <Label htmlFor="display_order">Reihenfolge</Label>
            <Input
              id="display_order"
              type="number"
              value={formData.display_order}
              onChange={(e) => setFormData({ ...formData, display_order: e.target.value })}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">Niedrigere Zahl = weiter oben</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between bg-card border border-border rounded-[10px] p-6">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
            Abbrechen
          </Button>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={(e) => handleSubmit(e, false)}
              disabled={loading || !formData.title}
            >
              <Save className="h-4 w-4 mr-2" />
              Als Entwurf speichern
            </Button>
            <Button
              type="button"
              onClick={(e) => handleSubmit(e, true)}
              disabled={loading || !formData.title}
            >
              <Eye className="h-4 w-4 mr-2" />
              Veröffentlichen
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
