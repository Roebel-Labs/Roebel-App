"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { RefreshCw, Sparkles, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ACTIVE_FIX_STATUSES,
  type DevTicket,
  type DevTicketStatus,
} from "@/types/dev-tickets";
import { api } from "../_lib/client";
import { TicketColumn } from "./ticket-column";
import { TicketDetailSheet } from "./ticket-detail-sheet";
import { TicketCreateDialog } from "./ticket-create-dialog";

const COLUMNS: Array<{ status: DevTicketStatus; label: string }> = [
  { status: "inbox", label: "Eingang" },
  { status: "backlog", label: "Backlog" },
  { status: "in_progress", label: "In Arbeit" },
  { status: "in_review", label: "Review" },
  { status: "done", label: "Fertig" },
  { status: "rejected", label: "Abgelehnt" },
];

export function TicketBoard() {
  const [tickets, setTickets] = useState<DevTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [triaging, setTriaging] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const load = useCallback(async (sync = false) => {
    try {
      const res = await api<{ tickets: DevTicket[] }>(
        `/api/dev-tickets${sync ? "?sync=1" : ""}`
      );
      setTickets(res.tickets);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 30s polling; sync GitHub state only while a fix is active.
  const hasActiveFix = tickets.some((t) =>
    ACTIVE_FIX_STATUSES.includes(t.fix_status)
  );
  useEffect(() => {
    const iv = setInterval(() => load(hasActiveFix), 30_000);
    return () => clearInterval(iv);
  }, [load, hasActiveFix]);

  async function runTriage() {
    setTriaging(true);
    try {
      const res = await api<{
        processed: number;
        created: number;
        duplicates: number;
        not_actionable: number;
      }>("/api/dev-tickets/triage", { method: "POST" });
      toast.success(
        `Triage: ${res.created} neue Tickets, ${res.duplicates} Duplikate, ${res.not_actionable} nicht umsetzbar (${res.processed} geprüft)`
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setTriaging(false);
    }
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ticket = tickets.find((t) => t.id === active.id);
    if (!ticket) return;

    const overId = String(over.id);
    let targetStatus: DevTicketStatus;
    let position: number;

    const columnOf = (status: DevTicketStatus) =>
      tickets
        .filter((t) => t.status === status && t.id !== ticket.id)
        .sort((a, b) => a.position - b.position);

    if (overId.startsWith("col:")) {
      targetStatus = overId.slice(4) as DevTicketStatus;
      const col = columnOf(targetStatus);
      position = col.length ? col[col.length - 1].position + 1024 : 1024;
    } else {
      const overTicket = tickets.find((t) => t.id === overId);
      if (!overTicket) return;
      targetStatus = overTicket.status;
      const col = columnOf(targetStatus);
      const idx = col.findIndex((t) => t.id === overId);
      const prev = col[idx - 1];
      position = prev
        ? (prev.position + overTicket.position) / 2
        : overTicket.position - 1024;
    }

    // Optimistic update, rollback via reload on error.
    setTickets((ts) =>
      ts.map((t) =>
        t.id === ticket.id ? { ...t, status: targetStatus, position } : t
      )
    );
    api(`/api/dev-tickets/${ticket.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: targetStatus, position }),
    }).catch((err) => {
      toast.error(err instanceof Error ? err.message : String(err));
      load();
    });
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tickets</h1>
          <p className="text-sm text-muted-foreground">
            KI-triagierte Bugs &amp; Aufgaben — Fixes per Klick, Merge nach
            menschlicher Prüfung
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => load(true)}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Aktualisieren
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={runTriage}
            disabled={triaging}
          >
            <Sparkles className="mr-1.5 h-4 w-4" />
            {triaging ? "Triage läuft…" : "Import & Triage"}
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Neues Ticket
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Lade Tickets…</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
            {COLUMNS.map((col) => (
              <TicketColumn
                key={col.status}
                status={col.status}
                label={col.label}
                tickets={tickets
                  .filter((t) => t.status === col.status)
                  .sort((a, b) => a.position - b.position)}
                onOpen={setSelectedId}
              />
            ))}
          </div>
        </DndContext>
      )}

      <TicketCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => load()}
      />
      <TicketDetailSheet
        ticketId={selectedId}
        onClose={() => setSelectedId(null)}
        onChanged={() => load()}
      />
    </div>
  );
}
