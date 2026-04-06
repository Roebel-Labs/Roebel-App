"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useActiveAccount } from "thirdweb/react";
import { useAccount } from "@/lib/context/AccountContext";
import { AppEventCard } from "./AppEventCard";
import { EventsFilters } from "@/components/events/events-filters";
import Link from "next/link";
import { Plus, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Event {
  id: string;
  title: string;
  description: string | null;
  date: string;
  time: string | null;
  end_time: string | null;
  location: string;
  organizer_name: string;
  organizer_email: string;
  organizer_phone: string | null;
  category: string | null;
  image_url: string | null;
  website_url: string | null;
  ticket_price: number | null;
  max_attendees: number | null;
  created_at: string;
  account_id: string | null;
  accounts: {
    id: string;
    name: string;
    avatar_url: string | null;
    account_type: string;
  } | null;
}

interface InterestData {
  event_id: string;
  count: number;
  isInterested: boolean;
}

interface AppEventsContentProps {
  initialEvents: Event[];
}

export function AppEventsContent({ initialEvents }: AppEventsContentProps) {
  const account = useActiveAccount();
  const { isOwnerOf } = useAccount();
  const [events, setEvents] = useState<Event[]>(initialEvents);
  const [loading, setLoading] = useState(false);
  const [currentCategory, setCurrentCategory] = useState("All Events");
  const [interestMap, setInterestMap] = useState<
    Record<string, InterestData>
  >({});

  const supabase = createClient();

  // Fetch interest data for all visible events
  useEffect(() => {
    async function fetchInterests() {
      if (events.length === 0) return;

      const eventIds = events.map((e) => e.id);

      // Fetch counts for all events
      const { data: counts } = await supabase
        .from("event_interests")
        .select("event_id")
        .in("event_id", eventIds);

      // Fetch user's interests if logged in
      let userInterests: string[] = [];
      if (account?.address) {
        const { data: userRows } = await supabase
          .from("event_interests")
          .select("event_id")
          .in("event_id", eventIds)
          .eq("user_wallet", account.address);

        userInterests = (userRows || []).map(
          (r: { event_id: string }) => r.event_id
        );
      }

      // Build interest map
      const countMap: Record<string, number> = {};
      (counts || []).forEach((row: { event_id: string }) => {
        countMap[row.event_id] = (countMap[row.event_id] || 0) + 1;
      });

      const map: Record<string, InterestData> = {};
      eventIds.forEach((id) => {
        map[id] = {
          event_id: id,
          count: countMap[id] || 0,
          isInterested: userInterests.includes(id),
        };
      });

      setInterestMap(map);
    }

    fetchInterests();
  }, [events, account?.address]);

  const handleCategoryChange = async (category: string) => {
    if (category === currentCategory) return;

    setLoading(true);
    setCurrentCategory(category);

    try {
      let query = supabase
        .from("events")
        .select("*, accounts:account_id(id, name, avatar_url, account_type)")
        .eq("status", "approved")
        .order("date", { ascending: true });

      if (category !== "All Events") {
        query = query.eq("category", category);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching filtered events:", error);
        setEvents([]);
      } else {
        setEvents(data || []);
      }
    } catch (error) {
      console.error("Error filtering events:", error);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Veranstaltungen in deiner Nähe
        </h1>
        <div className="flex gap-2 mt-3">
          <Button asChild size="sm" className="rounded-lg">
            <Link href="/app/submit">
              <Plus className="h-4 w-4 mr-1" />
              Veranstaltung erstellen
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            asChild
            className="rounded-lg"
          >
            <Link href="/app/profile#veranstaltungen">
              <Calendar className="h-4 w-4 mr-1" />
              Deine Veranstaltungen
            </Link>
          </Button>
        </div>
      </div>

      {/* Category Filters */}
      <EventsFilters
        currentCategory={currentCategory}
        onCategoryChange={handleCategoryChange}
      />

      {/* Events Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-card rounded-lg border border-border animate-pulse"
            >
              <div className="aspect-video bg-muted rounded-t-lg" />
              <div className="p-3 space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
                <div className="h-8 bg-muted rounded w-full mt-1" />
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-8 text-center">
          <p className="text-muted-foreground text-sm mb-3">
            Keine Veranstaltungen gefunden.
          </p>
          <Button asChild size="sm" className="rounded-lg">
            <Link href="/app/submit">Veranstaltung erstellen</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {events.map((event) => (
            <AppEventCard
              key={event.id}
              event={event}
              initialInterestCount={interestMap[event.id]?.count || 0}
              initialIsInterested={
                interestMap[event.id]?.isInterested || false
              }
              accountName={event.accounts?.name ?? null}
              isOwner={isOwnerOf(event.account_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
