import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { fontFamily } from '@/constants/theme';
import BreakSpotPreview from '@/components/sponsoring/BreakSpotPreview';
import {
  fetchCampaign, fetchDishPhotos, fetchLogoColor, fetchMyBookings, fetchSupporters, formatEuro, isBookingOpen, isCustomSpot,
  openSponsoringCheckout, recommendedPackageId, slotsLeft, startCheckout,
  type AdMaterial, type CampaignView, type DishPhoto, type Supporter,
} from '@/lib/sponsoring';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import { ShimmerSkeleton } from '@/components/SkeletonLoader';

function countdown(deadlineIso: string, now: number): string {
  const ms = Date.parse(deadlineIso) - now;
  if (ms <= 0) return 'Buchungsfrist abgelaufen';
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  if (d >= 1) return `Noch ${d} ${d === 1 ? 'Tag' : 'Tage'} ${h % 24} Std. buchbar`;
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `Nur noch ${h} Std. ${m} Min. buchbar`;
}

/** The profile logo travels with the booking so production has it; only our own storage URLs are accepted by the server. */
function logoMaterial(url: string | null): AdMaterial {
  return url && url.includes('/storage/v1/object/public/') ? { mediaKind: 'image', mediaUrl: url } : null;
}

export default function SponsoringDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { colors } = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { activeAccount } = useAccount();
  const thirdwebAccount = useActiveAccount();
  const signerRef = useRef(thirdwebAccount);
  signerRef.current = thirdwebAccount;

  const isOrg = activeAccount?.account_type === 'organisation';
  const orgId = isOrg ? activeAccount?.id ?? null : null;
  const orgName = activeAccount?.name ?? 'Euer Verein';
  const orgLogo = (isOrg && activeAccount?.avatar_url) || null;

  const [view, setView] = useState<CampaignView | null>(null);
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [dishes, setDishes] = useState<DishPhoto[]>([]);
  const [logoColor, setLogoColor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [packageId, setPackageId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    if (!slug) return;
    const v = await fetchCampaign(slug);
    setView(v);
    if (v) {
      const [s, d, c] = await Promise.all([
        fetchSupporters(v.campaign.id),
        orgId ? fetchDishPhotos(orgId).catch(() => []) : Promise.resolve([] as DishPhoto[]),
        fetchLogoColor(orgLogo),
      ]);
      setSupporters(s);
      setDishes(d);
      setLogoColor(c);
      setPackageId((cur) => cur ?? recommendedPackageId(v.packages, d.length > 0));
    }
    setLoading(false);
  }, [slug, orgId, orgLogo]);
  useEffect(() => { load(); }, [load]);

  const pkg = view?.packages.find((p) => p.id === packageId) ?? null;
  const custom = view?.packages.find((p) => isCustomSpot(p)) ?? null;

  // What this org already bought (paid bookings are public: they air).
  const myBestPaid = useMemo(() => {
    const byId = new Map(view?.packages.map((p) => [p.id, p]) ?? []);
    return supporters.filter((s) => s.org_account_id === orgId).map((s) => byId.get(s.package_id)).filter(Boolean)
      .sort((a, b) => (b!.price_cents - a!.price_cents))[0] ?? null;
  }, [supporters, orgId, view]);
  const upgradeTarget = myBestPaid && custom && !isCustomSpot(myBestPaid) && slotsLeft(custom) !== 0 ? custom : null;

  const open = view ? isBookingOpen(view.campaign, now) : false;
  const others = supporters.filter((s) => s.org_account_id !== orgId);

  /** After Stripe closes, the webhook marks the booking paid within seconds: poll the public list, then celebrate. */
  const waitForPaid = async (campaignId: string, packageIdPaid: string) => {
    setBusy('Zahlung wird bestätigt …');
    let paid = false;
    for (let i = 0; i < 10 && !paid; i++) {
      const s = await fetchSupporters(campaignId);
      setSupporters(s);
      paid = s.some((x) => x.org_account_id === orgId && x.package_id === packageIdPaid);
      if (!paid) await new Promise((r) => setTimeout(r, 1500));
    }
    setBusy(null);
    if (paid && slug) router.replace(`/org/sponsoring/success/${slug}` as any);
    else load();
  };

  const buy = async (targetPackageId: string, upgradeBookingId: string | null = null) => {
    const signer = signerRef.current;
    if (!signer || !orgId || !view) return;
    setBusy('Zahlung wird vorbereitet …');
    const res = await startCheckout(signer, {
      orgAccountId: orgId, packageId: targetPackageId, material: logoMaterial(orgLogo), upgradeBookingId,
    });
    if (!res.ok) {
      setBusy(null);
      Alert.alert('Kauf nicht möglich', res.message);
      load();
      return;
    }
    setBusy(null);
    await openSponsoringCheckout(res.data.url, view.campaign.slug);
    await waitForPaid(view.campaign.id, targetPackageId);
  };

  const startUpgrade = async () => {
    const signer = signerRef.current;
    if (!signer || !orgId || !slug || !upgradeTarget || !myBestPaid) return;
    // The paid booking's id is private: one signed read to find it.
    setBusy('Einen Moment …');
    const mine = await fetchMyBookings(signer, orgId, slug);
    const prev = mine.ok ? mine.data.bookings.find((b) => b.package_id === myBestPaid.id && (b.status === 'paid' || b.status === 'approved')) : null;
    setBusy(null);
    await buy(upgradeTarget.id, prev?.id ?? null);
  };

  const share = () => {
    Share.share({ message: `Wir sind beim DanceCup-Livestream dabei! Am Samstag, 7. November, live in der Röbel App, auf YouTube und Facebook. – ${orgName}` }).catch(() => undefined);
  };

  // ── render ────────────────────────────────────────────────────────────────
  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={8} accessibilityLabel="Zurück">
        <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>DanceCup Livestream</Text>
      <View style={styles.backButton} />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        {header}
        <View style={styles.scroll} accessibilityLabel="Wird geladen">
          <ShimmerSkeleton width="70%" height={28} borderRadius={6} />
          <View style={styles.skeletonLines}>
            <ShimmerSkeleton width="100%" height={14} borderRadius={4} />
            <ShimmerSkeleton width="85%" height={14} borderRadius={4} />
          </View>
          <ShimmerSkeleton width="100%" height={Math.round(((screenWidth - 32) * 9) / 16)} borderRadius={12} />
          <ShimmerSkeleton width="100%" height={168} borderRadius={14} />
          <ShimmerSkeleton width="100%" height={200} borderRadius={14} />
        </View>
      </SafeAreaView>
    );
  }

  if (!view) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        {header}
        <View style={styles.center}><Text style={[styles.muted, { color: colors.textSecondary }]}>Dieses Angebot ist gerade nicht verfügbar.</Text></View>
      </SafeAreaView>
    );
  }

  const bought = myBestPaid != null;
  const previewPkg = bought ? myBestPaid : pkg;
  const kind = previewPkg && isCustomSpot(previewPkg) ? 'custom' : 'logo';
  const left = pkg ? slotsLeft(pkg) : null;
  const canBuy = open && isOrg && !!pkg && left !== 0 && !bought;
  const previewNote = kind === 'logo'
    ? 'Vorschau: So erscheint euer Logo-Spot in jeder Pause.'
    : dishes.length
      ? 'Vorschau mit Gerichten aus eurer Speisekarte. Den echten Spot schneiden wir für euch.'
      : 'Vorschau. Den echten Spot schneiden wir mit euren Fotos, Produkten oder Videos.';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {header}
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: canBuy ? 140 + insets.bottom : 40 + insets.bottom }]}>
        {bought ? (
          <View style={[styles.successBox, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.successTitle, { color: colors.textPrimary }]}>Ihr seid dabei! 🎉</Text>
            <Text style={[styles.body, { color: colors.textPrimary }]}>
              {orgName} läuft mit „{myBestPaid?.name}“ in den Pausen des DanceCup-Livestreams.
            </Text>
            <Pressable onPress={() => router.push(`/org/sponsoring/status/${slug}` as any)} style={[styles.cta, { backgroundColor: colors.primary }]} accessibilityRole="button">
              <Text style={[styles.ctaText, { color: colors.onPrimary }]}>Status und Infos</Text>
            </Pressable>
            <Pressable onPress={share} style={[styles.secondaryBtn, { borderColor: colors.primary }]} accessibilityRole="button">
              <Text style={[styles.secondaryText, { color: colors.primary }]}>Teilen: „Wir sind dabei“</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Euer Auftritt in der Pause</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              Samstag, 7. November – live in der Röbel App, auf YouTube und Facebook. Zwischen den Runden läuft eure Werbung im Vollbild.
            </Text>
          </>
        )}

        <View style={styles.previewWrap}>
          <BreakSpotPreview key={kind} kind={kind} orgName={orgName} logoUrl={orgLogo} logoColor={logoColor} dishes={dishes} />
          <Text style={[styles.small, { color: colors.textTertiary }]}>{previewNote}</Text>
        </View>

        {bought && open && upgradeTarget && myBestPaid ? (
          <View style={[styles.upgrade, { borderColor: colors.primary }]}>
            <Text style={[styles.pkgName, { color: colors.textPrimary }]}>Lieber einen richtigen Werbespot?</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              Wir schneiden euch 15 Sekunden {dishes.length ? 'mit euren Gerichten' : 'mit euren Fotos und Produkten'} – wie im Fernsehen. Ihr zahlt nur die Differenz.
            </Text>
            <Pressable onPress={startUpgrade} disabled={!!busy} style={[styles.cta, { backgroundColor: colors.primary }]} accessibilityRole="button">
              <Text style={[styles.ctaText, { color: colors.onPrimary }]}>
                {busy ?? `Upgrade für ${formatEuro(upgradeTarget.price_cents - myBestPaid.price_cents)}`}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {!bought ? (
          <View style={styles.options}>
            {view.packages.map((p) => {
              const sel = p.id === packageId;
              const pLeft = slotsLeft(p);
              const isCustom = isCustomSpot(p);
              return (
                <Pressable key={p.id} onPress={() => pLeft !== 0 && setPackageId(p.id)} disabled={pLeft === 0}
                  style={[styles.option, {
                    borderColor: sel ? colors.primary : colors.border,
                    backgroundColor: sel ? colors.primaryLight : colors.background,
                    opacity: pLeft === 0 ? 0.5 : 1,
                  }]}
                  accessibilityRole="radio" accessibilityState={{ selected: sel }}>
                  {isCustom && dishes.length ? (
                    <View style={[styles.badge, { backgroundColor: colors.primary }]}><Text style={styles.badgeText}>Empfohlen für Restaurants</Text></View>
                  ) : null}
                  <View style={styles.optionHead}>
                    <View style={[styles.radio, { borderColor: sel ? colors.primary : colors.border }]}>
                      {sel ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}
                    </View>
                    <Text style={[styles.pkgName, { color: colors.textPrimary }]}>{p.name}</Text>
                    <Text style={[styles.pkgPrice, { color: colors.textPrimary }]}>{formatEuro(p.price_cents)}</Text>
                  </View>
                  {p.description ? <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>{p.description}</Text> : null}
                  <View style={styles.includes}>
                    {p.includes.map((line) => (
                      <View key={line} style={styles.includeRow}>
                        <Text style={[styles.check, { color: colors.primary }]}>✓</Text>
                        <Text style={[styles.includeText, { color: colors.textPrimary }]}>{line}</Text>
                      </View>
                    ))}
                  </View>
                  {pLeft != null ? (
                    <Text style={[styles.small, { color: pLeft <= 2 ? colors.error : colors.textTertiary }]}>
                      {pLeft === 0 ? 'Ausgebucht' : `Noch ${pLeft} von ${p.capacity} frei`}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {others.length > 0 ? (
          <View>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Schon dabei</Text>
            <View style={styles.supporters}>
              {others.slice(0, 12).map((s) => (
                <View key={`${s.org_account_id}-${s.package_id}`} style={[styles.supporter, { borderColor: colors.border }]}>
                  {s.avatar_url ? <Image source={{ uri: s.avatar_url }} style={styles.supporterImg} contentFit="cover" /> : (
                    <Text style={[styles.supporterInitial, { color: colors.textSecondary }]}>{s.name.slice(0, 1)}</Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Text style={[styles.small, { color: colors.textTertiary }]}>
          {countdown(view.campaign.booking_deadline, now)} · Alle Spots werden im Stream als „Werbung“ gekennzeichnet.
          {!isOrg ? ' Wechsle zu deinem Vereins- oder Geschäftskonto, um zu buchen.' : ''}
        </Text>
      </ScrollView>

      {canBuy && pkg ? (
        <View style={[styles.bottomBar, { paddingBottom: 12 + insets.bottom, backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <Pressable onPress={() => buy(pkg.id)} disabled={!!busy} style={[styles.cta, { backgroundColor: colors.primary, opacity: busy ? 0.7 : 1 }]}
            accessibilityRole="button" accessibilityLabel={`Jetzt kaufen für ${formatEuro(pkg.price_cents)}`}>
            <Text style={[styles.ctaText, { color: colors.onPrimary }]}>{busy ?? `Jetzt kaufen · ${formatEuro(pkg.price_cents)}`}</Text>
          </Pressable>
          <Text style={[styles.payHint, { color: colors.textTertiary }]}>Sicher bezahlen mit Apple Pay, Google Pay oder Karte · Rechnung per E-Mail</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { fontFamily: fontFamily.regular, fontSize: 15, textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  scroll: { padding: 16, gap: 16 },
  title: { fontFamily: fontFamily.heading, fontSize: 24 },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17 },
  label: { fontFamily: fontFamily.medium, fontSize: 13, marginBottom: 8 },
  previewWrap: { gap: 8 },
  skeletonLines: { gap: 8 },
  options: { gap: 12 },
  option: { borderWidth: 1.5, borderRadius: 14, padding: 16, gap: 8 },
  optionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  optionDesc: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  includes: { gap: 4 },
  includeRow: { flexDirection: 'row', gap: 8 },
  check: { fontFamily: fontFamily.bold, fontSize: 13, lineHeight: 19 },
  includeText: { flex: 1, fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 19 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  pkgName: { flexShrink: 1, fontFamily: fontFamily.semiBold, fontSize: 17 },
  pkgPrice: { marginLeft: 'auto', fontFamily: fontFamily.heading, fontSize: 18 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontFamily: fontFamily.semiBold, fontSize: 11, color: '#FFFFFF' },
  supporters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  supporter: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  supporterImg: { width: '100%', height: '100%' },
  supporterInitial: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  successBox: { borderRadius: 14, padding: 16, gap: 8 },
  successTitle: { fontFamily: fontFamily.heading, fontSize: 24 },
  upgrade: { borderWidth: 1.5, borderRadius: 14, padding: 16, gap: 8 },
  secondaryBtn: { borderWidth: 1.5, borderRadius: 999, paddingVertical: 11, alignItems: 'center' },
  secondaryText: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 6 },
  cta: { borderRadius: 999, paddingVertical: 15, alignItems: 'center' },
  ctaText: { fontFamily: fontFamily.semiBold, fontSize: 17 },
  payHint: { fontFamily: fontFamily.regular, fontSize: 11, textAlign: 'center' },
});
