"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Calendar, MapPin } from "lucide-react";
import { useActiveAccount } from "thirdweb/react";
import { createClient } from "@/lib/supabase/client";

interface SavedEvent {
  id: string;
  title: string;
  date: string;
  time: string | null;
  location: string;
  image_url: string | null;
}

export function SavedEventsSection() {
  const account = useActiveAccount();
  const [events, setEvents] = useState<SavedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSavedEvents() {
      if (!account?.address) {
        setLoading(false);
        return;
      }

      const supabase = createClient();

      const { data: interests } = await supabase
        .from("event_interests")
        .select("event_id")
        .eq("user_wallet", account.address);

      if (!interests || interests.length === 0) {
        setEvents([]);
        setLoading(false);
        return;
      }

      const eventIds = interests.map(
        (i: { event_id: string }) => i.event_id
      );

      const { data: eventData } = await supabase
        .from("events")
        .select("id, title, date, time, location, image_url")
        .in("id", eventIds)
        .order("date", { ascending: true });

      setEvents(eventData || []);
      setLoading(false);
    }

    fetchSavedEvents();
  }, [account?.address]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-3 sm:p-4 mb-3 sm:mb-4">
        <div className="h-5 bg-muted rounded w-1/3 mb-3 animate-pulse" />
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-12 h-12 bg-muted rounded-lg shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      id="veranstaltungen"
      className="bg-card border border-border rounded-lg p-3 sm:p-4 mb-3 sm:mb-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm sm:text-base font-medium text-foreground">
          Meine Veranstaltungen
        </h2>
        <Link
          href="/app/events"
          className="text-xs text-primary hover:text-primary/80 transition-colors whitespace-nowrap"
        >
          Alle entdecken →
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground mb-2">
            Du hast noch keine Veranstaltungen gespeichert.
          </p>
          <Link
            href="/app/events"
            className="text-sm text-primary hover:text-primary/80 transition-colors"
          >
            Veranstaltungen entdecken
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {events.slice(0, 5).map((event) => {
            const eventDate = new Date(event.date);
            const formattedDate = eventDate.toLocaleDateString("de-DE", {
              day: "numeric",
              month: "short",
            });

            return (
              <Link
                key={event.id}
                href={`/app/events/${event.id}`}
                className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-accent transition-colors"
              >
                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-muted shrink-0">
                  {event.image_url ? (
                    <Image
                      src={event.image_url}
                      alt={event.title}
                      fill
                      className="object-cover"
                      sizes="48px"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-muted to-muted-foreground/20" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {event.title}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formattedDate}
                      {event.time && `, ${event.time}`}
                    </span>
                    <span className="flex items-center gap-1 truncate">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{event.location}</span>
                    </span>
                  </div>
                </div>
                <svg
                  className="w-4 h-4 text-muted-foreground shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>
            );
          })}

          {events.length > 5 && (
            <Link
              href="/app/events"
              className="block text-center text-xs text-primary hover:text-primary/80 pt-1 transition-colors"
            >
              +{events.length - 5} weitere Veranstaltungen
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
