"use client";

import { useRef } from "react";
import Image from "next/image";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";

import { CardArt } from "./CardArt";
import { InterestCTAButtons } from "./InterestCTAButtons";
import { SocialProofCounter } from "./SocialProofCounter";
import type { InterestCounts } from "@/app/actions/card-interest";

interface HeroAndPillsSceneProps {
  counts: InterestCounts;
}

const PILLS: { label: string; corner: "tl" | "tr" | "bl" | "br" }[] = [
  { label: "Digital einlösbar", corner: "tl" },
  { label: "Lokalen Handel und Vereine unterstützen", corner: "tr" },
  { label: "Jederzeit rückerstattbar", corner: "bl" },
  { label: "Sofort verfügbar", corner: "br" },
];

const PILL_RANGES: Record<number, [number, number]> = {
  0: [0.32, 0.42],
  1: [0.42, 0.52],
  2: [0.52, 0.62],
  3: [0.62, 0.72],
};

const CORNER_CLASSES: Record<"tl" | "tr" | "bl" | "br", string> = {
  tl: "absolute -top-3 -left-2 sm:-top-4 sm:-left-12 md:-left-24 lg:-left-32",
  tr: "absolute -top-3 -right-2 sm:-top-4 sm:-right-10 md:-right-20 lg:-right-28",
  bl: "absolute -bottom-3 -left-2 sm:-bottom-4 sm:-left-10 md:-left-20 lg:-left-28",
  br: "absolute -bottom-3 -right-2 sm:-bottom-4 sm:-right-12 md:-right-24 lg:-right-32",
};

export function HeroAndPillsScene({ counts }: HeroAndPillsSceneProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: wrapperRef,
    offset: ["start start", "end end"],
  });

  // Card transform across the sticky scroll.
  const cardY = useTransform(scrollYProgress, [0, 0.25, 0.55, 1], ["0%", "8%", "10%", "10%"]);
  const cardRotateX = useTransform(
    scrollYProgress,
    [0, 0.2, 0.55, 1],
    [0, -14, 0, 0],
  );
  const cardRotateY = useTransform(scrollYProgress, [0, 0.2, 0.55, 1], [0, 10, 0, 0]);
  const cardScale = useTransform(
    scrollYProgress,
    [0, 0.25, 0.55, 1],
    [1, 0.96, 0.92, 0.92],
  );

  return (
    <div
      ref={wrapperRef}
      className="relative"
      style={{ height: prefersReducedMotion ? "auto" : "260vh" }}
    >
      <div className="sticky top-0 flex min-h-screen flex-col items-center justify-start overflow-hidden pt-20 sm:pt-24 lg:pt-28">
        {/* Soft glow backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/3 -z-10 mx-auto h-[60vh] max-w-3xl"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(121,159,220,0.35) 0%, rgba(121,159,220,0.10) 35%, transparent 70%)",
          }}
        />

        <div className="container mx-auto flex flex-col items-center px-4 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
            <Image
              src="/logo.png"
              alt=""
              width={16}
              height={16}
              className="h-4 w-4 object-contain"
            />
            Funktioniert vor Ort mit der Röbel App
          </div>

          <h1 className="mt-5 max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-6xl">
            Die Karte, um lokalen Handel und Vereine zu unterstützen.
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
            Erstellen und laden Sie Ihre Röbel Card einfach in der App oder bei
            lokalen Partner-Geschäften auf — und unterstützen Sie mit jedem Kauf
            Geschäfte und Vereine.
          </p>

          <div className="mt-8 w-full max-w-xl">
            <InterestCTAButtons withArrow />
          </div>

          <div className="mt-5 min-h-[2.25rem]">
            <SocialProofCounter counts={counts} />
          </div>

          {/* Card stage */}
          <div
            className="relative mt-10 w-full max-w-md sm:max-w-lg lg:max-w-xl"
            style={{ perspective: "1400px" }}
          >
            <motion.div
              className="relative w-full"
              style={
                prefersReducedMotion
                  ? undefined
                  : {
                      y: cardY,
                      rotateX: cardRotateX,
                      rotateY: cardRotateY,
                      scale: cardScale,
                      transformStyle: "preserve-3d",
                    }
              }
            >
              <CardArt />

              {PILLS.map((pill, index) => (
                <Pill
                  key={pill.label}
                  index={index}
                  corner={pill.corner}
                  label={pill.label}
                  scrollYProgress={scrollYProgress}
                  reduced={!!prefersReducedMotion}
                />
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PillProps {
  index: number;
  corner: "tl" | "tr" | "bl" | "br";
  label: string;
  scrollYProgress: ReturnType<typeof useScroll>["scrollYProgress"];
  reduced: boolean;
}

function Pill({ index, corner, label, scrollYProgress, reduced }: PillProps) {
  const range = PILL_RANGES[index];
  const opacity = useTransform(scrollYProgress, range, [0, 1]);
  const translateY = useTransform(scrollYProgress, range, [12, 0]);
  const scale = useTransform(scrollYProgress, range, [0.92, 1]);

  return (
    <motion.div
      className={CORNER_CLASSES[corner]}
      style={
        reduced
          ? undefined
          : {
              opacity,
              y: translateY,
              scale,
            }
      }
    >
      <span className="inline-flex max-w-[180px] items-center rounded-full border border-border bg-card/95 px-3 py-1.5 text-[11px] font-medium text-foreground shadow-md backdrop-blur sm:max-w-[220px] sm:text-xs">
        {label}
      </span>
    </motion.div>
  );
}
