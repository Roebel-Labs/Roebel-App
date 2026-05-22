import type { Metadata } from "next";

import { Header } from "@/components/layout/Header";
import { UnternehmenHero } from "@/components/unternehmen/UnternehmenHero";
import { UnternehmenLeverage } from "@/components/unternehmen/UnternehmenLeverage";
import { UnternehmenSteps } from "@/components/unternehmen/UnternehmenSteps";
import { UnternehmenSocialProof } from "@/components/unternehmen/UnternehmenSocialProof";
import { UnternehmenRecommend } from "@/components/unternehmen/UnternehmenRecommend";
import { UnternehmenLearnMore } from "@/components/unternehmen/UnternehmenLearnMore";
import { UnternehmenFootnotes } from "@/components/unternehmen/UnternehmenFootnotes";
import { getApprovedBusinesses } from "@/app/actions/businesses";
import type { Business } from "@/types/business";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unternehmen | Röbel",
  description:
    "Alle Vorteile von Röbel, neu gedacht für Unternehmen. Verwalten Sie Mitarbeiterprogramme, Verpflegung und Geschenklösungen — alles auf einem Dashboard.",
};

export default async function UnternehmenPage() {
  const result = await getApprovedBusinesses();
  const featured: Business[] =
    result.success && result.data
      ? result.data
          .filter((b) => b.is_featured && b.logo_url)
          .slice(0, 6)
      : [];

  return (
    <>
      <Header />
      <main
        className="min-w-0"
        style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
      >
        <UnternehmenHero />
        <UnternehmenLeverage />
        <UnternehmenSteps />
        <UnternehmenSocialProof featuredBusinesses={featured} />
        <UnternehmenRecommend />
        <UnternehmenLearnMore />
        <UnternehmenFootnotes />
      </main>
    </>
  );
}
