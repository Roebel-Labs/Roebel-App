"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, hasSupabase } from "@/lib/supabase";
import {
  normalizeShow,
  sortItems,
  type LiveRundownItem,
  type LiveShow,
} from "./types";

type Target = { slug: string; showId?: never } | { showId: string; slug?: never };

/**
 * Loads one live show + its rundown and keeps both in sync over Realtime
 * (postgres_changes on live_shows / live_rundown_items). A slow safety poll
 * refetches in case an event was missed while the socket was reconnecting —
 * the overlay is on air for hours, so it must self-heal.
 */
export function useLiveShow(target: Target | null, opts: { pollMs?: number } = {}) {
  const pollMs = opts.pollMs ?? 20_000;
  const [show, setShow] = useState<LiveShow | null>(null);
  const [items, setItems] = useState<LiveRundownItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const key = target ? (target.slug ? `slug:${target.slug}` : `id:${target.showId}`) : null;
  const showIdRef = useRef<string | null>(null);

  const reload = useCallback(async () => {
    if (!key || !hasSupabase) {
      setLoading(false);
      return;
    }
    const [kind, value] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    const { data, error: e } = await supabase
      .from("live_shows")
      .select("*")
      .eq(kind === "slug" ? "slug" : "id", value)
      .maybeSingle();
    if (e) {
      setError(e.message);
      setLoading(false);
      return;
    }
    if (!data) {
      setShow(null);
      setItems([]);
      setError("not_found");
      setLoading(false);
      return;
    }
    const s = normalizeShow(data as Record<string, unknown>);
    showIdRef.current = s.id;
    setShow(s);
    setError(null);
    const { data: rows } = await supabase
      .from("live_rundown_items")
      .select("*")
      .eq("show_id", s.id)
      .order("position", { ascending: true });
    setItems(sortItems((rows ?? []) as LiveRundownItem[]));
    setLoading(false);
  }, [key]);

  useEffect(() => {
    setLoading(true);
    reload();
    if (!pollMs) return;
    const t = window.setInterval(reload, pollMs);
    return () => window.clearInterval(t);
  }, [reload, pollMs]);

  const showId = show?.id ?? null;
  useEffect(() => {
    if (!showId || !hasSupabase) return;
    const channel = supabase
      .channel(`live-db:${showId}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_shows", filter: `id=eq.${showId}` },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          setShow(normalizeShow(payload.new as Record<string, unknown>));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_rundown_items", filter: `show_id=eq.${showId}` },
        (payload) => {
          setItems((prev) => {
            if (payload.eventType === "DELETE") {
              const oldId = (payload.old as { id?: string }).id;
              return prev.filter((i) => i.id !== oldId);
            }
            const row = payload.new as LiveRundownItem;
            const rest = prev.filter((i) => i.id !== row.id);
            return sortItems([...rest, row]);
          });
        },
      )
      .subscribe((status) => {
        // After a reconnect, pull a fresh snapshot so nothing is stale.
        if (status === "SUBSCRIBED") reload();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [showId, reload]);

  return { show, items, loading, error, reload, setShow, setItems };
}
