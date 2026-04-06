// Uses cookies() via getBusinessLandingStats — cannot be statically rendered
export const dynamic = "force-dynamic";

import { EventsHeader } from "@/components/events/events-header"
import { BusinessLandingHero } from "@/components/business/landing/BusinessLandingHero"
import { BusinessLandingBenefits } from "@/components/business/landing/BusinessLandingBenefits"
import { BusinessLandingSteps } from "@/components/business/landing/BusinessLandingSteps"
import { BusinessLandingAds } from "@/components/business/landing/BusinessLandingAds"
import { BusinessLandingFAQ } from "@/components/business/landing/BusinessLandingFAQ"
import { BusinessLandingCTA } from "@/components/business/landing/BusinessLandingCTA"
import { getBusinessLandingStats } from "@/app/actions/business-stats"

export default async function BusinessLandingPage() {
  const statsResult = await getBusinessLandingStats()
  const stats = statsResult.data || { businessCount: 0, activeDealsCount: 0, userCount: 0 }

  return (
    <>
      <EventsHeader />
      <main>
        <BusinessLandingHero
          businessCount={stats.businessCount}
          activeDealsCount={stats.activeDealsCount}
          userCount={stats.userCount}
        />
        <BusinessLandingBenefits />
        <BusinessLandingSteps />
        <BusinessLandingAds />
        <BusinessLandingFAQ />
        <BusinessLandingCTA />
      </main>
    </>
  )
}
