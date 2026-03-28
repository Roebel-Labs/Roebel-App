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

export function SponsorsSection() {
  return (
    <section className="bg-[#000] py-12 md:py-24">
      <div className="mx-auto max-w-7xl px-6 md:px-12 lg:px-20">
        {/* Section Header */}
        <div className="text-center">
          <h2 className="text-2xl font-extrabold text-white md:text-3xl">
            Danke an unsere Sponsoren
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-gray-400 md:mt-4 md:text-sm">
            Diese Veranstaltung wird ermöglicht durch die großzügige
            Unterstützung unserer Partner.
          </p>
        </div>

        {/* Sponsor Logos */}
        <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-3 md:mt-12 md:grid-cols-4 md:gap-8 lg:grid-cols-8">
          {sponsors.map((sponsor) => (
            <div
              key={sponsor.name}
              className="flex items-center justify-center"
            >
              <Image
                src={sponsor.logo}
                alt={sponsor.name}
                width={120}
                height={60}
                className="h-10 w-auto object-contain brightness-0 invert opacity-60 transition-all hover:opacity-100 md:h-16"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
