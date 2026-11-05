import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import BreakSpotPreview from '@/components/sponsoring/BreakSpotPreview';
import { useMySponsoring } from '@/components/sponsoring/useMySponsoring';
import { ShimmerSkeleton } from '@/components/SkeletonLoader';
import { canSignSilently } from '@/lib/signed-request';
import {
  fetchSpotCatalog, fetchMyBookings, formatEuro, MAX_SPOT_DISHES, parseDishNote, setSpotDishes, sponsoringWhatsAppUrl,
  type DishPhoto, type SpotSource,
} from '@/lib/sponsoring';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

const DEFAULT_PICKS = 3;

function formatDay(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', timeZone: 'Europe/Berlin' });
}

type Step = { label: string; hint?: string; done: boolean };

/** The org's booked spot: preview, progress, dish selection (produced spot), event info and a WhatsApp line. */
export default function SponsoringStatusScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const s = useMySponsoring(slug);
  const thirdwebAccount = useActiveAccount();
  const signerRef = useRef(thirdwebAccount);
  signerRef.current = thirdwebAccount;

  const [menu, setMenu] = useState<DishPhoto[]>([]);
  const [source, setSource] = useState<SpotSource | null>(null);
  const [hasRestaurant, setHasRestaurant] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[] | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isCustom = s.kind === 'custom' && !!s.paidPackage;

  /** The paid booking (id + stored dish choice) is private: one signed read. */
  const loadBooking = useCallback(async (): Promise<string | null> => {
    const signer = signerRef.current;
    const pkgId = s.paidPackage?.id;
    if (!signer || !s.orgId || !slug || !pkgId) return null;
    const res = await fetchMyBookings(signer, s.orgId, slug);
    const b = res.ok ? res.data.bookings.find((x) => x.package_id === pkgId && (x.status === 'paid' || x.status === 'approved')) : null;
    if (!b) return null;
    setBookingId(b.id);
    const ids = parseDishNote(b.note);
    if (ids.length) { setSelected(ids); setSaved(ids); }
    return b.id;
  }, [s.orgId, s.paidPackage, slug]);

  // On focus, so a listing or menu photo created from here shows up when the org comes back.
  useFocusEffect(useCallback(() => {
    if (!isCustom || !s.orgId) return;
    let alive = true;
    fetchSpotCatalog(s.orgId).then((c) => {
      if (!alive) return;
      const m = c.items;
      setMenu(m);
      setSource(c.source);
      setHasRestaurant(c.hasRestaurant);
      // Until a choice is stored, start with the first dishes of the menu (what the preview showed before).
      setSelected((cur) => (cur.length ? cur : m.slice(0, DEFAULT_PICKS).map((d) => d.id)));
    }).catch(() => undefined);
    // Only read the stored choice when it costs no prompt (thirdweb or a live passkey session).
    canSignSilently(signerRef.current).then((ok) => { if (ok && alive) loadBooking().catch(() => undefined); });
    return () => { alive = false; };
  }, [isCustom, s.orgId, loadBooking]));

  const previewDishes = useMemo(() => {
    const byId = new Map(menu.map((d) => [d.id, d]));
    return selected.map((id) => byId.get(id)).filter((d): d is DishPhoto => !!d);
  }, [menu, selected]);
  const dirty = saved == null ? selected.length > 0 : selected.join() !== saved.join();

  const toggle = (id: string) => {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= MAX_SPOT_DISHES) {
        Alert.alert('Höchstens 4 Gerichte', 'Entfernt zuerst ein Gericht, um ein anderes zu wählen.');
        return cur;
      }
      return [...cur, id];
    });
  };

  const save = async () => {
    const signer = signerRef.current;
    if (!signer || !s.orgId || !selected.length) return;
    setSaving(true);
    const id = bookingId ?? (await loadBooking());
    if (!id) {
      setSaving(false);
      Alert.alert('Buchung nicht gefunden', 'Bitte versucht es gleich noch einmal oder schreibt uns auf WhatsApp.');
      return;
    }
    const res = await setSpotDishes(signer, s.orgId, id, selected);
    setSaving(false);
    if (res.ok) { setSaved(selected); Alert.alert('Gespeichert', 'Wir schneiden euren Spot mit diesen Gerichten.'); }
    else Alert.alert('Nicht gespeichert', res.message);
  };

  const openWhatsApp = () => {
    Linking.openURL(sponsoringWhatsAppUrl(s.orgName, s.paidPackage?.name ?? null)).catch(() =>
      Alert.alert('WhatsApp nicht verfügbar', 'Ihr erreicht uns unter +49 176 82275490.'));
  };

  const steps: Step[] = isCustom
    ? [
      { label: 'Gebucht und bezahlt', hint: formatDay(s.paidAt) ? `am ${formatDay(s.paidAt)}` : undefined, done: true },
      { label: source === 'listings' ? 'Angebote ausgewählt' : 'Gerichte ausgewählt', hint: menu.length ? 'Ihr könnt die Auswahl bis zur Übertragung ändern' : 'Legt ein Angebot an oder schickt uns Fotos per WhatsApp', done: !!saved?.length },
      { label: 'Wir schneiden euren Spot', hint: 'Ihr bekommt ihn vorher per WhatsApp zur Freigabe', done: false },
      { label: 'Live am Samstag, 7. November', hint: 'In jeder Pause zwischen den Runden', done: false },
    ]
    : [
      { label: 'Gebucht und bezahlt', hint: formatDay(s.paidAt) ? `am ${formatDay(s.paidAt)}` : undefined, done: true },
      { label: 'Euer Logo-Spot ist fertig', hint: 'Automatisch aus eurem Profil-Logo', done: true },
      { label: 'Live am Samstag, 7. November', hint: 'In jeder Pause zwischen den Runden', done: false },
    ];
  const current = steps.findIndex((x) => !x.done);

  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile' as any))} style={styles.backButton} hitSlop={8} accessibilityLabel="Zurück">
        <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Eure Werbung</Text>
      <View style={styles.backButton} />
    </View>
  );
  const tileSize = Math.floor((width - 32 - 2 * 10) / 3);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {header}
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 40 + insets.bottom }]}>
        {s.loading ? (
          <>
            <ShimmerSkeleton width="100%" height={Math.round(((width - 32) * 9) / 16)} borderRadius={12} />
            <ShimmerSkeleton width="100%" height={88} borderRadius={14} />
            <ShimmerSkeleton width="100%" height={220} borderRadius={14} />
          </>
        ) : !s.paidPackage ? (
          <View style={styles.empty}>
            <Text style={[styles.body, { color: colors.textSecondary }]}>Für dieses Konto gibt es noch keine bezahlte Buchung.</Text>
            <Pressable onPress={() => router.replace(`/org/sponsoring/${slug}` as any)} style={[styles.cta, { backgroundColor: colors.primary }]} accessibilityRole="button">
              <Text style={[styles.ctaText, { color: colors.onPrimary }]}>Werbeplätze ansehen</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <BreakSpotPreview key={`${s.kind}-${previewDishes.map((d) => d.id).join()}`} kind={s.kind} orgName={s.orgName}
              logoUrl={s.orgLogo} logoColor={s.logoColor} dishes={previewDishes} />

            <View style={[styles.card, { borderColor: colors.border }]}>
              <View style={styles.cardHead}>
                <Text style={[styles.pkgName, { color: colors.textPrimary }]}>{s.paidPackage.name}</Text>
                <View style={[styles.chip, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[styles.chipText, { color: colors.primary }]}>Bezahlt</Text>
                </View>
              </View>
              <Text style={[styles.small, { color: colors.textSecondary }]}>
                {formatEuro(s.paidPackage.price_cents)} · DanceCup Livestream · Rechnung per E-Mail
              </Text>
            </View>

            <View style={[styles.card, { borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>So geht es weiter</Text>
              {steps.map((st, i) => (
                <View key={st.label} style={styles.step}>
                  <View style={styles.stepRail}>
                    <View style={[styles.dot, {
                      backgroundColor: st.done ? colors.primary : colors.background,
                      borderColor: st.done || i === current ? colors.primary : colors.border,
                    }]}>
                      {st.done ? <Text style={styles.dotCheck}>✓</Text> : null}
                    </View>
                    {i < steps.length - 1 ? <View style={[styles.line, { backgroundColor: st.done ? colors.primary : colors.border }]} /> : null}
                  </View>
                  <View style={styles.stepText}>
                    <Text style={[styles.stepLabel, { color: i === current || st.done ? colors.textPrimary : colors.textSecondary }]}>{st.label}</Text>
                    {st.hint ? <Text style={[styles.small, { color: colors.textTertiary }]}>{st.hint}</Text> : null}
                  </View>
                </View>
              ))}
            </View>

            {isCustom && menu.length ? (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{source === 'listings' ? 'Angebote' : 'Gerichte'} für euren Spot</Text>
                <Text style={[styles.small, { color: colors.textSecondary }]}>
                  Wählt bis zu {MAX_SPOT_DISHES} {source === 'listings' ? 'Angebote aus eurem Marktplatz' : 'Gerichte aus eurer Speisekarte'}. Die Reihenfolge der Auswahl ist die Reihenfolge im Spot.
                </Text>
                <View style={styles.grid}>
                  {menu.map((d) => {
                    const pos = selected.indexOf(d.id);
                    const on = pos >= 0;
                    return (
                      <Pressable key={d.id} onPress={() => toggle(d.id)} style={[styles.tile, { width: tileSize }]}
                        accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={d.name}>
                        <View style={[styles.tileImgWrap, { width: tileSize, height: tileSize, borderColor: on ? colors.primary : 'transparent' }]}>
                          <Image source={{ uri: d.image_url }} style={styles.tileImg} contentFit="cover" />
                          {on ? (
                            <View style={[styles.badge, { backgroundColor: colors.primary }]}><Text style={styles.badgeText}>{pos + 1}</Text></View>
                          ) : null}
                        </View>
                        <Text style={[styles.tileName, { color: colors.textPrimary }]} numberOfLines={2}>{d.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Pressable onPress={save} disabled={!dirty || saving || !selected.length}
                  style={[styles.cta, { backgroundColor: colors.primary, opacity: !dirty || saving || !selected.length ? 0.5 : 1 }]} accessibilityRole="button">
                  <Text style={[styles.ctaText, { color: colors.onPrimary }]}>
                    {saving ? 'Wird gespeichert …' : dirty ? `Auswahl speichern (${selected.length})` : 'Auswahl gespeichert'}
                  </Text>
                </Pressable>
              </View>
            ) : isCustom && source === 'none' ? (
              <View style={[styles.card, { borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Was soll in euren Spot?</Text>
                <Text style={[styles.small, { color: colors.textSecondary }]}>
                  {hasRestaurant
                    ? 'Eure Speisekarte hat noch keine Fotos. Fügt Gerichte mit Fotos hinzu – dann könnt ihr sie hier auswählen.'
                    : 'Legt ein Produkt oder Angebot mit Foto an – dann könnt ihr es hier für euren Spot auswählen. Oder schickt uns Fotos per WhatsApp.'}
                </Text>
                <Pressable
                  onPress={() => (hasRestaurant
                    ? router.push('/org/menu' as any)
                    : router.push({ pathname: '/create-listing', params: { listingType: 'product', accountId: s.orgId ?? undefined } } as any))}
                  style={[styles.cta, { backgroundColor: colors.primary }]} accessibilityRole="button">
                  <Text style={[styles.ctaText, { color: colors.onPrimary }]}>{hasRestaurant ? 'Speisekarte bearbeiten' : 'Produkt oder Angebot anlegen'}</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={[styles.card, { borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Gut zu wissen</Text>
              {[
                'Samstag, 7. November – den ganzen Tag live',
                'In der Röbel App, auf YouTube und Facebook',
                isCustom ? 'Euer 15-Sekunden-Spot läuft in jeder Pause' : 'Euer Logo läuft im Vollbild in den Pausen',
                'Im Stream als „Werbung“ gekennzeichnet',
                'Die Rechnung kommt per E-Mail',
              ].map((line) => (
                <View key={line} style={styles.infoRow}>
                  <Text style={[styles.check, { color: colors.primary }]}>✓</Text>
                  <Text style={[styles.infoText, { color: colors.textPrimary }]}>{line}</Text>
                </View>
              ))}
            </View>

            <Pressable onPress={openWhatsApp} style={[styles.whatsapp]} accessibilityRole="button" accessibilityLabel="Fragen per WhatsApp stellen">
              <Text style={styles.whatsappText}>Fragen? Schreibt uns auf WhatsApp</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  scroll: { padding: 16, gap: 16 },
  empty: { gap: 16, paddingTop: 24 },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  pkgName: { flexShrink: 1, fontFamily: fontFamily.semiBold, fontSize: 17 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontFamily: fontFamily.semiBold, fontSize: 12 },
  section: { gap: 10 },
  sectionTitle: { fontFamily: fontFamily.semiBold, fontSize: 16, marginBottom: 2 },
  step: { flexDirection: 'row', gap: 12 },
  stepRail: { alignItems: 'center', width: 22 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dotCheck: { color: '#FFFFFF', fontFamily: fontFamily.bold, fontSize: 12 },
  line: { width: 2, flex: 1, minHeight: 14, marginVertical: 2 },
  stepText: { flex: 1, paddingBottom: 12, gap: 2 },
  stepLabel: { fontFamily: fontFamily.medium, fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { gap: 4 },
  tileImgWrap: { borderRadius: 12, borderWidth: 3, overflow: 'hidden' },
  tileImg: { width: '100%', height: '100%' },
  badge: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFFFFF', fontFamily: fontFamily.bold, fontSize: 13 },
  tileName: { fontFamily: fontFamily.medium, fontSize: 12, lineHeight: 15 },
  infoRow: { flexDirection: 'row', gap: 8 },
  check: { fontFamily: fontFamily.bold, fontSize: 13, lineHeight: 20 },
  infoText: { flex: 1, fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  cta: { borderRadius: 999, paddingVertical: 15, alignItems: 'center' },
  ctaText: { fontFamily: fontFamily.semiBold, fontSize: 17 },
  whatsapp: { borderRadius: 999, paddingVertical: 15, alignItems: 'center', backgroundColor: '#128C7E' },
  whatsappText: { fontFamily: fontFamily.semiBold, fontSize: 16, color: '#FFFFFF' },
});
