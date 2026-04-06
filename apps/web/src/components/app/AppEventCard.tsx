"use client";

import Link from "next/link";
import Image from "next/image";
import { Pencil } from "lucide-react";
import { EventInterestButton } from "./EventInterestButton";

interface Event {
  id: string;
  title: string;
  description: string | null;
  date: string;
  time: string | null;
  end_time: string | null;
  location: string;
  category: string | null;
  image_url: string | null;
  ticket_price: number | null;
}

interface AppEventCardProps {
  event: Event;
  initialInterestCount?: number;
  initialIsInterested?: boolean;
  accountName?: string | null;
  isOwner?: boolean;
}

export function AppEventCard({
  event,
  initialInterestCount = 0,
  initialIsInterested = false,
  accountName,
  isOwner = false,
}: AppEventCardProps) {
  const eventDate = new Date(event.date);
  const day = eventDate.getDate();
  const month = eventDate.toLocaleDateString("de-DE", { month: "short" });

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <Link href={`/app/events/${event.id}`}>
        <div className="relative aspect-video overflow-hidden">
          {event.image_url ? (
            <>
              <Image
                src={event.image_url}
                alt=""
                fill
                className="object-cover blur-xl scale-110"
                aria-hidden="true"
                sizes="(max-width: 640px) 100vw, 320px"
              />
              <Image
                src={event.image_url}
                alt={event.title}
                fill
                className="object-contain relative z-10"
                sizes="(max-width: 640px) 100vw, 320px"
              />
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-muted to-muted-foreground/20" />
          )}

          {/* Date badge */}
          <div className="absolute bottom-3 left-3 bg-card rounded-lg shadow-md overflow-hidden min-w-[48px]">
            <div className="text-center px-2 py-1.5">
              <div className="text-xl font-semibold text-foreground leading-none">
                {day}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                {month}
              </div>
            </div>
          </div>
        </div>
      </Link>

      <div className="p-3 space-y-1.5">
        <Link href={`/app/events/${event.id}`}>
          <h3 className="text-sm font-semibold text-foreground line-clamp-2 hover:text-primary transition-colors leading-snug">
            {event.title}
          </h3>
        </Link>

        {accountName && (
          <p className="text-xs text-muted-foreground truncate">
            von {accountName}
          </p>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {event.time && (
            <span>
              {event.time}
              {event.end_time && ` - ${event.end_time}`}
            </span>
          )}
          {event.time && event.location && <span>&middot;</span>}
          <span className="truncate">{event.location}</span>
        </div>

        {isOwner && (
          <div className="flex items-center gap-2 pt-0.5">
            <Link
              href={`/app/events/${event.id}?edit=true`}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Pencil className="h-3 w-3" />
              Bearbeiten
            </Link>
          </div>
        )}

        <EventInterestButton
          eventId={event.id}
          initialCount={initialInterestCount}
          initialIsInterested={initialIsInterested}
          variant="card"
        />
      </div>
    </div>
  );
}
