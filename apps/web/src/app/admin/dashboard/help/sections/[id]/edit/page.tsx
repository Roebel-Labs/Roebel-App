"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { updateSection, deleteSection } from "@/app/actions/help-hub"
import { createClient } from "@/lib/supabase/client"
import { ArrowLeft, Save, Trash2 } from "lucide-react"

export default function EditSectionPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [sectionId, setSectionId] = useState("")
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [formData, setFormData] = useState({
    title: "",
    view_mode: "grid",
    display_order: "0",
    is_published: false,
  })

  useEffect(() => {
    params.then((resolvedParams) => {
      setSectionId(resolvedParams.id)
      fetchSection(resolvedParams.id)
    })
  }, [params])

  const fetchSection = async (id: string) => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("help_sections")
        .select("*")
        .eq("id", id)
        .single()

      if (error) throw error

      if (data) {
        setFormData({
          title: data.title || "",
          view_mode: data.view_mode || "grid",
          display_order: String(data.display_order ?? 0),
          is_published: data.is_published ?? false,
        })
      }
    } catch (error) {
      console.error("Error fetching section:", error)
      toast.error("Fehler beim Laden des Bereichs")
      router.push("/admin/dashboard/help")
    } finally {
      setFetching(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const submitData = new FormData()
    submitData.append("title", formData.title)
    submitData.append("view_mode", formData.view_mode)
    submitData.append("display_order", formData.display_order)
    submitData.append("is_published", String(formData.is_published))

    const loadingToast = toast.loading("Bereich wird aktualisiert...")
    const result = await updateSection(sectionId, submitData)

    if (result.success) {
      toast.success("Bereich aktualisiert", {
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

  const handleDelete = async () => {
    const loadingToast = toast.loading("Bereich wird gelöscht...")
    const result = await deleteSection(sectionId)

    if (result.success) {
      toast.success("Bereich gelöscht", {
        id: loadingToast,
        description: result.message,
      })
      router.push("/admin/dashboard/help")
    } else {
      toast.error("Fehler", {
        id: loadingToast,
        description: result.error,
      })
    }
  }

  if (fetching) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-medium text-foreground">Bereich bearbeiten</h1>
          <p className="text-muted-foreground mt-1">Bearbeiten Sie die Bereichsinformationen</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash2 className="h-4 w-4 mr-2" />
              Löschen
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Bereich löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Möchten Sie diesen Bereich wirklich löschen? Zugehörige Sammlungen werden nicht
                gelöscht, aber ihre Zuordnung wird entfernt.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                Löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
          <Button type="button" onClick={handleSubmit} disabled={loading || !formData.title}>
            <Save className="h-4 w-4 mr-2" />
            Änderungen speichern
          </Button>
        </div>
      </form>
    </div>
  )
}
