"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { DevTicket, DevTicketStatus } from "@/types/dev-tickets";
import { TicketCard } from "./ticket-card";

export function TicketColumn({
  status,
  label,
  tickets,
  onOpen,
}: {
  status: DevTicketStatus;
  label: string;
  tickets: DevTicket[];
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl bg-muted/50 p-2">
      <div className="flex items-center justify-between px-2 py-1.5">
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <span className="text-xs text-muted-foreground">{tickets.length}</span>
      </div>
      <SortableContext
        items={tickets.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className={`flex min-h-24 flex-1 flex-col gap-2 rounded-lg p-1 transition-colors ${
            isOver ? "bg-primary/5" : ""
          }`}
        >
          {tickets.map((t) => (
            <TicketCard key={t.id} ticket={t} onOpen={onOpen} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}
