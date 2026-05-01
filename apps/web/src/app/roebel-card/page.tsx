import type { Metadata } from "next";

import { getInterestCounts } from "@/app/actions/card-interest";
import { LandingHeader } from "@/components/roebel-card-landing/LandingHeader";
import { LandingFooter } from "@/components/roebel-card-landing/LandingFooter";
import { HeroAndPillsScene } from "@/components/roebel-card-landing/HeroAndPillsScene";
import { Section2Outro } from "@/components/roebel-card-landing/Section2Outro";
import { Section3Steps } from "@/components/roebel-card-landing/Section3Steps";
import { Section4Plans } from "@/components/roebel-card-landing/Section4Plans";
import { Section5AppFlow } from "@/components/roebel-card-landing/Section5AppFlow";
import { Section6Acceptance } from "@/components/roebel-card-landing/Section6Acceptance";
import { Section7LocalImpact } from "@/components/roebel-card-landing/Section7LocalImpact";
import { Section8Moments } from "@/components/roebel-card-landing/Section8Moments";
import { Section9Social } from "@/components/roebel-card-landing/Section9Social";
import { Section10FAQ } from "@/components/roebel-card-landing/Section10FAQ";

export const metadata: Metadata = {
  title: "Röbel Card — Die Karte für lokalen Handel und Vereine",
  description:
    "Die Röbel Card unterstützt mit jedem Einkauf lokale Geschäfte und Vereine in Röbel/Müritz. Kein Monatslimit, keine Aufladegebühr, sicher auf dem Treuhandkonto.",
};

// Fetch counter live; it's cheap (single RPC) and we want fresh numbers.
export const dynamic = "force-dynamic";

export default async function RoebelCardLandingPage() {
  const counts = await getInterestCounts();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <LandingHeader />
      <main className="flex-1">
        <HeroAndPillsScene counts={counts} />
        <Section2Outro />
        <Section3Steps />
        <Section4Plans />
        <Section5AppFlow />
        <Section6Acceptance />
        <Section7LocalImpact />
        <Section8Moments />
        <Section9Social />
        <Section10FAQ />
      </main>
      <LandingFooter />
    </div>
  );
}
