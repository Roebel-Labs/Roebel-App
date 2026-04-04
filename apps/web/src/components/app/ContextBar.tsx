"use client";

import { useState, useEffect } from "react";
import { Calendar, Droplets, Sun, CloudRain, Cloud, Snowflake, Thermometer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function ContextBar() {
  const [eventCount, setEventCount] = useState(0);

  useEffect(() => {
    async function fetchEventCount() {
      const supabase = createClient();
      const now = new Date();
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const { count } = await supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved")
        .gte("date", now.toISOString())
        .lte("date", weekEnd.toISOString());

      setEventCount(count ?? 0);
    }
    fetchEventCount();
  }, []);

  const today = new Date();
  const dateStr = today.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-card rounded-lg border border-border text-sm text-muted-foreground overflow-x-auto">
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <Calendar className="h-3.5 w-3.5" />
        {dateStr}
      </span>
      <span className="text-border">·</span>
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <Droplets className="h-3.5 w-3.5 text-blue-500" />
        Müritz
      </span>
      {eventCount > 0 && (
        <>
          <span className="text-border">·</span>
          <span className="whitespace-nowrap">
            {eventCount} Event{eventCount !== 1 ? "s" : ""} diese Woche
          </span>
        </>
      )}
    </div>
  );
}
