"use client";

import { useState } from "react";
import { HeroSection } from "./HeroSection";
import { SponsorMarquee } from "./SponsorMarquee";
import { TicketSection } from "./TicketSection";
import { LivestreamSection } from "./LivestreamSection";
import { NewsSection } from "./NewsSection";
import { AppDownloadSection } from "./AppDownloadSection";
import { SponsorsSection } from "./SponsorsSection";
import { LandingFooter } from "./LandingFooter";
import { FAQSection } from "./FAQSection";
import { VideoOverlay } from "./VideoOverlay";

interface LMPageClientProps {
  livestreamActive: boolean;
  livestreamUrl: string;
  trailerUrl: string;
}

export function LMPageClient({
  livestreamActive,
  livestreamUrl,
  trailerUrl,
}: LMPageClientProps) {
  const [isVideoOpen, setIsVideoOpen] = useState(false);

  return (
    <main className="min-h-screen">
      <HeroSection
        onOpenLivestream={() => setIsVideoOpen(true)}
        livestreamActive={livestreamActive}
        livestreamUrl={livestreamUrl}
      />
      <SponsorMarquee />
      <TicketSection />
      <LivestreamSection onOpenLivestream={() => setIsVideoOpen(true)} />
      <NewsSection />
      <AppDownloadSection />
      <SponsorsSection />
      <FAQSection />
      <LandingFooter />

      <VideoOverlay
        isOpen={isVideoOpen}
        onClose={() => setIsVideoOpen(false)}
        videoUrl={trailerUrl}
      />
    </main>
  );
}
