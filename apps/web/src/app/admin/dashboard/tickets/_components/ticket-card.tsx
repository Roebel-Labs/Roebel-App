"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DevTicket } from "@/types/dev-tickets";
import { FixStatusChip } from "./fix-status-chip";

export const TYPE_LABELS: Record<string, string> = {
  bug: "Bug",
  feature: "Feature",
  task: "Aufgabe",
  improvement: "Verbesserung",
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  urgent: "Dringend",
};

const PRIORITY_CLS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-50 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

export const SOURCE_LABELS: Record<string, string> = {
  mecky: "🐂 Mecky",
  feedback_form: "📝 Formular",
  manual: "✍️ Manuell",
};

export function TicketCard({
  ticket,
  onOpen,
}: {
  ticket: DevTicket;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: ticket.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(ticket.id)}
      className={`cursor-pointer rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <p className="text-sm font-medium leading-snug text-foreground">
        {ticket.title}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          {TYPE_LABELS[ticket.type]}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${PRIORITY_CLS[ticket.priority]}`}
        >
          {PRIORITY_LABELS[ticket.priority]}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {SOURCE_LABELS[ticket.source]}
        </span>
        <FixStatusChip ticket={ticket} />
      </div>
    </div>
  );
}
