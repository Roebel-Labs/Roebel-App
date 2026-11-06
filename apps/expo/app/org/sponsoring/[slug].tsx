import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { fontFamily } from '@/constants/theme';
import BreakSpotPreview from '@/components/sponsoring/BreakSpotPreview';
import SponsoringContact from '@/components/sponsoring/SponsoringContact';
import AdMaterialUpload from '@/components/sponsoring/AdMaterialUpload';
import {
  DANCECUP_EVENT_ID, DANCECUP_LIVE_SLUG, fetchCampaign, fetchCampaignEvent, fetchLogoColor, SPONSORING_REACH, fetchSpotCatalog, pickSpotItems, fetchMyBookings, fetchSupporters, formatEuro, isBookingOpen, isCustomSpot,
  openSponsoringCheckout, recommendedPackageId, slotsLeft, startCheckout,
  type AdMaterial, type CampaignEvent, type CampaignView, type DishPhoto, type SpotCatalog, type Supporter,
} from '@/lib/sponsoring';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import { ShimmerSkeleton } from '@/components/SkeletonLoader';

const REASONS: { icon: string; title: string; body: string }[] = [
  { icon: '📺', title: 'Vollbild statt Banner', body: 'Eure Werbung läuft in den Pausen über den ganzen Bildschirm – nie über den Tänzen, sondern dann, wenn alle hinschauen.' },
  { icon: '👨‍👩‍👧', title: 'Familien aus der ganzen Region', body: 'Großeltern, Eltern und Freunde der Tänzerinnen und Tänzer schauen zu Hause mit – genau die Menschen, die bei euch einkaufen.' },
  { icon: '⏱', title: 'Ein ganzer Wettkampftag', body: 'Von 10 bis 17 Uhr live. Euer Spot läuft in jeder Pause, nicht nur einmal.' },
  { icon: '🤝', title: 'Gutes tun und gesehen werden', body: 'Ihr unterstützt den 26. Müritz Dance Cup und den TSV 90 Röbel – und alle sehen, wer dahintersteht.' },
];

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
  const [catalog, setCatalog] = useState<SpotCatalog | null>(null);
  const [logoColor, setLogoColor] = useState<string | null>(null);
  const [event, setEvent] = useState<CampaignEvent | null>(null);
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
      const [s, d, c, e] = await Promise.all([
        fetchSupporters(v.campaign.id),
        orgId ? fetchSpotCatalog(orgId).catch(() => null) : Promise.resolve(null),
        fetchLogoColor(orgLogo),
        fetchCampaignEvent(DANCECUP_EVENT_ID).catch(() => null),
      ]);
      setEvent(e);
      setSupporters(s);
      setCatalog(d);
      setDishes(d ? pickSpotItems(d.items) : []);
      setLogoColor(c);
      setPackageId((cur) => cur ?? recommendedPackageId(v.packages, (d?.items.length ?? 0) > 0));
    }
    setLoading(false);
  }, [slug, orgId, orgLogo]);
  // Reload on focus too: an org may come back from creating its first listing for the spot.
  useFocusEffect(useCallback(() => { load(); }, [load]));

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
    : catalog?.source === 'menu'
      ? 'Vorschau mit Gerichten aus eurer Speisekarte. Den echten Spot schneiden wir für euch.'
      : catalog?.source === 'listings'
        ? 'Vorschau mit euren Angeboten aus dem Marktplatz. Den echten Spot schneiden wir für euch.'
        : 'Vorschau. Legt ein Produkt oder Angebot an – damit schneiden wir euren Spot.';
  /** Without menu photos or listings the produced spot has no material: send the org to the right form. */
  const createMaterial = () => {
    if (catalog?.hasRestaurant) router.push('/org/menu' as any);
    else router.push({ pathname: '/create-listing', params: { listingType: 'product', accountId: orgId ?? undefined } } as any);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {header}
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: canBuy ? 140 + insets.bottom : 40 + insets.bottom }]}>
        <Pressable onPress={() => router.push(`/event/${DANCECUP_EVENT_ID}` as any)} style={[styles.hero, { backgroundColor: colors.primary }]}
          accessibilityRole="link" accessibilityLabel="Zum Müritz Dance Cup">
          {event?.image_url ? <Image source={{ uri: event.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} /> : null}
          <View style={styles.heroShade} />
          <View style={styles.heroChip}><Text style={styles.heroChipText}>LIVE · Sa., 7. November</Text></View>
          <View style={styles.heroBottom}>
            <Text style={styles.heroTitle}>26. Müritz Dance Cup</Text>
            <Text style={styles.heroMeta}>10–17 Uhr · Sporthalle am Gotthunskamp, Röbel</Text>
          </View>
        </Pressable>
        <View style={styles.heroLinks}>
          <Pressable onPress={() => router.push(`/event/${DANCECUP_EVENT_ID}` as any)} hitSlop={6} accessibilityRole="link">
            <Text style={[styles.heroLink, { color: colors.primary }]}>Zum Event ›</Text>
          </Pressable>
          <Pressable onPress={() => router.push(`/live/${DANCECUP_LIVE_SLUG}` as any)} hitSlop={6} accessibilityRole="link">
            <Text style={[styles.heroLink, { color: colors.primary }]}>Zum Livestream ›</Text>
          </Pressable>
        </View>

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
            <Text style={[styles.title, { color: colors.textPrimary }]}>Eure Werbung vor ganz Röbel</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              Der DanceCup läuft live in der Röbel App, auf YouTube und Facebook. Zwischen den Runden zeigen wir eure Werbung im Vollbild – professionell eingebaut, als Werbung gekennzeichnet.
            </Text>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Warum beim DanceCup werben?</Text>
              {REASONS.map((r) => (
                <View key={r.title} style={styles.reason}>
                  <Text style={styles.reasonIcon}>{r.icon}</Text>
                  <View style={styles.reasonText}>
                    <Text style={[styles.reasonTitle, { color: colors.textPrimary }]}>{r.title}</Text>
                    <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>{r.body}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Wen ihr erreicht</Text>
              <View style={styles.stats}>
                {[
                  { value: `${SPONSORING_REACH.appPeople}+`, label: 'Menschen aus Röbel in der App' },
                  { value: `${SPONSORING_REACH.pushDevices}+`, label: 'Handys mit Benachrichtigungen' },
                  { value: '3', label: 'Kanäle: App, YouTube, Facebook' },
                ].map((st) => (
                  <View key={st.label} style={[styles.stat, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.statValue, { color: colors.primary }]}>{st.value}</Text>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{st.label}</Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                Dazu die Zuschauer in der Halle und alle, die von den Gruppen und Einzelstartern aus der Region den Link bekommen.
              </Text>
            </View>
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
              Wir schneiden euch 15 Sekunden {catalog?.source === 'menu' ? 'mit euren Gerichten' : catalog?.source === 'listings' ? 'mit euren Angeboten' : 'mit euren Fotos und Produkten'} – wie im Fernsehen. Ihr zahlt nur die Differenz.
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
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Pakete</Text>
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
                    <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                      <Text style={styles.badgeText}>{catalog?.source === 'menu' ? 'Empfohlen für Restaurants' : 'Mit euren Angeboten'}</Text>
                    </View>
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
                  {isCustom && isOrg && catalog?.source === 'none' ? (
                    <Pressable onPress={createMaterial} style={[styles.materialBtn, { borderColor: colors.primary }]} accessibilityRole="button">
                      <Text style={[styles.materialText, { color: colors.primary }]}>
                        {catalog.hasRestaurant ? 'Speisekarte mit Fotos füllen' : 'Produkt oder Angebot anlegen'}
                      </Text>
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {isOrg && orgId ? <AdMaterialUpload myAccountId={orgId} orgName={orgName} /> : null}

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

        <SponsoringContact myAccountId={activeAccount?.id ?? null} orgName={orgName} packageName={(bought ? myBestPaid : pkg)?.name ?? null} booked={bought} />

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
  hero: { height: 200, borderRadius: 16, overflow: 'hidden', justifyContent: 'space-between', padding: 14 },
  heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.38)' },
  heroChip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#E5484D' },
  heroChipText: { fontFamily: fontFamily.bold, fontSize: 11, color: '#FFFFFF', letterSpacing: 0.4 },
  heroBottom: { gap: 2 },
  heroTitle: { fontFamily: fontFamily.heading, fontSize: 26, color: '#FFFFFF' },
  heroMeta: { fontFamily: fontFamily.medium, fontSize: 13, color: 'rgba(255,255,255,0.9)' },
  heroLinks: { flexDirection: 'row', gap: 20, marginTop: -6 },
  heroLink: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  section: { gap: 12 },
  sectionTitle: { fontFamily: fontFamily.heading, fontSize: 20 },
  reason: { flexDirection: 'row', gap: 12 },
  reasonIcon: { fontSize: 22, lineHeight: 26, width: 28, textAlign: 'center' },
  reasonText: { flex: 1, gap: 2 },
  reasonTitle: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderRadius: 12, padding: 12, gap: 4 },
  statValue: { fontFamily: fontFamily.heading, fontSize: 22 },
  statLabel: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 16 },
  materialBtn: { alignSelf: 'flex-start', borderWidth: 1.5, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, marginTop: 4 },
  materialText: { fontFamily: fontFamily.semiBold, fontSize: 14 },
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
