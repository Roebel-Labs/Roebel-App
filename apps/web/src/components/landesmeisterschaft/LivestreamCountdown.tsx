"use client";

import { useEffect, useState } from "react";

const EVENT_START = new Date("2026-03-07T12:00:00+01:00");

function getTimeLeft() {
  const diff = EVENT_START.getTime() - Date.now();
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  return { h, m, s };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

interface LivestreamCountdownProps {
  variant: "hero" | "banner";
}

export function LivestreamCountdown({ variant }: LivestreamCountdownProps) {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft);

  useEffect(() => {
    const id = setInterval(() => setTimeLeft(getTimeLeft()), 1_000);
    return () => clearInterval(id);
  }, []);

  if (variant === "banner") {
    if (!timeLeft) {
      return (
        <span className="text-xs font-semibold text-white uppercase tracking-wide">
          Livestream läuft!
        </span>
      );
    }
    return (
      <div className="flex items-baseline gap-1 text-white">
        <div className="text-center">
          <span className="text-xl font-bold tabular-nums leading-none">{pad(timeLeft.h)}</span>
          <p className="text-[9px] text-gray-400 mt-0.5">Std</p>
        </div>
        <span className="text-lg font-bold pb-3">:</span>
        <div className="text-center">
          <span className="text-xl font-bold tabular-nums leading-none">{pad(timeLeft.m)}</span>
          <p className="text-[9px] text-gray-400 mt-0.5">Min</p>
        </div>
        <span className="text-lg font-bold pb-3">:</span>
        <div className="text-center">
          <span className="text-xl font-bold tabular-nums leading-none">{pad(timeLeft.s)}</span>
          <p className="text-[9px] text-gray-400 mt-0.5">Sek</p>
        </div>
      </div>
    );
  }

  // hero variant
  if (!timeLeft) {
    return (
      <p className="text-center text-lg font-semibold text-white py-4">
        Livestream läuft! 🎥
      </p>
    );
  }

  return (
    <div className="flex items-end justify-center gap-2">
      <div className="text-center">
        <span className="text-5xl font-bold tabular-nums text-white leading-none">
          {pad(timeLeft.h)}
        </span>
        <p className="mt-1 text-xs text-gray-300">Std</p>
      </div>
      <span className="text-4xl font-bold text-white pb-5">:</span>
      <div className="text-center">
        <span className="text-5xl font-bold tabular-nums text-white leading-none">
          {pad(timeLeft.m)}
        </span>
        <p className="mt-1 text-xs text-gray-300">Min</p>
      </div>
      <span className="text-4xl font-bold text-white pb-5">:</span>
      <div className="text-center">
        <span className="text-5xl font-bold tabular-nums text-white leading-none">
          {pad(timeLeft.s)}
        </span>
        <p className="mt-1 text-xs text-gray-300">Sek</p>
      </div>
    </div>
  );
}
