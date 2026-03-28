"use client";

import Link from "next/link";
import { LivestreamCountdown } from "@/components/landesmeisterschaft/LivestreamCountdown";

export function LMBanner() {
  return (
    <div className="relative w-full bg-[#000] overflow-hidden px-4 py-8 md:px-12 md:py-10">
      {/* Blue gradient glow — right side behind countdown (inline styles to guarantee rendering) */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2/3 pointer-events-none"
        style={{ background: "linear-gradient(to left, rgba(30,58,138,0.55) 0%, rgba(30,64,175,0.25) 40%, transparent 100%)" }}
      />
      <div
        className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
        style={{
          right: "22%",
          width: "280px",
          height: "280px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(37,99,235,0.45) 0%, rgba(29,78,216,0.2) 40%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      <div className="relative mx-auto flex max-w-7xl items-center gap-4 md:gap-6">
        {/* Left/center: badge + title + button (all centered) */}
        <div className="flex-1 flex flex-col items-center text-center gap-2">
          <span className="inline-block w-fit rounded-full border border-white/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Dieses Wochenende
          </span>
          <p className="text-sm font-bold uppercase leading-tight text-white md:text-base">
            Boxen Landesmeisterschat
            <br />
            Mecklenburg Vorpommern
          </p>
          <Link
            href="/landesmeisterschaft"
            className="mt-1 inline-flex items-center justify-center rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-gray-100"
          >
            Zum Countdown
          </Link>
        </div>

        {/* Right: glassmorphism countdown card (dark) */}
        <div className="shrink-0 rounded-2xl border border-white/15 backdrop-blur-md px-5 py-3 flex flex-col items-center" style={{ background: "rgba(0,0,0,0.5)" }}>
          <p className="mb-1.5 text-center text-[9px] font-medium uppercase tracking-wide text-gray-500">
            Countdown
          </p>
          <LivestreamCountdown variant="banner" />
        </div>
      </div>
    </div>
  );
}
