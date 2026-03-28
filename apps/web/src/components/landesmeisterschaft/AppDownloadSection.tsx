"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Check } from "lucide-react";

const APP_STORE_URL = "https://apps.apple.com/de/app/r%C3%B6bel/id6754984699";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.maxbrych.roebelonchain&hl=de";

const features = [
  "Auf dem laufenden bleiben",
  "Neuigkeiten sofort erhalten",
  "Livestream der Veranstaltung schauen",
];

export function AppDownloadSection() {
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) {
      setPlatform("ios");
    } else if (/Android/i.test(ua)) {
      setPlatform("android");
    }
  }, []);

  const handleDownload = () => {
    const url = platform === "android" ? PLAY_STORE_URL : APP_STORE_URL;
    window.open(url, "_blank");
  };

  return (
    <section className="bg-[#000] py-12 md:py-24">
      <div className="mx-auto max-w-7xl px-6 md:px-12 lg:px-20">
        {/* Section Header */}
        <div className="mb-8 text-center md:mb-12">
          <span className="text-xs font-semibold text-white bg-primary px-2 py-1 rounded-sm md:text-base">
            Röbel App
          </span>
          <h2 className="mt-2 text-3xl font-extrabold text-white md:text-4xl lg:text-5xl">
            Nichts mehr verpassen
          </h2>
        </div>

        {/* Two-Column Card Layout */}
        <div className="mx-auto max-w-5xl overflow-hidden border-2 border-gray-800 border-solid rounded-2xl md:flex">
          {/* Left Card - Dark Blue with Phone Mockups */}
          <div className="relative flex items-center justify-center bg-[#2a4a6d] md:w-1/2 ">
            <Image
              src="/psv/app_preview.webp"
              alt="Röbel App Vorschau"
              width={400}
              height={500}
              className="h-full max-h-[480px] w-full object-cover "
            />
          </div>

          {/* Right Card - White with Content */}
          <div className="flex flex-col justify-center bg-black p-6 md:w-1/2 md:p-10">
            <h3 className="text-xl font-bold text-white md:text-2xl">
              Mit der Röbel App live dabei sein
            </h3>

            <p className="mt-2 text-sm text-gray-400 md:text-base">
              Kostenlos Im App Store erhältlich
            </p>

            {/* Download Button */}
            <button
              onClick={handleDownload}
              className="mt-6 w-full rounded-[10px] border-2 border-gray-900 bg-white py-3 text-sm font-semibold text-gray-900 transition-all hover:bg-gray-100 md:py-4 md:text-base"
            >
              App downloaden
            </button>

            {/* Features List */}
            <ul className="mt-6 space-y-3 md:mt-8">
              {features.map((feature, index) => (
                <li key={index} className="flex items-center gap-3">
                  <Check className="h-4 w-4 flex-shrink-0 text-gray-400 md:h-5 md:w-5" />
                  <span className="text-sm text-gray-400 md:text-base">
                    {feature}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
