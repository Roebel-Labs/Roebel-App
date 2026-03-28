"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell } from "lucide-react";
import { TicketDayModal } from "./TicketDayModal";
import { LivestreamCountdown } from "./LivestreamCountdown";
import { LivestreamHero } from "./LivestreamHero";

interface HeroSectionProps {
  onOpenLivestream: () => void;
  livestreamActive?: boolean;
  livestreamUrl?: string;
}

const YOUTUBE_CHANNEL = "https://www.youtube.com/@PSVR%C3%B6belerBoxclub";

export function HeroSection({ onOpenLivestream, livestreamActive, livestreamUrl }: HeroSectionProps) {
  if (livestreamActive && livestreamUrl) {
    return <LivestreamHero url={livestreamUrl} />;
  }
  return (
    <>
      {/* Mobile Layout */}
      <section className="relative flex flex-col bg-[#000] md:hidden">
        {/* Header */}
        <header className="absolute left-0 right-0 top-0 z-20 flex items-center gap-2 px-6 py-6">
          <Link href="/">
            <Image
              src="/logo.png"
              alt="Röbel App"
              width={20}
              height={20}
              className="h-9 w-9 cursor-pointer"
            />
          </Link>
        </header>

        {/* Image Container */}
        <div className="relative h-[45vh] w-full">
          <Image
            src="/psv/mobile-bg.webp"
            alt="Boxer im Ring"
            fill
            className="object-cover object-bottom"
            priority
          />
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#000] to-transparent" />
        </div>

        {/* Glassmorphism Countdown Card – mobile */}
        <div className="mx-6 -mt-4 mb-4 rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md px-5 py-4">
          <p className="text-center text-xs font-medium text-gray-300 mb-3">
            Countdown zum Livestream
          </p>
          <LivestreamCountdown variant="hero" />
          {/* Gradient border button */}
          <div className="mt-4 w-full rounded-xl p-px" style={{ background: "linear-gradient(135deg, #4f7aff 0%, #c8d8ff 40%, #8fa8e8 70%, #4a4a5a 100%)" }}>
            <a
              href={YOUTUBE_CHANNEL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-[11px] bg-black px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-900"
            >
              <Bell className="h-4 w-4" />
              Jetzt folgen
            </a>
          </div>
        </div>

        {/* Content Container */}
        <div className="px-6 pb-8 pt-2 flex flex-col items-center justify-center">
          <div className="mb-4 inline-block rounded-sm text-center justify-center items-center mx-auto bg-white px-2 pb-0.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-black">
              Dieses Wochenende
            </span>
          </div>

          <h1 className="text-xl font-extrabold text-center uppercase leading-tight text-white">
            Boxen Landesmeisterschaft Mecklenburg-Vorpommern
          </h1>

          <p className="mt-3 text-sm text-center text-gray-400">
            Das gesamte Event live online und von überall mitverfolgen und
            mitfiebern.
          </p>

          <div className="mt-4 flex items-baseline gap-1">
            <span className="text-md text-gray-500 line-through">€5.00</span>
            <span className="text-md font-bold text-white">€2.99</span>
            <span className="text-md text-gray-400">/Einmalig</span>
          </div>

          <div className="mt-5 flex flex-col gap-3 px-2">
            <TicketDayModal>
              <button className="inline-flex w-[90vw] max-w-md mx-auto items-center justify-center rounded-[10px] bg-white px-6 py-3 text-base font-semibold text-black transition-all hover:bg-gray-100">
                Ticket kaufen
              </button>
            </TicketDayModal>

            <button
              onClick={onOpenLivestream}
              className="inline-flex items-center justify-center rounded-[10px] bg-gray-800 hover:bg-gray-700 px-6 py-3 text-base font-semibold text-white transition-all"
            >
              Trailer anschauen
            </button>
          </div>
        </div>
      </section>

      {/* Desktop Layout */}
      <section className="relative hidden h-[85vh] bg-[#000] md:block overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0">
          <Image
            src="/psv/desktop-bg.webp"
            alt="Boxer im Ring"
            fill
            className="object-cover object-center"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/5 to-transparent" />
        </div>

        {/* Header */}
        <header className="absolute left-0 right-0 top-0 z-20 mx-auto flex max-w-7xl items-center gap-3 px-12 py-8 lg:px-20">
          <Link href="/">
            <Image
              src="/logo.png"
              alt="Röbel App"
              width={32}
              height={32}
              className="h-9 w-9 cursor-pointer"
            />
          </Link>
        </header>

        {/* Content: text left, countdown right */}
        <div className="relative z-10 mx-auto flex h-full max-w-7xl items-center justify-between px-12 lg:px-20">
          {/* Left: text */}
          <div className="max-w-xl">
            <div className="mb-5 inline-block rounded-sm bg-white px-2 pb-0.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-black">
                Dieses Wochenende
              </span>
            </div>

            <h1 className="text-2xl font-extrabold leading-tight uppercase text-white lg:text-3xl">
              Boxen Landesmeisterschaft Mecklenburg-Vorpommern
            </h1>

            <p className="mt-4 max-w-lg text-base text-gray-300">
              Das gesamte Event live online und von überall mitverfolgen und
              mitfiebern.
            </p>

            <div className="mt-5 flex items-baseline gap-1">
              <span className="text-md text-gray-500 line-through">€5.00</span>
              <span className="text-md font-bold text-white">€2.99</span>
              <span className="text-md text-gray-400">/Einmalig</span>
            </div>

            <div className="mt-6 flex flex-row gap-4">
              <TicketDayModal>
                <button className="inline-flex items-center justify-center rounded-[10px] bg-white px-6 py-3 text-sm font-semibold text-black transition-all hover:bg-gray-100">
                  Ticket kaufen
                </button>
              </TicketDayModal>
              <button
                onClick={onOpenLivestream}
                className="inline-flex items-center justify-center rounded-[10px] bg-gray-800 hover:bg-gray-700 px-6 py-3 text-sm font-semibold text-white transition-all"
              >
                Trailer anschauen
              </button>
            </div>
          </div>

          {/* Right: glassmorphism countdown card */}
          <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md px-8 py-6 min-w-[280px] flex flex-col items-center">
            <p className="text-sm font-medium text-gray-300 mb-4">
              Countdown zum Livestream
            </p>
            <LivestreamCountdown variant="hero" />
            {/* Gradient border button */}
            <div className="mt-6 w-full rounded-xl p-px" style={{ background: "linear-gradient(135deg, #4f7aff 0%, #c8d8ff 40%, #8fa8e8 70%, #4a4a5a 100%)" }}>
              <a
                href={YOUTUBE_CHANNEL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-[11px] bg-black px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-900"
              >
                <Bell className="h-4 w-4" />
                Jetzt folgen
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
