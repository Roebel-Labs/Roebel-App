"use client";

import Image from "next/image";
import { Smartphone, Tv, CheckCircle2 } from "lucide-react";

interface LivestreamSectionProps {
  onOpenLivestream: () => void;
}

export function LivestreamSection({ onOpenLivestream }: LivestreamSectionProps) {
  return (
    <section className="bg-[#000] py-12 md:py-24">
      <div className="mx-auto max-w-7xl px-6 md:px-12 lg:px-20">
        {/* Section Header */}
        <div className="text-center">
          <h2 className="text-2xl font-extrabold text-white md:text-3xl lg:text-4xl">
            Livestream schauen
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-gray-400 md:text-base">
            Das gesamte Event live online und von überall mitverfolgen und
            mitfiebern.
          </p>
        </div>

        <div className="mt-12 grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left - Device Mockup */}
          <div className="relative flex justify-center">
            <div className="relative aspect-video w-full max-w-lg overflow-hidden rounded-2xl bg-gray-800 shadow-2xl">
              <Image
                src="/psv/trailer_thumbnail.png"
                alt="Trailer Vorschau"
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <span className="rounded-lg bg-black/60 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm md:px-6 md:py-3 md:text-base">
                  Demnächst verfügbar
                </span>
              </div>
            </div>
          </div>

          {/* Right - Content */}
          <div>
            <div className="space-y-5 md:space-y-6">
              {/* Option 1 */}
              <div>
                <div className="flex items-center gap-2 md:gap-3">
                  <Smartphone className="h-5 w-5 flex-shrink-0 text-white md:h-6 md:w-6" />
                  <h3 className="text-base font-semibold text-white md:text-lg">
                    Am Handy streamen
                  </h3>
                </div>
                <p className="mt-1.5 text-sm text-gray-400 md:mt-2 md:text-base">
                  Das gesamte Event live online und von überall mitverfolgen
                  und mitfiebern.
                </p>
              </div>

              {/* Option 2 */}
              <div>
                <div className="flex items-center gap-2 md:gap-3">
                  <Tv className="h-5 w-5 flex-shrink-0 text-white md:h-6 md:w-6" />
                  <h3 className="text-base font-semibold text-white md:text-lg">
                    Am SmartTV streamen
                  </h3>
                </div>
                <p className="mt-1.5 text-sm text-gray-400 md:mt-2 md:text-base">
                  Das gesamte Event live online und von überall mitverfolgen
                  und mitfiebern.
                </p>
              </div>
            </div>

            {/* Features Checklist */}
            <ul className="mt-6 space-y-2.5 md:mt-8 md:space-y-3">
              <li className="flex items-center gap-2.5 md:gap-3">
                <CheckCircle2 className="h-4 w-4 text-blue-500 md:h-5 md:w-5" />
                <span className="text-sm text-gray-300 md:text-base">HD-Qualität auf allen Geräten</span>
              </li>
              <li className="flex items-center gap-2.5 md:gap-3">
                <CheckCircle2 className="h-4 w-4 text-blue-500 md:h-5 md:w-5" />
                <span className="text-sm text-gray-300 md:text-base">Professionelle Kommentierung</span>
              </li>
              <li className="flex items-center gap-2.5 md:gap-3">
                <CheckCircle2 className="h-4 w-4 text-blue-500 md:h-5 md:w-5" />
                <span className="text-sm text-gray-300 md:text-base">Alle Kämpfe ohne Unterbrechung</span>
              </li>
            </ul>

            <button
              onClick={onOpenLivestream}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-black transition-all hover:bg-gray-100 md:mt-6 md:px-6 md:py-3 md:text-base"
            >
              Trailer anschauen
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
