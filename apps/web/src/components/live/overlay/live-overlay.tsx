"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { supabase, hasSupabase } from "@/lib/supabase";
import { useLiveShow } from "../use-live-show";
import { cleanForAir } from "../profanity";
import {
  CHAT_COLUMNS,
  LIVE_REACTIONS,
  PUBLIC_LIVE_BASE,
  currentItem,
  fetchLiveResults,
  nextItem,
  type LiveChatMessage,
  type LiveOverlay as OverlayFlags,
  type LiveResultItem,
  type LiveRundownItem,
  type LiveShow,
} from "../types";
import {
  FeaturedMessage,
  LogoBug,
  LowerThird,
  MessageBanner,
  NextUpChip,
  PollResults,
  ReactionLayer,
  SUPPORT_ALERT_MS,
  SupportAlert,
  useStageScale,
  type FloatingReaction,
  type SupportAlertData,
} from "./overlay-elements";

const MAX_REACTIONS = 36;
const RESULTS_POLL_MS = 5000;

type Mode = "live" | "preview" | "checker";

/** OBS browser source: 1920×1080, transparent. `mode` = preview (dummy data) | checker (real data on a checkerboard). */
export function LiveOverlay({ slug, mode }: { slug: string; mode: Mode }) {
  if (mode === "preview") return <PreviewOverlay slug={slug} />;
  return <RealOverlay slug={slug} checker={mode === "checker"} />;
}

/* ------------------------------------------------------------------ */
/* Real data                                                          */
/* ------------------------------------------------------------------ */

function RealOverlay({ slug, checker }: { slug: string; checker: boolean }) {
  const { show, items } = useLiveShow({ slug }, { pollMs: 15_000 });
  const showId = show?.id ?? null;
  const overlay = show?.overlay;

  const reactions = useReactions();
  const alerts = useAlertQueue();
  const alertsOnRef = useRef(false);
  alertsOnRef.current = !!overlay?.alerts;
  const reactionsOnRef = useRef(false);
  reactionsOnRef.current = !!overlay?.reactions;

  // Featured message: fetched by id whenever the operator changes it.
  const [featured, setFeatured] = useState<LiveChatMessage | null>(null);
  const featuredId = overlay?.featured_message_id ?? null;
  useEffect(() => {
    if (!featuredId || !hasSupabase) {
      setFeatured(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("live_chat_messages")
      .select(CHAT_COLUMNS)
      .eq("id", featuredId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setFeatured((data as LiveChatMessage | null) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [featuredId]);

  // Chat inserts (support alerts) + updates (featured message hidden) + broadcast reactions.
  const { push: pushAlert } = alerts;
  const { add: addReaction } = reactions;
  useEffect(() => {
    if (!showId || !hasSupabase) return;
    const db = supabase
      .channel(`live-overlay-chat:${showId}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_chat_messages", filter: `show_id=eq.${showId}` },
        (payload) => {
          const m = payload.new as LiveChatMessage;
          if (m.kind !== "support" || m.hidden_at || !alertsOnRef.current) return;
          pushAlert({
            id: m.id,
            name: m.display_name?.trim() || "Jemand",
            amountCents: m.amount_cents,
            message: cleanForAir(m.body),
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_chat_messages", filter: `show_id=eq.${showId}` },
        (payload) => {
          const m = payload.new as LiveChatMessage;
          setFeatured((cur) => (cur && cur.id === m.id ? (m.hidden_at ? null : { ...cur, ...m }) : cur));
        },
      )
      .subscribe();
    const live = supabase
      .channel(`live:${showId}`)
      .on("broadcast", { event: "react" }, ({ payload }) => {
        if (!reactionsOnRef.current) return;
        const e = (payload as { e?: string } | undefined)?.e;
        if (e && (LIVE_REACTIONS as string[]).includes(e)) addReaction(e);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(db);
      supabase.removeChannel(live);
    };
  }, [showId, pushAlert, addReaction]);

  const results = usePolledResults(slug, !!overlay?.poll);

  if (!show || !overlay) return <Stage checker={checker} />;
  return (
    <Stage checker={checker}>
      <OverlayScene
        show={show}
        items={items}
        overlay={overlay}
        featured={featured}
        results={results}
        alert={alerts.current}
        reactions={reactions.list}
        onReactionDone={reactions.remove}
      />
    </Stage>
  );
}

function usePolledResults(slug: string, on: boolean) {
  const [results, setResults] = useState<LiveResultItem[]>([]);
  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    const load = async () => {
      const r = await fetchLiveResults(slug);
      if (!cancelled && r) setResults(r);
    };
    load();
    const t = window.setInterval(load, RESULTS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [slug, on]);
  return results;
}

/* ------------------------------------------------------------------ */
/* Shared scene                                                       */
/* ------------------------------------------------------------------ */

function OverlayScene({
  show,
  items,
  overlay,
  featured,
  results,
  alert,
  reactions,
  onReactionDone,
}: {
  show: LiveShow;
  items: LiveRundownItem[];
  overlay: OverlayFlags;
  featured: LiveChatMessage | null;
  results: LiveResultItem[];
  alert: SupportAlertData | null;
  reactions: FloatingReaction[];
  onReactionDone: (id: number) => void;
}) {
  const cur = currentItem(show, items);
  const next = nextItem(show, items);
  const banner = overlay.message;
  const bottomOffset = banner ? 112 : 72;
  const qrUrl = `${PUBLIC_LIVE_BASE}/${show.slug}`;

  return (
    <>
      {/* bottom-left stack: "Als Nächstes" above the lower third */}
      <motion.div
        className="absolute left-[80px] flex flex-col items-start gap-4"
        animate={{ bottom: bottomOffset }}
        initial={false}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <LayoutGroup>
          <AnimatePresence mode="popLayout">
            {overlay.next_up && next && <NextUpChip key={`next-${next.id}`} item={next} />}
          </AnimatePresence>
          <AnimatePresence mode="wait">
            {overlay.lower_third && cur && (
              <LowerThird key={`lt-${cur.id}|${cur.title}|${cur.subtitle ?? ""}|${cur.detail ?? ""}`} item={cur} />
            )}
          </AnimatePresence>
        </LayoutGroup>
      </motion.div>

      {/* top-right logo bug (+ QR) */}
      <div className="absolute right-[64px] top-[56px]">
        <AnimatePresence>
          {(overlay.bug || overlay.qr) && (
            <LogoBug key="bug" showQr={overlay.qr} qrUrl={qrUrl} live={show.status === "live"} />
          )}
        </AnimatePresence>
      </div>

      {/* top-center support alert */}
      <div className="absolute left-1/2 top-[56px] -translate-x-1/2">
        <AnimatePresence mode="wait">
          {overlay.alerts && alert && <SupportAlert key={alert.id} alert={alert} />}
        </AnimatePresence>
      </div>

      {/* left: poll */}
      <div className="absolute left-[80px] top-[150px]">
        <AnimatePresence>{overlay.poll && <PollResults key="poll" items={results} />}</AnimatePresence>
      </div>

      {/* right: featured chat message */}
      <motion.div
        className="absolute right-[280px]"
        animate={{ bottom: bottomOffset + 330 }}
        initial={false}
        transition={{ duration: 0.5 }}
      >
        <AnimatePresence mode="wait">
          {featured && !featured.hidden_at && <FeaturedMessage key={featured.id} message={featured} />}
        </AnimatePresence>
      </motion.div>

      {/* right edge: reactions */}
      {overlay.reactions && <ReactionLayer reactions={reactions} onDone={onReactionDone} />}

      {/* bottom band: operator message */}
      <div className="absolute inset-x-0 bottom-0">
        <AnimatePresence>{banner && <MessageBanner key="banner" text={banner} />}</AnimatePresence>
      </div>
    </>
  );
}

function Stage({ checker, children }: { checker: boolean; children?: React.ReactNode }) {
  const scale = useStageScale();
  return (
    <div
      className="fixed left-0 top-0 overflow-hidden"
      style={{
        width: 1920,
        height: 1080,
        transform: scale < 1 ? `scale(${scale})` : undefined,
        transformOrigin: "top left",
        ...(checker
          ? {
              backgroundColor: "#9CA3AF",
              backgroundImage:
                "linear-gradient(45deg,#D1D5DB 25%,transparent 25%),linear-gradient(-45deg,#D1D5DB 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#D1D5DB 75%),linear-gradient(-45deg,transparent 75%,#D1D5DB 75%)",
              backgroundSize: "48px 48px",
              backgroundPosition: "0 0,0 24px,24px -24px,-24px 0",
            }
          : { background: "transparent" }),
      }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hooks: alert queue + reactions                                     */
/* ------------------------------------------------------------------ */

function useAlertQueue() {
  const [queue, setQueue] = useState<SupportAlertData[]>([]);
  const seen = useRef(new Set<string>());
  const push = useCallback((a: SupportAlertData) => {
    if (seen.current.has(a.id)) return;
    seen.current.add(a.id);
    setQueue((q) => (q.length > 30 ? q : [...q, a]));
  }, []);
  const current = queue[0] ?? null;
  const currentId = current?.id;
  useEffect(() => {
    if (!currentId) return;
    // Visible time + a short gap so the exit animation finishes before the next card.
    const t = window.setTimeout(() => setQueue((q) => q.slice(1)), SUPPORT_ALERT_MS + 700);
    return () => window.clearTimeout(t);
  }, [currentId]);
  return { current, push };
}

function useReactions() {
  const [list, setList] = useState<FloatingReaction[]>([]);
  const counter = useRef(0);
  const add = useCallback((emoji: string) => {
    setList((cur) => {
      if (cur.length >= MAX_REACTIONS) return cur;
      counter.current += 1;
      return [
        ...cur,
        {
          id: counter.current,
          emoji,
          x: Math.random() * 150,
          drift: (Math.random() - 0.5) * 70,
          duration: 2.6 + Math.random() * 1.2,
          size: 56 + Math.round(Math.random() * 26),
        },
      ];
    });
  }, []);
  const remove = useCallback((id: number) => setList((cur) => cur.filter((r) => r.id !== id)), []);
  return { list, add, remove };
}

/* ------------------------------------------------------------------ */
/* Preview (?preview=1): dummy data on a checkerboard                 */
/* ------------------------------------------------------------------ */

const DUMMY_ITEMS: LiveRundownItem[] = [
  ["Tanzgruppe Sonnenschein", "Kinder 6–9 Jahre", "Choreografie: „Wirbelwind“ · TSV Röbel"],
  ["Formation Müritz Moves", "Jugend 14–17", "Hip-Hop · Waren (Müritz)"],
  ["Showdance Crew Malchow", "Erwachsene", null],
  ["Line Dance Röbel", "Senioren", "Country Medley"],
  ["Ballettschule Plau", "Kinder 10–13", "Schwanensee (Auszug)"],
].map(([title, subtitle, detail], i) => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  show_id: "preview",
  position: i,
  title: title as string,
  subtitle: subtitle as string,
  detail: detail as string | null,
  org_account_id: null,
  image_url: null,
  planned_at: null,
  status: i === 0 ? "on_stage" : "upcoming",
  on_stage_at: null,
}));

const DUMMY_SUPPORTS: Omit<SupportAlertData, "id">[] = [
  { name: "Anna", amountCents: 1000, message: "Viel Erfolg an alle Tänzerinnen und Tänzer!" },
  { name: "Familie Krüger", amountCents: 2500, message: "Grüße an Mia 💃" },
  { name: "Jemand", amountCents: 500, message: null },
];

function PreviewOverlay({ slug }: { slug: string }) {
  const [stageIdx, setStageIdx] = useState(0);
  const reactions = useReactions();
  const alerts = useAlertQueue();
  const { add } = reactions;
  const { push } = alerts;

  const items = useMemo(
    () =>
      DUMMY_ITEMS.map((it, i) => ({
        ...it,
        status: (i < stageIdx ? "done" : i === stageIdx ? "on_stage" : "upcoming") as LiveRundownItem["status"],
      })),
    [stageIdx],
  );

  useEffect(() => {
    const r = window.setInterval(() => add(LIVE_REACTIONS[Math.floor(Math.random() * LIVE_REACTIONS.length)]), 380);
    let n = 0;
    const a = window.setInterval(() => {
      const s = DUMMY_SUPPORTS[n % DUMMY_SUPPORTS.length];
      push({ ...s, id: `preview-${n}`, message: cleanForAir(s.message) });
      n += 1;
    }, 11_000);
    const st = window.setInterval(() => setStageIdx((i) => (i + 1) % DUMMY_ITEMS.length), 14_000);
    push({ ...DUMMY_SUPPORTS[0], id: "preview-first" });
    return () => {
      window.clearInterval(r);
      window.clearInterval(a);
      window.clearInterval(st);
    };
  }, [add, push]);

  const show: LiveShow = {
    id: "preview",
    slug,
    event_id: null,
    title: "DanceCup Röbel 2026",
    subtitle: null,
    status: "live",
    hls_url: null,
    replay_url: null,
    poster_url: null,
    starts_at: null,
    cf_live_input_id: null,
    beneficiary_account_id: null,
    current_item_id: items[stageIdx]?.id ?? null,
    chat_enabled: true,
    slow_mode_seconds: 0,
    voting_open: true,
    overlay: {
      lower_third: true,
      next_up: true,
      bug: true,
      qr: true,
      poll: true,
      alerts: true,
      reactions: true,
      featured_message_id: "preview-msg",
      message: "Jetzt in der Röbel App abstimmen: Wer ist euer Publikumsliebling? · Unterstützt die Übertragung direkt im Livestream",
    },
    updated_at: new Date().toISOString(),
  };

  const featured: LiveChatMessage = {
    id: "preview-msg",
    show_id: "preview",
    display_name: "Lena Schulz",
    avatar_url: null,
    body: "Was für eine Stimmung hier in der Halle! Grüße an alle zu Hause 👋",
    kind: "chat",
    amount_cents: null,
    created_at: new Date().toISOString(),
    hidden_at: null,
    featured_at: new Date().toISOString(),
  };

  const results: LiveResultItem[] = DUMMY_ITEMS.map((it, i) => ({
    item_id: it.id,
    title: it.title,
    votes: [42, 31, 18, 12, 7][i] ?? 0,
  }));

  return (
    <Stage checker>
      <OverlayScene
        show={show}
        items={items}
        overlay={show.overlay}
        featured={featured}
        results={results}
        alert={alerts.current}
        reactions={reactions.list}
        onReactionDone={reactions.remove}
      />
    </Stage>
  );
}
