import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { fontFamily } from '@/constants/theme';
import {
  bookPackage, bookingStatusLabel, fetchCampaign, fetchMyBookings, formatDeadline, formatEuro, IMAGE_MIMES,
  isBookingOpen, isMediaOptional, MAX_IMAGE_BYTES, slotsLeft, uploadSponsoringMedia,
  type CampaignView, type MediaKind, type SponsoringBooking,
} from '@/lib/sponsoring';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

const NAVY = '#00498B';
const NAVY_DEEP = '#002B55';

type Picked = { uri: string; mimeType: string | null; kind: MediaKind; label: string };
type Done = { packageName: string; paymentLink: string | null };

export default function SponsoringDetailScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { activeAccount } = useAccount();
  const thirdwebAccount = useActiveAccount();
  // The wallet object can change identity between renders; read the signer from a ref.
  const signerRef = useRef(thirdwebAccount);
  signerRef.current = thirdwebAccount;

  const isOrg = activeAccount?.account_type === 'organisation';
  const [view, setView] = useState<CampaignView | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [bookings, setBookings] = useState<SponsoringBooking[] | null>(null);

  const load = useCallback(async () => {
    if (!slug) return;
    setView(await fetchCampaign(slug));
    setLoading(false);
  }, [slug]);
  useEffect(() => { load(); }, [load]);

  const selected = view?.packages.find((p) => p.id === selectedId) ?? null;
  const open = view ? isBookingOpen(view.campaign) : false;

  const choosePackage = (id: string) => {
    setSelectedId((cur) => (cur === id ? null : id));
    setPicked(null);
    setDone(null);
  };

  const pickMedia = async (kind: MediaKind) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Zugriff benötigt', 'Bitte erlaube den Zugriff auf deine Fotos, um eine Datei auszuwählen.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: [kind === 'video' ? 'videos' : 'images'],
      quality: 1,
      allowsEditing: false,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if (kind === 'image') {
      if (a.mimeType && !IMAGE_MIMES[a.mimeType]) {
        Alert.alert('Dateiformat', 'Bitte wähle ein PNG, JPG oder WebP.');
        return;
      }
      if (a.fileSize && a.fileSize > MAX_IMAGE_BYTES) {
        Alert.alert('Datei zu groß', 'Das Logo darf höchstens 10 MB groß sein.');
        return;
      }
    } else {
      const maxSec = selected?.max_video_seconds ?? 30;
      const sec = a.duration ? a.duration / 1000 : 0;
      if (sec > maxSec + 1) {
        Alert.alert('Video zu lang', `Das Video darf höchstens ${maxSec} Sekunden lang sein.`);
        return;
      }
    }
    setPicked({
      uri: a.uri, mimeType: a.mimeType ?? null, kind,
      label: kind === 'video' ? `Video${a.duration ? ` · ${Math.round(a.duration / 1000)} s` : ''}` : 'Logo',
    });
  };

  const submit = async () => {
    const signer = signerRef.current;
    if (!selected || !signer || !activeAccount?.id) return;
    if (!isMediaOptional(selected) && !picked) {
      Alert.alert('Datei fehlt', 'Bitte ladet euer Logo oder Video hoch.');
      return;
    }
    let mediaUrl: string | null = null;
    if (picked) {
      setBusy(picked.kind === 'video' ? 'Video wird hochgeladen …' : 'Logo wird hochgeladen …');
      mediaUrl = await uploadSponsoringMedia(picked, picked.kind, signer.address, (f) => {
        if (picked.kind === 'video') setBusy(`Video wird hochgeladen … ${Math.round(f * 100)} %`);
      });
      if (!mediaUrl) {
        setBusy(null);
        Alert.alert('Upload fehlgeschlagen', 'Bitte versuche es erneut.');
        return;
      }
    }
    setBusy('Anfrage wird gesendet …');
    const res = await bookPackage(signer, {
      orgAccountId: activeAccount.id, packageId: selected.id,
      mediaKind: picked ? picked.kind : null, mediaUrl, note,
    });
    setBusy(null);
    if (!res.ok) {
      Alert.alert('Anfrage nicht möglich', res.message);
      load();
      return;
    }
    setDone({ packageName: selected.name, paymentLink: res.data.payment_link_url });
    setBookings((cur) => (cur ? [res.data.booking, ...cur] : cur));
    setPicked(null);
    setNote('');
    load();
  };

  const loadMine = async () => {
    const signer = signerRef.current;
    if (!signer || !activeAccount?.id || !slug) return;
    setBusy('Anfragen werden geladen …');
    const res = await fetchMyBookings(signer, activeAccount.id, slug);
    setBusy(null);
    if (!res.ok) {
      Alert.alert('Nicht möglich', res.message);
      return;
    }
    setBookings(res.data.bookings);
  };

  const packageName = (id: string) => view?.packages.find((p) => p.id === id)?.name ?? 'Paket';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={8} accessibilityLabel="Zurück">
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>Werbeplätze</Text>
        <View style={styles.backButton} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : !view ? (
        <View style={styles.center}>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>Dieses Angebot ist gerade nicht verfügbar.</Text>
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <LinearGradient colors={[NAVY, NAVY_DEEP]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              {view.campaign.hero_image_url ? (
                <Image source={{ uri: view.campaign.hero_image_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : null}
              <View style={styles.liveRow}>
                <View style={styles.liveDot} />
                <Text style={styles.heroEyebrow}>Livestream · Sa 7.11. · {view.campaign.venue ?? 'Röbel'}</Text>
              </View>
              <Text style={styles.heroTitle}>{view.campaign.title}</Text>
              {view.campaign.subtitle ? <Text style={styles.heroSubtitle}>{view.campaign.subtitle}</Text> : null}
            </LinearGradient>

            {view.campaign.description ? (
              <Text style={[styles.body, { color: colors.textPrimary }]}>{view.campaign.description}</Text>
            ) : null}

            <View style={styles.highlights}>
              {view.campaign.highlights.map((h) => (
                <View key={h} style={styles.bulletRow}>
                  <Text style={[styles.check, { color: colors.primary }]}>✓</Text>
                  <Text style={[styles.bulletText, { color: colors.textPrimary }]}>{h}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.deadline, { backgroundColor: colors.surface }]}>
              <Text style={[styles.deadlineText, { color: colors.textPrimary }]}>
                {open ? `Buchbar bis ${formatDeadline(view.campaign.booking_deadline)}` : 'Die Buchungsfrist ist abgelaufen.'}
              </Text>
              <Text style={[styles.small, { color: colors.textSecondary }]}>
                Alle Werbeplätze werden im Stream als „Werbung“ gekennzeichnet.
              </Text>
            </View>

            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Pakete</Text>
            {view.packages.map((p) => {
              const left = slotsLeft(p);
              const soldOut = left === 0;
              const isSel = p.id === selectedId;
              return (
                <View
                  key={p.id}
                  style={[styles.pkg, { borderColor: isSel ? colors.primary : colors.border, backgroundColor: colors.background }]}
                >
                  <View style={styles.pkgHead}>
                    <Text style={[styles.pkgName, { color: colors.textPrimary }]}>{p.name}</Text>
                    <Text style={[styles.pkgPrice, { color: colors.textPrimary }]}>{formatEuro(p.price_cents)}</Text>
                  </View>
                  {p.description ? <Text style={[styles.small, { color: colors.textSecondary }]}>{p.description}</Text> : null}
                  <View style={styles.includes}>
                    {p.includes.map((i) => (
                      <View key={i} style={styles.bulletRow}>
                        <Text style={[styles.dot, { color: colors.textSecondary }]}>•</Text>
                        <Text style={[styles.bulletText, { color: colors.textPrimary }]}>{i}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.pkgFoot}>
                    <Text style={[styles.small, { color: soldOut ? colors.error : colors.textSecondary }]}>
                      {left == null ? '' : soldOut ? 'Ausgebucht' : `Noch ${left} von ${p.capacity} frei`}
                    </Text>
                    {open && !soldOut && isOrg ? (
                      <Pressable
                        onPress={() => choosePackage(p.id)}
                        style={[styles.selectBtn, isSel ? { backgroundColor: colors.surface } : { backgroundColor: colors.primary }]}
                        accessibilityRole="button"
                      >
                        <Text style={[styles.selectText, { color: isSel ? colors.textPrimary : colors.onPrimary }]}>
                          {isSel ? 'Schließen' : 'Auswählen'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>

                  {isSel && !done ? (
                    <View style={styles.form}>
                      {p.accepts.map((kind) => (
                        <Pressable
                          key={kind}
                          onPress={() => pickMedia(kind)}
                          style={[styles.drop, { borderColor: colors.border, backgroundColor: colors.surface }]}
                          accessibilityRole="button"
                        >
                          {picked?.kind === kind ? (
                            <>
                              {kind === 'image' ? (
                                <Image source={{ uri: picked.uri }} style={styles.preview} contentFit="contain" />
                              ) : null}
                              <Text style={[styles.dropTitle, { color: colors.textPrimary }]}>{picked.label} ausgewählt · ändern</Text>
                            </>
                          ) : (
                            <>
                              <Text style={[styles.dropTitle, { color: colors.textPrimary }]}>
                                {kind === 'image'
                                  ? isMediaOptional(p) ? 'Logo hochladen (optional)' : 'Logo hochladen'
                                  : 'Video hochladen'}
                              </Text>
                              <Text style={[styles.small, { color: colors.textSecondary }]}>
                                {kind === 'image'
                                  ? 'PNG mit transparentem Hintergrund, mind. 1000 px breit'
                                  : `MP4, 15–${p.max_video_seconds ?? 30} Sekunden, Querformat 16:9`}
                              </Text>
                            </>
                          )}
                        </Pressable>
                      ))}
                      <TextInput
                        value={note}
                        onChangeText={setNote}
                        placeholder="Nachricht an uns (optional)"
                        placeholderTextColor={colors.textTertiary}
                        multiline
                        maxLength={500}
                        style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
                      />
                      <Pressable
                        onPress={submit}
                        disabled={!!busy}
                        style={[styles.submit, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}
                        accessibilityRole="button"
                      >
                        {busy ? (
                          <Text style={[styles.submitText, { color: colors.onPrimary }]}>{busy}</Text>
                        ) : (
                          <Text style={[styles.submitText, { color: colors.onPrimary }]}>
                            Verbindlich anfragen · {formatEuro(p.price_cents)}
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  ) : null}

                  {isSel && done ? (
                    <View style={[styles.doneBox, { backgroundColor: colors.primaryLight }]}>
                      <Text style={[styles.doneTitle, { color: colors.textPrimary }]}>Danke!</Text>
                      <Text style={[styles.bulletText, { color: colors.textPrimary }]}>
                        Eure Anfrage für „{done.packageName}“ ist eingegangen. Wir melden uns innerhalb von 24 Stunden
                        mit der Rechnung bzw. dem Zahlungslink.
                      </Text>
                      {done.paymentLink ? (
                        <Pressable
                          onPress={() => {
                            const link = done.paymentLink;
                            if (link) WebBrowser.openBrowserAsync(link);
                          }}
                          style={[styles.submit, { backgroundColor: colors.primary }]}
                          accessibilityRole="button"
                        >
                          <Text style={[styles.submitText, { color: colors.onPrimary }]}>Jetzt bezahlen</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}

            {!isOrg ? (
              <Text style={[styles.small, { color: colors.textSecondary }]}>
                Wechsle zu deinem Vereins- oder Geschäftskonto, um einen Werbeplatz zu buchen.
              </Text>
            ) : bookings ? (
              <View style={styles.mine}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Eure Anfragen</Text>
                {bookings.length === 0 ? (
                  <Text style={[styles.small, { color: colors.textSecondary }]}>Noch keine Anfragen.</Text>
                ) : bookings.map((b) => (
                  <View key={b.id} style={[styles.mineRow, { borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.bulletText, { color: colors.textPrimary }]}>{packageName(b.package_id)}</Text>
                      {b.status === 'rejected' && b.review_note ? (
                        <Text style={[styles.small, { color: colors.textSecondary }]}>{b.review_note}</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.small, { color: b.status === 'rejected' ? colors.error : colors.textSecondary }]}>
                      {bookingStatusLabel(b.status)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Pressable onPress={loadMine} disabled={!!busy} style={styles.mineLink} accessibilityRole="button">
                <Text style={[styles.mineLinkText, { color: colors.primary }]}>Meine Anfragen anzeigen</Text>
              </Pressable>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { fontFamily: fontFamily.regular, fontSize: 15, textAlign: 'center' },
  scroll: { padding: 16, paddingBottom: 48, gap: 16 },
  hero: { borderRadius: 14, padding: 20, paddingTop: 28, gap: 8, overflow: 'hidden', minHeight: 170, justifyContent: 'flex-end' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF4D4F' },
  heroEyebrow: { fontFamily: fontFamily.medium, fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  heroTitle: { fontFamily: fontFamily.heading, fontSize: 26, color: '#FFFFFF' },
  heroSubtitle: { fontFamily: fontFamily.regular, fontSize: 15, color: 'rgba(255,255,255,0.9)' },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 22 },
  highlights: { gap: 8 },
  bulletRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  check: { fontFamily: fontFamily.bold, fontSize: 15, lineHeight: 21 },
  dot: { fontFamily: fontFamily.bold, fontSize: 15, lineHeight: 21 },
  bulletText: { flex: 1, fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21 },
  deadline: { borderRadius: 12, padding: 14, gap: 4 },
  deadlineText: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  small: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18 },
  sectionTitle: { fontFamily: fontFamily.heading, fontSize: 20, marginTop: 8 },
  pkg: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 8 },
  pkgHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  pkgName: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: 17 },
  pkgPrice: { fontFamily: fontFamily.heading, fontSize: 20 },
  includes: { gap: 4 },
  pkgFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, minHeight: 36 },
  selectBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999 },
  selectText: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  form: { gap: 10, marginTop: 8 },
  drop: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: 16, alignItems: 'center', gap: 4 },
  dropTitle: { fontFamily: fontFamily.semiBold, fontSize: 15, textAlign: 'center' },
  preview: { width: 160, height: 80, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 72, fontFamily: fontFamily.regular, fontSize: 15, textAlignVertical: 'top' },
  submit: { borderRadius: 999, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  submitText: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  doneBox: { borderRadius: 12, padding: 14, gap: 6, marginTop: 8 },
  doneTitle: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  mine: { gap: 8 },
  mineRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  mineLink: { alignSelf: 'center', padding: 12 },
  mineLinkText: { fontFamily: fontFamily.semiBold, fontSize: 15 },
});
