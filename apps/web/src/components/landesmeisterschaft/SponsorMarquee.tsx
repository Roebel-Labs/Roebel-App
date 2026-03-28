"use client";

import Image from "next/image";

const sponsors = [
  { name: "Büroservice Roez", logo: "/sponsors/BüroserviceRoez-1 1.png" },
  { name: "DOMAS", logo: "/sponsors/DOMAS-1 1.png" },
  { name: "Holzbau Schwemer", logo: "/sponsors/Holzbau Schwemer-1 1.png" },
  { name: "Malerbetrieb Riese", logo: "/sponsors/Malerbetrieb Riese-1 1.png" },
  { name: "Motorrad MV", logo: "/sponsors/Motorrad MV-1 1.png" },
  { name: "Optik Wolter", logo: "/sponsors/Optik Wolter-1 1.png" },
  { name: "Schlosserei Mahnke", logo: "/sponsors/Schlosserei Mahnke-1 1.png" },
  { name: "WN Umzüge", logo: "/sponsors/Wn Umzüge-1 1.png" },
  { name: "BUB", logo: "/sponsors/bub.png" },
  { name: "Handy", logo: "/sponsors/handy.png" },
  { name: "MP", logo: "/sponsors/mp.png" },
];

export function SponsorMarquee() {
  // Double the sponsors array for seamless loop
  const duplicatedSponsors = [...sponsors, ...sponsors];

  return (
    <section className="bg-[#000] py-6 md:py-8 overflow-hidden">
      <div className="relative">
        {/* Gradient overlays for fade effect */}
        <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-16 bg-gradient-to-r from-[#000] to-transparent md:w-24" />
        <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-16 bg-gradient-to-l from-[#000] to-transparent md:w-24" />

        {/* Scrolling container */}
        <div className="flex animate-marquee">
          {duplicatedSponsors.map((sponsor, index) => (
            <div
              key={`${sponsor.name}-${index}`}
              className="mx-6 flex flex-shrink-0 items-center justify-center md:mx-10"
            >
              <Image
                src={sponsor.logo}
                alt={sponsor.name}
                width={100}
                height={50}
                className="h-12 w-auto object-contain brightness-0 invert opacity-50 md:h-16"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Keyframe animation styles */}
      <style jsx global>{`
        @keyframes marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}</style>
    </section>
  );
}
