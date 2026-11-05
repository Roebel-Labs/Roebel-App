"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, hasSupabase } from "@/lib/supabase";

/**
 * Operator view of channel live:<show_id>: viewer count from presence (the console listens
 * without tracking itself, so it never counts as a viewer) and reactions per minute from
 * the `react` broadcasts.
 */
export function useLiveChannelStats(showId: string | null) {
  const [viewers, setViewers] = useState(0);
  const [perMinute, setPerMinute] = useState(0);
  const stamps = useRef<number[]>([]);

  useEffect(() => {
    if (!showId || !hasSupabase) return;
    stamps.current = [];
    const ch = supabase.channel(`live:${showId}`);
    ch.on("presence", { event: "sync" }, () => {
      setViewers(Object.keys(ch.presenceState()).length);
    })
      .on("broadcast", { event: "react" }, () => {
        stamps.current.push(Date.now());
      })
      .subscribe();
    const t = window.setInterval(() => {
      const cutoff = Date.now() - 60_000;
      stamps.current = stamps.current.filter((s) => s > cutoff);
      setPerMinute(stamps.current.length);
    }, 2000);
    return () => {
      window.clearInterval(t);
      supabase.removeChannel(ch);
      setViewers(0);
      setPerMinute(0);
    };
  }, [showId]);

  return { viewers, perMinute };
}
