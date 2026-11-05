"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { RoebelMark } from "../roebel-mark";
import {
  formatEuro,
  initials,
  type LiveChatMessage,
  type LiveResultItem,
  type LiveRundownItem,
} from "../types";

const NAVY = "#00498B";
const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const EASE_IN = [0.7, 0, 0.84, 0] as const;

/* ------------------------------------------------------------------ */
/* Lower third + "Als Nächstes" (stacked bottom-left)                 */
/* ------------------------------------------------------------------ */

export function LowerThird({ item }: { item: LiveRundownItem }) {
  return (
    <motion.div
      layout
      className="relative"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -40, transition: { duration: 0.45, ease: EASE_IN } }}
    >
      <motion.div
        className="inline-flex items-center gap-3 rounded-t-[10px] bg-white px-5 py-2 text-[20px] font-bold uppercase tracking-[0.14em]"
        style={{ color: NAVY }}
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1, transition: { delay: 0.35, duration: 0.5, ease: EASE_OUT } }}
      >
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600" />
        </span>
        Jetzt auf der Fläche
      </motion.div>
      <motion.div
        className="relative overflow-hidden rounded-[10px] rounded-tl-none shadow-[0_18px_50px_rgba(0,0,0,0.35)]"
        style={{ backgroundColor: NAVY }}
        initial={{ clipPath: "inset(0 100% 0 0)" }}
        animate={{ clipPath: "inset(0 0% 0 0)", transition: { duration: 0.7, ease: EASE_OUT } }}
      >
        <div className="absolute inset-y-0 left-0 w-2 bg-white" />
        <div className="max-w-[1000px] py-6 pl-10 pr-14">
          <motion.div
            className="font-heading text-[60px] font-bold leading-[1.02] text-white"
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1, transition: { delay: 0.25, duration: 0.6, ease: EASE_OUT } }}
          >
            {item.title}
          </motion.div>
          {item.subtitle && (
            <motion.div
              className="mt-2 text-[30px] font-medium leading-tight text-white/85"
              initial={{ x: -30, opacity: 0 }}
              animate={{ x: 0, opacity: 1, transition: { delay: 0.38, duration: 0.6, ease: EASE_OUT } }}
            >
              {item.subtitle}
            </motion.div>
          )}
        </div>
        {item.detail && (
          <motion.div
            className="bg-white px-10 py-3 text-[24px] font-semibold"
            style={{ color: NAVY }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.55, duration: 0.5 } }}
          >
            {item.detail}
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}

export function NextUpChip({ item }: { item: LiveRundownItem }) {
  return (
    <motion.div
      layout
      className="inline-flex max-w-[1000px] items-center overflow-hidden rounded-full bg-white shadow-[0_12px_32px_rgba(0,0,0,0.3)]"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_OUT } }}
      exit={{ opacity: 0, y: 12, transition: { duration: 0.35, ease: EASE_IN } }}
    >
      <span
        className="px-5 py-3 text-[18px] font-bold uppercase tracking-[0.14em] text-white"
        style={{ backgroundColor: NAVY }}
      >
        Als Nächstes
      </span>
      <span className="truncate px-5 py-3 text-[24px] font-semibold" style={{ color: NAVY }}>
        {item.title}
        {item.subtitle ? <span className="font-normal text-[#4B5563]"> · {item.subtitle}</span> : null}
      </span>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Logo bug + QR (top-right)                                          */
/* ------------------------------------------------------------------ */

export function LogoBug({ showQr, qrUrl, live }: { showQr: boolean; qrUrl: string; live: boolean }) {
  return (
    <motion.div
      className="flex flex-col items-end gap-4"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0, transition: { duration: 0.6, ease: EASE_OUT } }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.4, ease: EASE_IN } }}
    >
      <div
        className="flex items-center gap-4 rounded-full py-2 pl-2 pr-7 shadow-[0_12px_32px_rgba(0,0,0,0.3)]"
        style={{ backgroundColor: "rgba(0,73,139,0.92)" }}
      >
        <RoebelMark size={64} />
        <div className="leading-tight text-white">
          <div className="flex items-center gap-2 text-[18px] font-bold uppercase tracking-[0.16em]">
            {live && <span className="h-2.5 w-2.5 rounded-full bg-red-500" />}
            Live
          </div>
          <div className="text-[22px] font-semibold">in der Röbel App</div>
        </div>
      </div>
      <AnimatePresence>
        {showQr && (
          <motion.div
            className="flex flex-col items-center gap-2 rounded-[16px] bg-white p-4 shadow-[0_12px_32px_rgba(0,0,0,0.3)]"
            initial={{ opacity: 0, scale: 0.85, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT } }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.3, ease: EASE_IN } }}
            style={{ transformOrigin: "top right" }}
          >
            <QRCodeSVG value={qrUrl} size={176} fgColor={NAVY} level="M" />
            <div className="text-center text-[17px] font-bold leading-tight" style={{ color: NAVY }}>
              Mitmachen:
              <br />
              Scannen &amp; abstimmen
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Support alert (top-center)                                         */
/* ------------------------------------------------------------------ */

export interface SupportAlertData {
  id: string;
  name: string;
  amountCents: number | null;
  message: string | null;
}

export const SUPPORT_ALERT_MS = 6000;

export function SupportAlert({ alert }: { alert: SupportAlertData }) {
  return (
    <motion.div
      className="relative w-[860px] overflow-hidden rounded-[22px] text-white shadow-[0_24px_70px_rgba(0,0,0,0.45)]"
      style={{ background: `linear-gradient(120deg, ${NAVY} 0%, #0B5FAE 55%, #1C76C9 100%)` }}
      initial={{ opacity: 0, y: -60, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 260, damping: 22 } }}
      exit={{ opacity: 0, y: -40, scale: 0.96, transition: { duration: 0.45, ease: EASE_IN } }}
    >
      {/* light sweep */}
      <motion.div
        className="pointer-events-none absolute inset-y-0 w-[40%]"
        style={{ background: "linear-gradient(100deg, transparent, rgba(255,255,255,0.22), transparent)" }}
        initial={{ x: "-120%" }}
        animate={{ x: "320%", transition: { delay: 0.35, duration: 1.2, ease: "easeInOut" } }}
      />
      <div className="flex items-center gap-6 px-8 py-6">
        <motion.div
          className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-full bg-white text-[48px]"
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0, transition: { delay: 0.15, type: "spring", stiffness: 320, damping: 14 } }}
        >
          💙
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="text-[18px] font-bold uppercase tracking-[0.16em] text-white/75">Danke!</div>
          <div className="font-heading text-[40px] font-bold leading-tight">
            {alert.name} <span className="font-medium text-white/85">unterstützt die Übertragung</span>
          </div>
          {alert.message && (
            <div className="mt-2 line-clamp-2 text-[26px] font-medium italic text-white/90">„{alert.message}“</div>
          )}
        </div>
        {alert.amountCents ? (
          <motion.div
            className="shrink-0 rounded-full bg-white px-6 py-3 font-heading text-[40px] font-bold"
            style={{ color: NAVY }}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, transition: { delay: 0.3, type: "spring", stiffness: 300, damping: 16 } }}
          >
            {formatEuro(alert.amountCents)}
          </motion.div>
        ) : null}
      </div>
      <motion.div
        className="h-1.5 origin-left bg-white/80"
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0, transition: { duration: SUPPORT_ALERT_MS / 1000, ease: "linear" } }}
      />
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Featured chat message (right)                                      */
/* ------------------------------------------------------------------ */

export function FeaturedMessage({ message }: { message: LiveChatMessage }) {
  const name = message.display_name?.trim() || "Jemand";
  return (
    <motion.div
      className="w-[600px] overflow-hidden rounded-[18px] bg-white shadow-[0_18px_50px_rgba(0,0,0,0.35)]"
      initial={{ opacity: 0, x: 80 }}
      animate={{ opacity: 1, x: 0, transition: { duration: 0.6, ease: EASE_OUT } }}
      exit={{ opacity: 0, x: 80, transition: { duration: 0.4, ease: EASE_IN } }}
    >
      <div
        className="px-6 py-2 text-[16px] font-bold uppercase tracking-[0.16em] text-white"
        style={{ backgroundColor: NAVY }}
      >
        Aus dem Chat
      </div>
      <div className="flex gap-4 p-6">
        <Avatar url={message.avatar_url} name={name} />
        <div className="min-w-0 flex-1">
          <div className="text-[24px] font-bold" style={{ color: NAVY }}>
            {name}
          </div>
          <div className="mt-1 line-clamp-4 text-[28px] font-medium leading-snug text-[#111827]">{message.body}</div>
        </div>
      </div>
    </motion.div>
  );
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        onError={() => setFailed(true)}
        className="h-[64px] w-[64px] shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div
      className="flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-full text-[24px] font-bold text-white"
      style={{ backgroundColor: NAVY }}
    >
      {initials(name)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Free-text banner / ticker (bottom band)                            */
/* ------------------------------------------------------------------ */

export function MessageBanner({ text }: { text: string }) {
  const scroll = text.length > 70;
  return (
    <motion.div
      className="flex h-[64px] w-full items-center overflow-hidden text-white"
      style={{ backgroundColor: "rgba(0,73,139,0.95)" }}
      initial={{ y: 70 }}
      animate={{ y: 0, transition: { duration: 0.5, ease: EASE_OUT } }}
      exit={{ y: 70, transition: { duration: 0.35, ease: EASE_IN } }}
    >
      <div
        className="z-10 flex h-full shrink-0 items-center bg-white px-8 text-[20px] font-bold uppercase tracking-[0.16em]"
        style={{ color: NAVY }}
      >
        Röbel App
      </div>
      <div className="relative h-full flex-1 overflow-hidden">
        {scroll ? (
          <div
            className="absolute top-0 flex h-full items-center whitespace-nowrap text-[28px] font-semibold"
            style={{ animation: `live-ticker ${Math.max(14, text.length * 0.22)}s linear infinite` }}
          >
            <span className="px-16">{text}</span>
            <span className="px-16">{text}</span>
          </div>
        ) : (
          <motion.div
            key={text}
            className="flex h-full items-center px-8 text-[28px] font-semibold"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.4 } }}
          >
            {text}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Poll results (left)                                                */
/* ------------------------------------------------------------------ */

export function PollResults({ items }: { items: LiveResultItem[] }) {
  const top = [...items].sort((a, b) => b.votes - a.votes).slice(0, 5);
  const total = items.reduce((s, i) => s + i.votes, 0);
  const max = Math.max(1, ...top.map((i) => i.votes));
  return (
    <motion.div
      className="w-[660px] overflow-hidden rounded-[20px] shadow-[0_18px_50px_rgba(0,0,0,0.35)]"
      style={{ backgroundColor: "rgba(0,73,139,0.94)" }}
      initial={{ opacity: 0, x: -60 }}
      animate={{ opacity: 1, x: 0, transition: { duration: 0.6, ease: EASE_OUT } }}
      exit={{ opacity: 0, x: -60, transition: { duration: 0.4, ease: EASE_IN } }}
    >
      <div className="px-8 pb-4 pt-6 text-white">
        <div className="font-heading text-[38px] font-bold leading-none">Publikumsliebling</div>
        <div className="mt-2 text-[18px] font-semibold uppercase tracking-[0.14em] text-white/70">
          Meinungsbild · {total} {total === 1 ? "Stimme" : "Stimmen"}
        </div>
      </div>
      <div className="flex flex-col gap-3 px-8 pb-7">
        {top.length === 0 && (
          <div className="py-4 text-[22px] font-medium text-white/80">Jetzt in der Röbel App abstimmen!</div>
        )}
        {top.map((it, idx) => {
          const pct = total ? Math.round((it.votes / total) * 100) : 0;
          return (
            <motion.div key={it.item_id} layout transition={{ duration: 0.5, ease: EASE_OUT }} className="relative">
              <div className="relative h-[58px] overflow-hidden rounded-[12px] bg-white/12">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-[12px]"
                  style={{ backgroundColor: idx === 0 ? "rgba(255,255,255,0.42)" : "rgba(255,255,255,0.26)" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(4, (it.votes / max) * 100)}%` }}
                  transition={{ duration: 0.9, ease: EASE_OUT }}
                />
                <div className="relative flex h-full items-center gap-4 px-4">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[20px] font-bold"
                    style={{ color: NAVY }}
                  >
                    {idx + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[24px] font-bold">
                    {it.title}
                  </span>
                  <span className="shrink-0 text-[24px] font-bold tabular-nums">
                    {pct}%
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Floating reactions (right edge)                                    */
/* ------------------------------------------------------------------ */

export interface FloatingReaction {
  id: number;
  emoji: string;
  x: number; // px offset from the right edge lane
  drift: number;
  duration: number;
  size: number;
}

export function ReactionLayer({ reactions, onDone }: { reactions: FloatingReaction[]; onDone: (id: number) => void }) {
  return (
    <div className="pointer-events-none absolute bottom-[120px] right-[40px] h-[640px] w-[220px]">
      {reactions.map((r) => (
          <motion.div
            key={r.id}
            className="absolute bottom-0"
            style={{ right: r.x, fontSize: r.size, lineHeight: 1 }}
            initial={{ y: 0, opacity: 0, scale: 0.4 }}
            animate={{
              y: -600,
              x: [0, r.drift, -r.drift / 2, r.drift / 3],
              opacity: [0, 1, 1, 0],
              scale: [0.4, 1.1, 1, 0.9],
            }}
            transition={{ duration: r.duration, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}
            onAnimationComplete={() => onDone(r.id)}
          >
            <span style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.35))" }}>{r.emoji}</span>
          </motion.div>
      ))}
    </div>
  );
}

/** Scales the fixed 1920×1080 stage down when previewed in a smaller browser window. */
export function useStageScale(): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => setScale(Math.min(1, window.innerWidth / 1920, window.innerHeight / 1080));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return scale;
}
