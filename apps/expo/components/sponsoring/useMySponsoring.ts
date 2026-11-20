import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount } from '@/context/AccountContext';
import {
  fetchCampaign, fetchLogoColor, fetchSupporters, isCustomSpot,
  type CampaignView, type SponsoringPackage, type Supporter,
} from '@/lib/sponsoring';

/**
 * What the active org bought in a sponsoring campaign, from public data only (paid bookings are
 * public: they air), so the success and status screens load without a signature.
 */
export function useMySponsoring(slug: string | undefined) {
  const { activeAccount } = useAccount();
  const isOrg = activeAccount?.account_type === 'organisation';
  const orgId = isOrg ? activeAccount?.id ?? null : null;
  const orgName = activeAccount?.name ?? 'Euer Verein';
  const orgLogo = (isOrg && activeAccount?.avatar_url) || null;

  const [view, setView] = useState<CampaignView | null>(null);
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [logoColor, setLogoColor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!slug) return;
    const v = await fetchCampaign(slug);
    setView(v);
    if (v) {
      const [s, c] = await Promise.all([fetchSupporters(v.campaign.id), fetchLogoColor(orgLogo)]);
      setSupporters(s);
      setLogoColor(c);
    }
    setLoading(false);
  }, [slug, orgLogo]);
  useEffect(() => { load(); }, [load]);

  const mine = useMemo(() => {
    const byId = new Map(view?.packages.map((p) => [p.id, p]) ?? []);
    return supporters
      .filter((s) => s.org_account_id === orgId)
      .map((s) => ({ pkg: byId.get(s.package_id), paidAt: s.paid_at }))
      .filter((x): x is { pkg: SponsoringPackage & { taken: number }; paidAt: string | null } => !!x.pkg)
      .sort((a, b) => b.pkg.price_cents - a.pkg.price_cents)[0] ?? null;
  }, [supporters, orgId, view]);

  return {
    loading, view, orgId, orgName, orgLogo, logoColor, reload: load,
    paidPackage: mine?.pkg ?? null,
    paidAt: mine?.paidAt ?? null,
    kind: mine?.pkg && isCustomSpot(mine.pkg) ? ('custom' as const) : ('logo' as const),
  };
}
