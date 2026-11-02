import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { fontFamily } from '@/constants/theme';
import StreamPreview, { type PreviewMode } from '@/components/sponsoring/StreamPreview';
import {
  fetchCampaign, fetchCreatives, fetchMyBookings, fetchSupporters, formatEuro, IMAGE_MIMES, isBookingOpen,
  MAX_IMAGE_BYTES, openSponsoringCheckout, recommendedPackageId, setBookingCreative, slotsLeft, startCheckout,
  uploadSponsoringMedia, type AdMaterial, type CampaignView, type SponsoringCreative, type Supporter,
} from '@/lib/sponsoring';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

/** What the org picked as its ad: an AI card, its profile logo, or a fresh upload. */
type Choice =
  | { kind: 'creative'; id: string; url: string }
  | { kind: 'logo'; url: string }
  | { kind: 'upload'; uri: string; mimeType: string | null; media: 'image' | 'video' };

const SPOT_PACKAGES = /spot|präsentiert/i;

function countdown(deadlineIso: string, now: number): string {
  const ms = Date.parse(deadlineIso) - now;
  if (ms <= 0) return 'Buchungsfrist abgelaufen';
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  if (d >= 1) return `Noch ${d} ${d === 1 ? 'Tag' : 'Tage'} ${h % 24} Std. buchbar`;
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `Nur noch ${h} Std. ${m} Min. buchbar`;
}

export default function SponsoringDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
  const [creatives, setCreatives] = useState<SponsoringCreative[]>([]);
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [loading, setLoading] = useState(true);
  const [packageId, setPackageId] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [mode, setMode] = useState<PreviewMode>('banner');
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
      const [c, s] = await Promise.all([
        orgId ? fetchCreatives(v.campaign.id, orgId) : Promise.resolve([]),
        fetchSupporters(v.campaign.id),
      ]);
      setCreatives(c);
      setSupporters(s);
      setPackageId((cur) => cur ?? recommendedPackageId(v.packages));
      setChoice((cur) => cur ?? (c[0] ? { kind: 'creative', id: c[0].id, url: c[0].image_url } : orgLogo ? { kind: 'logo', url: orgLogo } : null));
    }
    setLoading(false);
  }, [slug, orgId, orgLogo]);
  useEffect(() => { load(); }, [load]);

  const pkg = view?.packages.find((p) => p.id === packageId) ?? null;
  useEffect(() => { if (pkg) setMode(SPOT_PACKAGES.test(pkg.name) ? 'spot' : 'banner'); }, [pkg]);

  // What this org already bought (paid bookings are public: they air).
  const myPaid = useMemo(() => supporters.filter((s) => s.org_account_id === orgId), [supporters, orgId]);
  const myBestPaid = useMemo(() => {
    const prices = new Map(view?.packages.map((p) => [p.id, p]) ?? []);
    return myPaid.map((s) => prices.get(s.package_id)).filter(Boolean)
      .sort((a, b) => (b!.price_cents - a!.price_cents))[0] ?? null;
  }, [myPaid, view]);
  const upgradeTarget = useMemo(() => {
    if (!myBestPaid || !view) return null;
    return view.packages.find((p) => SPOT_PACKAGES.test(p.name) && p.price_cents > myBestPaid.price_cents && slotsLeft(p) !== 0
      && /spot/i.test(p.name)) ?? null;
  }, [myBestPaid, view]);

  const adUrl = choice?.kind === 'creative' || choice?.kind === 'logo' ? choice.url : choice?.kind === 'upload' && choice.media === 'image' ? choice.uri : null;
  const open = view ? isBookingOpen(view.campaign, now) : false;
  const othersCount = supporters.filter((s) => s.org_account_id !== orgId).length;

  const pickUpload = async (media: 'image' | 'video') => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Zugriff benötigt', 'Bitte erlaube den Zugriff auf deine Fotos.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: [media === 'video' ? 'videos' : 'images'], quality: 1 });
    const a = res.canceled ? null : res.assets?.[0];
    if (!a) return;
    if (media === 'image' && ((a.mimeType && !IMAGE_MIMES[a.mimeType]) || (a.fileSize ?? 0) > MAX_IMAGE_BYTES)) {
      Alert.alert('Bild passt nicht', 'Bitte ein PNG, JPG oder WebP bis 10 MB wählen.');
      return;
    }
    if (media === 'video' && (a.duration ?? 0) / 1000 > 31) {
      Alert.alert('Video zu lang', 'Das Video darf höchstens 30 Sekunden lang sein.');
      return;
    }
    setChoice({ kind: 'upload', uri: a.uri, mimeType: a.mimeType ?? null, media });
  };

  /** Turns the current choice into what the server accepts (uploads first). */
  const materialFor = async (signerAddress: string): Promise<AdMaterial | 'failed'> => {
    if (!choice) return null;
    if (choice.kind === 'creative') return { creativeId: choice.id };
    if (choice.kind === 'logo') return { mediaKind: 'image', mediaUrl: choice.url };
    setBusy(choice.media === 'video' ? 'Video wird hochgeladen …' : 'Bild wird hochgeladen …');
    const url = await uploadSponsoringMedia(choice, choice.media, signerAddress, (f) => {
      if (choice.media === 'video') setBusy(`Video wird hochgeladen … ${Math.round(f * 100)} %`);
    });
    return url ? { mediaKind: choice.media, mediaUrl: url } : 'failed';
  };

  /** After Stripe closes, the webhook marks the booking paid within seconds: poll the public list. */
  const waitForPaid = async (campaignId: string, packageIdPaid: string) => {
    setBusy('Zahlung wird bestätigt …');
    for (let i = 0; i < 10; i++) {
      const s = await fetchSupporters(campaignId);
      setSupporters(s);
      if (s.some((x) => x.org_account_id === orgId && x.package_id === packageIdPaid)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        break;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    setBusy(null);
    load();
  };

  const buy = async (targetPackageId: string, upgradeBookingId: string | null = null) => {
    const signer = signerRef.current;
    if (!signer || !orgId || !view) return;
    const target = view.packages.find((p) => p.id === targetPackageId);
    if (!target) return;
    const material = await materialFor(signer.address);
    if (material === 'failed') {
      setBusy(null);
      Alert.alert('Upload fehlgeschlagen', 'Bitte versucht es erneut.');
      return;
    }
    setBusy('Zahlung wird vorbereitet …');
    const res = await startCheckout(signer, { orgAccountId: orgId, packageId: target.id, material, upgradeBookingId });
    if (!res.ok) {
      setBusy(null);
      Alert.alert('Kauf nicht möglich', res.message);
      load();
      return;
    }
    setBusy(null);
    await openSponsoringCheckout(res.data.url, view.campaign.slug);
    await waitForPaid(view.campaign.id, target.id);
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

  const changeAd = async () => {
    const signer = signerRef.current;
    if (!signer || !orgId || !slug || !myBestPaid) return;
    const material = await materialFor(signer.address);
    if (!material || material === 'failed') { setBusy(null); return; }
    setBusy('Werbebild wird gespeichert …');
    const mine = await fetchMyBookings(signer, orgId, slug);
    const b = mine.ok ? mine.data.bookings.find((x) => x.status === 'paid' || x.status === 'approved') : null;
    const res = b ? await setBookingCreative(signer, orgId, b.id, material) : null;
    setBusy(null);
    if (res?.ok) Alert.alert('Gespeichert', 'Euer Werbebild wurde aktualisiert.');
    else Alert.alert('Nicht möglich', res && !res.ok ? res.message : 'Buchung nicht gefunden.');
  };

  const share = () => {
    Share.share({ message: `Wir sind beim DanceCup-Livestream dabei! Am Samstag, 7. November, live in der Röbel App, auf YouTube und Facebook. – ${orgName}` }).catch(() => undefined);
  };

  // ── render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={8} accessibilityLabel="Zurück">
        <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>DanceCup Livestream</Text>
      <View style={styles.backButton} />
    </View>
  );

  if (!view) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        {header}
        <View style={styles.center}><Text style={[styles.muted, { color: colors.textSecondary }]}>Dieses Angebot ist gerade nicht verfügbar.</Text></View>
      </SafeAreaView>
    );
  }

  const bought = myBestPaid != null;
  const boughtName = myBestPaid?.name ?? '';
  // The cheapest tier goes last and small, so it does not pull buyers down from the recommended one.
  const entryId = [...view.packages].sort((a, b) => a.price_cents - b.price_cents)[0]?.id ?? null;
  const orderedPackages = [...view.packages.filter((p) => p.id !== entryId), ...view.packages.filter((p) => p.id === entryId)];
  const left = pkg ? slotsLeft(pkg) : null;
  const canBuy = open && isOrg && !!pkg && left !== 0 && !bought;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {header}
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: canBuy ? 140 + insets.bottom : 40 + insets.bottom }]}>
        {bought ? (
          <View style={[styles.successBox, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.successTitle, { color: colors.textPrimary }]}>Ihr seid dabei! 🎉</Text>
            <Text style={[styles.body, { color: colors.textPrimary }]}>
              {orgName} ist mit „{boughtName}“ im DanceCup-Livestream. Die Rechnung kommt per E-Mail.
            </Text>
            <Pressable onPress={share} style={[styles.secondaryBtn, { borderColor: colors.primary }]} accessibilityRole="button">
              <Text style={[styles.secondaryText, { color: colors.primary }]}>Teilen: „Wir sind dabei“</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={[styles.title, { color: colors.textPrimary }]}>So seid ihr im Stream dabei</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              Samstag, 7. November – den ganzen Tag live in der Röbel App, auf YouTube und Facebook.
            </Text>
          </>
        )}

        <StreamPreview mode={mode} orgName={orgName} logoUrl={orgLogo} adUrl={adUrl} stageUrl={view.campaign.hero_image_url} />
        <View style={[styles.segment, { backgroundColor: colors.surface }]}>
          {(['banner', 'spot'] as const).map((m) => (
            <Pressable key={m} onPress={() => setMode(m)} style={[styles.segmentItem, mode === m && { backgroundColor: colors.background }]}>
              <Text style={[styles.segmentText, { color: mode === m ? colors.textPrimary : colors.textSecondary }]}>
                {m === 'banner' ? 'Im Werbebanner' : 'Als Spot in der Pause'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Ad choices: AI cards first, then profile logo, then own upload */}
        {isOrg && open ? (
          <View>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              {creatives.length ? 'Euer Werbebild – für euch vorbereitet' : 'Euer Werbebild'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>
              {creatives.map((c) => {
                const sel = choice?.kind === 'creative' && choice.id === c.id;
                return (
                  <Pressable key={c.id} onPress={() => setChoice({ kind: 'creative', id: c.id, url: c.image_url })}
                    style={[styles.choice, { borderColor: sel ? colors.primary : colors.border }]} accessibilityRole="button">
                    <Image source={{ uri: c.image_url }} style={styles.choiceImg} contentFit="cover" />
                  </Pressable>
                );
              })}
              {orgLogo ? (
                <Pressable onPress={() => setChoice({ kind: 'logo', url: orgLogo })}
                  style={[styles.choice, styles.choiceLogo, { borderColor: choice?.kind === 'logo' ? colors.primary : colors.border, backgroundColor: '#FFFFFF' }]}
                  accessibilityRole="button">
                  <Image source={{ uri: orgLogo }} style={styles.choiceLogoImg} contentFit="contain" />
                  <Text style={styles.choiceCaption}>Profil-Logo</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => pickUpload('image')}
                style={[styles.choice, styles.choiceUpload, { borderColor: choice?.kind === 'upload' ? colors.primary : colors.border, backgroundColor: colors.surface }]}
                accessibilityRole="button">
                {choice?.kind === 'upload' && choice.media === 'image' ? (
                  <Image source={{ uri: choice.uri }} style={styles.choiceImg} contentFit="contain" />
                ) : (
                  <Text style={[styles.uploadText, { color: colors.textPrimary }]}>＋ Eigenes Bild</Text>
                )}
              </Pressable>
              {pkg?.accepts.includes('video') ? (
                <Pressable onPress={() => pickUpload('video')}
                  style={[styles.choice, styles.choiceUpload, { borderColor: choice?.kind === 'upload' && choice.media === 'video' ? colors.primary : colors.border, backgroundColor: colors.surface }]}
                  accessibilityRole="button">
                  <Text style={[styles.uploadText, { color: colors.textPrimary }]}>
                    {choice?.kind === 'upload' && choice.media === 'video' ? '✓ Video gewählt' : '＋ Eigenes Video'}
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
            {creatives.some((c) => c.source !== 'upload') ? (
              <Text style={[styles.small, { color: colors.textTertiary }]}>Vorschläge mit KI erstellt. Ihr könnt das Bild bis zur Frist jederzeit ändern.</Text>
            ) : null}
          </View>
        ) : null}

        {bought && open ? (
          <>
            {choice ? (
              <Pressable onPress={changeAd} disabled={!!busy} style={[styles.secondaryBtn, { borderColor: colors.border }]} accessibilityRole="button">
                <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>Gewähltes Bild als Werbebild speichern</Text>
              </Pressable>
            ) : null}
            {upgradeTarget && myBestPaid ? (
              <View style={[styles.upgrade, { borderColor: colors.primary }]}>
                <Text style={[styles.pkgName, { color: colors.textPrimary }]}>Auch als Spot in den Pausen zeigen</Text>
                <Text style={[styles.body, { color: colors.textSecondary }]}>
                  Euer Werbebild läuft zusätzlich groß zwischen den Runden. Ihr zahlt nur die Differenz.
                </Text>
                <Pressable onPress={startUpgrade} disabled={!!busy} style={[styles.cta, { backgroundColor: colors.primary }]} accessibilityRole="button">
                  <Text style={[styles.ctaText, { color: colors.onPrimary }]}>
                    {busy ?? `Upgrade für ${formatEuro(upgradeTarget.price_cents - myBestPaid.price_cents)}`}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : null}

        {!bought ? (
          <View style={styles.packages}>
            {orderedPackages.map((p) => {
              const sel = p.id === packageId;
              const pLeft = slotsLeft(p);
              const recommended = p.id === recommendedPackageId(view.packages);
              const entry = p.id === entryId;
              return (
                <Pressable key={p.id} onPress={() => pLeft !== 0 && setPackageId(p.id)} disabled={pLeft === 0}
                  style={[styles.pkg, entry && styles.pkgSmall, { borderColor: sel ? colors.primary : colors.border, opacity: pLeft === 0 ? 0.5 : 1 }]}
                  accessibilityRole="radio" accessibilityState={{ selected: sel }}>
                  <View style={styles.pkgHead}>
                    <View style={[styles.radio, { borderColor: sel ? colors.primary : colors.border }]}>
                      {sel ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}
                    </View>
                    <Text style={[styles.pkgName, { color: colors.textPrimary }]}>{p.name}</Text>
                    {recommended ? (
                      <View style={[styles.badge, { backgroundColor: colors.primary }]}><Text style={styles.badgeText}>Empfohlen</Text></View>
                    ) : null}
                    <Text style={[styles.pkgPrice, { color: colors.textPrimary }]}>{formatEuro(p.price_cents)}</Text>
                  </View>
                  {sel || !entry ? (
                    <Text style={[styles.small, { color: colors.textSecondary }]}>{p.includes.join(' · ')}</Text>
                  ) : null}
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

        {othersCount > 0 ? (
          <View>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Schon dabei</Text>
            <View style={styles.supporters}>
              {supporters.filter((s) => s.org_account_id !== orgId).slice(0, 12).map((s) => (
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
          {countdown(view.campaign.booking_deadline, now)} · Alle Werbeplätze werden im Stream als „Werbung“ gekennzeichnet.
          {!isOrg ? ' Wechsle zu deinem Vereins- oder Geschäftskonto, um zu buchen.' : ''}
        </Text>
      </ScrollView>

      {canBuy && pkg ? (
        <View style={[styles.bottomBar, { paddingBottom: 12 + insets.bottom, backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <Pressable onPress={() => buy(pkg.id)} disabled={!!busy} style={[styles.cta, { backgroundColor: colors.primary, opacity: busy ? 0.7 : 1 }]}
            accessibilityRole="button" accessibilityLabel={`Jetzt kaufen für ${formatEuro(pkg.price_cents)}`}>
            {busy ? (
              <Text style={[styles.ctaText, { color: colors.onPrimary }]}>{busy}</Text>
            ) : (
              <Text style={[styles.ctaText, { color: colors.onPrimary }]}>Jetzt kaufen · {formatEuro(pkg.price_cents)}</Text>
            )}
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
  scroll: { padding: 16, gap: 14 },
  title: { fontFamily: fontFamily.heading, fontSize: 24 },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17 },
  label: { fontFamily: fontFamily.medium, fontSize: 13, marginBottom: 8 },
  segment: { flexDirection: 'row', borderRadius: 999, padding: 3 },
  segmentItem: { flex: 1, borderRadius: 999, paddingVertical: 7, alignItems: 'center' },
  segmentText: { fontFamily: fontFamily.medium, fontSize: 13 },
  choices: { gap: 10, paddingRight: 16 },
  choice: { width: 128, height: 72, borderRadius: 10, borderWidth: 2, overflow: 'hidden' },
  choiceImg: { width: '100%', height: '100%' },
  choiceLogo: { alignItems: 'center', justifyContent: 'center', paddingTop: 4 },
  choiceLogoImg: { width: 90, height: 40 },
  choiceCaption: { fontFamily: fontFamily.medium, fontSize: 10, color: '#6B7280', marginTop: 2 },
  choiceUpload: { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed' },
  uploadText: { fontFamily: fontFamily.semiBold, fontSize: 13 },
  packages: { gap: 10 },
  pkg: { borderWidth: 1.5, borderRadius: 12, padding: 14, gap: 6 },
  pkgSmall: { paddingVertical: 10 },
  pkgHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  pkgName: { flexShrink: 1, fontFamily: fontFamily.semiBold, fontSize: 16 },
  pkgPrice: { marginLeft: 'auto', fontFamily: fontFamily.heading, fontSize: 18 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
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
