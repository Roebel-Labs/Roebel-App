"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Calendar, Plus, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { formatDateForDisplay, isDatePast } from "@/lib/utils/recurring-events"
import type { EventDate } from "@/types/event-dates"
import { addEventDates, cancelEventDate, deleteEventDate } from "@/app/actions/manage-events"

// Multi-date management for recurring events. Reuses the same server actions as the
// admin editor; only shown once an event actually has more than one date.
export function RecurringDatesEditor({ eventId }: { eventId: string }) {
  const [dates, setDates] = useState<EventDate[]>([])
  const [newDate, setNewDate] = useState("")
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("event_dates")
      .select("*")
      .eq("event_id", eventId)
      .order("date", { ascending: true })
    setDates((data as EventDate[]) ?? [])
    setLoading(false)
  }, [eventId])

  useEffect(() => {
    load()
  }, [load])

  const handleAdd = async () => {
    if (!newDate) return
    const t = toast.loading("Termin wird hinzugefügt...")
    const r = await addEventDates(eventId, [newDate])
    if (r.success) {
      toast.success("Termin hinzugefügt", { id: t })
      setNewDate("")
      load()
    } else {
      toast.error(r.error || "Fehler", { id: t })
    }
  }

  const handleCancel = async (id: string) => {
    const t = toast.loading("Termin wird abgesagt...")
    const r = await cancelEventDate(id)
    if (r.success) {
      toast.success("Termin abgesagt", { id: t })
      load()
    } else {
      toast.error(r.error || "Fehler", { id: t })
    }
  }

  const handleDelete = async (id: string) => {
    const t = toast.loading("Termin wird gelöscht...")
    const r = await deleteEventDate(id)
    if (r.success) {
      toast.success("Termin gelöscht", { id: t })
      load()
    } else {
      toast.error(r.error || "Fehler", { id: t })
    }
  }

  return (
    <div className="bg-card border border-border rounded-[10px] p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Calendar className="h-5 w-5 text-primary" />
        <h3 className="font-medium text-lg">Termine {dates.length > 0 && `(${dates.length})`}</h3>
      </div>

      {loading ? (
        <div className="h-10 bg-muted rounded animate-pulse" />
      ) : (
        <div className="space-y-2">
          {dates.map((d) => {
            const past = isDatePast(d.date)
            return (
              <div
                key={d.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`font-medium ${d.is_cancelled || past ? "text-muted-foreground" : "text-foreground"}`}
                  >
                    {formatDateForDisplay(d.date)}
                  </span>
                  {d.is_cancelled ? (
                    <Badge variant="secondary" className="bg-red-100 text-red-700">
                      Abgesagt
                    </Badge>
                  ) : past ? (
                    <Badge variant="secondary" className="bg-muted text-muted-foreground">
                      Vergangen
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-green-100 text-green-700">
                      Kommend
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!d.is_cancelled && !past && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancel(d.id)}
                      className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                    >
                      Absagen
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(d.id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-end gap-2 pt-2 border-t border-border">
        <div className="flex-1">
          <Label htmlFor="new_date" className="text-sm">
            Weiteren Termin hinzufügen
          </Label>
          <Input
            id="new_date"
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="mt-1"
          />
        </div>
        <Button type="button" variant="outline" onClick={handleAdd} disabled={!newDate}>
          <Plus className="h-4 w-4 mr-1" />
          Hinzufügen
        </Button>
      </div>
    </div>
  )
}
