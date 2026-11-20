"use client";

import { useRef } from "react";
import Image from "next/image";
import { isHlsUrl, useHlsVideo } from "@/hooks/useHlsVideo";
import { useLiveShow } from "./use-live-show";
import { RoebelMark } from "./roebel-mark";
import { currentItem, nextItem, formatClock } from "./types";

// Canonical store URLs (same as GlobalAppDownloadSheet / apps/expo/constants/app-store.ts).
const APP_STORE_URL = "https://apps.apple.com/de/app/r%C3%B6bel/id6754984699";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.maxbrych.roebelonchain&hl=de";

/** QR target of the on-air bug: open in the app, or watch here as a fallback. */
export function LiveLanding({ slug, initialTitle }: { slug: string; initialTitle: string | null }) {
  const { show, items, loading, error } = useLiveShow({ slug }, { pollMs: 30_000 });
  const title = show?.title ?? initialTitle ?? "Livestream";
  const playUrl = show?.status === "ended" ? show.replay_url ?? show.hls_url : show?.hls_url;
  const cur = currentItem(show, items);
  const next = nextItem(show, items);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-8">
        <div className="flex items-center gap-3">
          <RoebelMark size={44} />
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#00498B] dark:text-[#7ABBF2]">
              {show?.status === "live" && <span className="h-2 w-2 rounded-full bg-red-600" />}
              {show?.status === "live" ? "Jetzt live" : show?.status === "ended" ? "Aufzeichnung" : "Livestream"}
            </div>
            <h1 className="text-2xl text-foreground">{title}</h1>
            {show?.subtitle && <p className="text-sm text-muted-foreground">{show.subtitle}</p>}
          </div>
        </div>

        <section className="rounded-2xl bg-[#00498B] p-6 text-white">
          <h2 className="text-xl">Schau live in der Röbel App</h2>
          <p className="mt-1 text-sm text-white/80">
            Mit Chat, Reaktionen, Publikumsliebling-Meinungsbild und Erinnerung, bevor deine Gruppe auf die Fläche kommt.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              href={`roebel://live/${slug}`}
              className="inline-flex h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-[#00498B]"
            >
              In der App öffnen
            </a>
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
              <Image
                src="/Download_on_the_App_Store_Badge_DK_RGB_blk_100217.svg"
                alt="Im App Store laden"
                width={132}
                height={44}
                className="h-11 w-auto"
              />
            </a>
            <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">
              <Image
                src="/GetItOnGooglePlay_Badge_Web_color_German.png"
                alt="Jetzt bei Google Play"
                width={148}
                height={44}
                className="h-11 w-auto"
              />
            </a>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg text-foreground">Oder hier im Browser</h2>
          {playUrl ? (
            <LivePlayer key={playUrl} url={playUrl} poster={show?.poster_url ?? null} />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
              {loading
                ? "Lädt …"
                : error === "not_found"
                  ? "Diese Übertragung gibt es nicht."
                  : show?.starts_at
                    ? `Gleich geht's los – Beginn ${formatClock(show.starts_at)} Uhr.`
                    : "Gleich geht's los."}
            </div>
          )}
          {show?.status === "scheduled" && playUrl && (
            <p className="text-xs text-muted-foreground">
              Der Stream startet{show.starts_at ? ` um ${formatClock(show.starts_at)} Uhr` : " gleich"}. Lade die Seite neu, falls das Bild schwarz bleibt.
            </p>
          )}
        </section>

        {(cur || next) && (
          <section className="grid gap-3 sm:grid-cols-2">
            {cur && (
              <div className="rounded-xl border border-border p-4">
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Jetzt auf der Fläche</div>
                <div className="mt-1 font-semibold text-foreground">{cur.title}</div>
                {cur.subtitle && <div className="text-sm text-muted-foreground">{cur.subtitle}</div>}
              </div>
            )}
            {next && (
              <div className="rounded-xl border border-border p-4">
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Als Nächstes</div>
                <div className="mt-1 font-semibold text-foreground">{next.title}</div>
                {next.subtitle && <div className="text-sm text-muted-foreground">{next.subtitle}</div>}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function LivePlayer({ url, poster }: { url: string; poster: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useHlsVideo(ref, url);
  return (
    <video
      ref={ref}
      src={isHlsUrl(url) ? undefined : url}
      className="aspect-video w-full rounded-xl bg-black"
      poster={poster ?? undefined}
      controls
      playsInline
      autoPlay
      muted
    />
  );
}
