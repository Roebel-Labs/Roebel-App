"use client";

import Image from "next/image";
import Link from "next/link";

interface LivestreamHeroProps {
  url: string;
}

function getYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|live\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

export function LivestreamHero({ url }: LivestreamHeroProps) {
  const videoId = getYouTubeId(url);

  return (
    <section className="relative flex flex-col bg-[#000] min-h-screen">
      {/* Header */}
      <header className="absolute left-0 right-0 top-0 z-20 flex items-center gap-2 px-6 py-6 md:px-12 md:py-8">
        <Link href="/">
          <Image
            src="/logo.png"
            alt="Röbel App"
            width={36}
            height={36}
            className="h-9 w-9 cursor-pointer"
          />
        </Link>
      </header>

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 pt-20 pb-8 md:px-12 md:pt-24">
        {/* Live badge + title */}
        <div className="mb-4 flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            Live
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Dieses Wochenende
          </span>
        </div>

        <h1 className="mb-6 text-center text-lg font-extrabold uppercase leading-tight text-white md:text-2xl">
          Boxen Landesmeisterschaft
          <br />
          Mecklenburg-Vorpommern
        </h1>

        {/* YouTube embed */}
        {videoId ? (
          <div className="w-full max-w-5xl">
            <div className="relative w-full overflow-hidden rounded-2xl border border-white/10" style={{ paddingBottom: "56.25%" }}>
              <iframe
                src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
                title="Boxen Landesmeisterschaft Mecklenburg-Vorpommern Livestream"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            </div>
          </div>
        ) : (
          <div className="flex w-full max-w-5xl items-center justify-center rounded-2xl border border-white/10 bg-gray-900" style={{ aspectRatio: "16/9" }}>
            <p className="text-gray-400">Livestream wird gleich gestartet…</p>
          </div>
        )}

        {/* Subtitle */}
        <p className="mt-4 text-center text-sm text-gray-400">
          Das gesamte Event live online — von überall mitverfolgen und mitfiebern.
        </p>
      </div>
    </section>
  );
}
