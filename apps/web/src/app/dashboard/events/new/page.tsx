"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAccount } from "@/lib/context/AccountContext"
import { useActiveAccount } from "thirdweb/react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import {
  OrgEventForm,
  EMPTY_EVENT_VALUES,
  type OrgEventFormValues,
} from "@/components/org-dashboard/OrgEventForm"
import { createOrgEvent } from "@/app/actions/org-events"

export default function NewOrgEventPage() {
  const router = useRouter()
  const { activeAccount } = useAccount()
  const wallet = useActiveAccount()?.address
  const [submitting, setSubmitting] = useState(false)

  const initial: OrgEventFormValues = {
    ...EMPTY_EVENT_VALUES,
    organizer_name: activeAccount?.name ?? "",
    organizer_email: (activeAccount as { contact_email?: string | null } | null)?.contact_email ?? "",
  }

  async function handleSubmit(formData: FormData, publish: boolean) {
    if (!activeAccount) {
      toast.error("Kein Organisationskonto aktiv.")
      return
    }
    setSubmitting(true)
    const result = await createOrgEvent(activeAccount.id, formData, wallet, publish)
    if (result.success) {
      toast.success(publish ? "Event veröffentlicht" : "Entwurf gespeichert")
      router.push(`/dashboard/events/${result.id}/edit`)
    } else {
      toast.error(result.error || "Fehler beim Erstellen")
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/events")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-medium">Neues Event</h1>
          <p className="text-sm text-muted-foreground">
            Als Entwurf speichern oder direkt veröffentlichen.
          </p>
        </div>
      </div>

      <OrgEventForm
        mode="create"
        initial={initial}
        submitting={submitting}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
