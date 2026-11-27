import React from 'react';
import { useRouter } from 'expo-router';
import { DANCECUP_SLUG } from '@/lib/sponsoring';
import { useChristmasSeason } from '@/lib/christmas';
import SponsoringBanner, { useSponsoringOpen } from '@/components/profile/SponsoringBanner';
import BadgesBanner from '@/components/profile/BadgesBanner';
import AgentHelperBanner from '@/components/profile/AgentHelperBanner';
import SupportBanner from '@/components/christmas/SupportBanner';
import BannerCarousel, { type BannerSlide } from '@/components/profile/BannerCarousel';

/**
 * Banners on an organisation's profile, as a paged carousel. In the Christmas season "Röbel App
 * unterstützen" leads; then "KI Helfer" (→ Chat tab), "Abzeichen erstellen" is always there; the
 * sponsoring campaign joins while its booking is open.
 */
export default function OrgProfileBanners() {
  const router = useRouter();
  const sponsoringOpen = useSponsoringOpen(DANCECUP_SLUG);
  const christmas = useChristmasSeason();

  const slides: BannerSlide[] = [];
  if (christmas) slides.push({ key: 'support', node: <SupportBanner /> });
  slides.push({ key: 'agents', node: <AgentHelperBanner /> });
  slides.push({
    key: 'badges',
    node: (
      <BadgesBanner
        eyebrow="Für eure Organisation"
        title="Abzeichen erstellen"
        onPress={() => router.push('/badges/create' as any)}
      />
    ),
  });
  if (sponsoringOpen) slides.push({ key: 'sponsoring', node: <SponsoringBanner slug={DANCECUP_SLUG} /> });

  return <BannerCarousel slides={slides} />;
}
