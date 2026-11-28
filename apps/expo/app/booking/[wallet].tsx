import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActiveAccount } from 'thirdweb/react';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { fontFamily } from '@/constants/theme';
import {
  GERMAN_MONTHS,
  GERMAN_WEEKDAYS,
  berlinParts,
  bookSlot,
  confirmBooking,
  fetchBookingInfo,
  openCalendlyConfirm,
  type BookingInfo,
} from '@/lib/booking';

type Slot = { iso: string; hm: string };
const WD_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MON_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/**
 * Airbnb-style booking on a seller's Calendly: "Wann?" (month calendar → folds into a day strip with the
 * free times right below) → "Deine Angaben" → /booking/danke.
 * Params: wallet (seller), listingId/listingTitle/listingImage (for the success card + chat message).
 */
export default function BookingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useUser();
  const account = useActiveAccount();
  const p = useLocalSearchParams<{ wallet: string; listingId?: string; listingTitle?: string; listingImage?: string }>();
  const wallet = String(p.wallet ?? '').toLowerCase();

  const [info, setInfo] = useState<BookingInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<'when' | 'details'>('when');
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [calOpen, setCalOpen] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  // The bottom bar hides while typing, so it never covers the focused field.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
    const b = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => { a.remove(); b.remove(); };
  }, []);

  useEffect(() => {
    const n = (user as { display_name?: string | null; username?: string | null } | null)?.display_name || user?.username || '';
    if (n && !n.startsWith('0x')) setName((v) => v || n);
    const e = (user as { email?: string | null } | null)?.email;
    if (e) setEmail((v) => v || e);
  }, [user]);

  const load = () => {
    setLoadError(null);
    void fetchBookingInfo(wallet).then((r) => (r.ok ? setInfo(r.data) : setLoadError(r.message)));
  };
  useEffect(load, [wallet]);

  const et = info?.event_types.find((e) => e.uri === info.event_type) ?? info?.event_types[0] ?? null;
  const byDay = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const iso of info?.slots ?? []) {
      const b = berlinParts(iso);
      const list = m.get(b.key) ?? [];
      list.push({ iso, hm: b.hm });
      m.set(b.key, list);
    }
    return m;
  }, [info]);

  const months = useMemo(() => {
    const keys = [...byDay.keys()].sort();
    const now = berlinParts(new Date().toISOString());
    const last = keys.length ? keys[keys.length - 1] : now.key;
    const [ly, lm] = last.split('-').map(Number);
    const out: { label: string; cells: ({ key: string; d: number } | null)[] }[] = [];
    let y = now.y, m = now.m;
    while (y < ly || (y === ly && m <= lm - 1)) {
      const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
      const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const cells: ({ key: string; d: number } | null)[] = Array.from({ length: lead }, () => null);
      for (let d = 1; d <= days; d++) cells.push({ key: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, d });
      out.push({ label: `${GERMAN_MONTHS[m]} ${y}`, cells });
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
    return out;
  }, [byDay]);

  const ink = colors.textPrimary;
  const card = colors.surface;
  const dayLabel = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return `${GERMAN_WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d}. ${GERMAN_MONTHS[m - 1]}`;
  };

  const pickDay = (k: string) => {
    setDay(k);
    setSlot(null);
    setCalOpen(false);
  };

  const finish = (bookingId: string) => {
    if (!et || !slot) return;
    router.replace({
      pathname: '/booking/danke',
      params: {
        bookingId,
        start: slot.iso,
        duration: String(et.duration),
        title: et.name,
        location: et.location_kind ?? '',
        sellerWallet: wallet,
        sellerAccountId: info?.seller.account_id ?? '',
        sellerName: info?.seller.name ?? '',
        listingId: p.listingId ?? '',
        listingTitle: p.listingTitle ?? '',
        listingImage: p.listingImage ?? '',
      },
    } as any);
  };

  const checkPending = async (id: string) => {
    setBusy(true);
    const st = await confirmBooking(id);
    setBusy(false);
    if (st === 'booked') finish(id);
    else setError(st === 'failed'
      ? 'Die Buchung hat nicht geklappt. Bitte wähle eine andere Zeit.'
      : 'Noch nicht bestätigt. Hast du auf der Calendly-Seite „Termin planen“ getippt?');
  };

  const submit = async () => {
    if (!et || !slot || busy) return;
    Keyboard.dismiss();
    setError(null);
    if (!name.trim()) return setError('Bitte gib deinen Namen an.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError('Bitte gib eine gültige E-Mail-Adresse an.');
    if (et.location_kind === 'outbound_call' && phone.replace(/\D/g, '').length < 6) return setError('Bitte gib deine Telefonnummer an.');
    setBusy(true);
    const r = await bookSlot(wallet, {
      eventType: et.uri, startTime: slot.iso, name: name.trim(), email: email.trim(), phone: phone.trim(), answer: answer.trim(), bookerWallet: account?.address,
    });
    if (!r.ok) {
      setBusy(false);
      setError(r.message);
      return;
    }
    if (r.data.status === 'booked') {
      setBusy(false);
      finish(r.data.booking_id);
      return;
    }
    // Fallback until the seller's Calendly key can write: confirm on Calendly's page for this exact slot.
    setPendingId(r.data.booking_id);
    setPendingUrl(r.data.url);
    setBusy(false);
    await openCalendlyConfirm(r.data.url);
    await checkPending(r.data.booking_id);
  };

  const strip = [...byDay.keys()].sort();
  const times = day ? byDay.get(day) ?? [] : [];

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Text style={[styles.headerTitle, { color: ink }]} numberOfLines={1}>
        {info?.seller.name ? `Termin bei ${info.seller.name.split(' ')[0]}` : 'Termin buchen'}
      </Text>
      <Pressable onPress={() => router.back()} style={[styles.close, { backgroundColor: card }]} accessibilityRole="button" accessibilityLabel="Schließen">
        <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth={2.6} strokeLinecap="round">
          <Path d="M6 6l12 12M18 6L6 18" />
        </Svg>
      </Pressable>
    </View>
  );

  if (!info) {
    return (
      <View style={[styles.root, { backgroundColor: colors.backdrop }]}>
        {header}
        <View style={styles.center}>
          {loadError ? (
            <>
              <Text style={[styles.muted, { color: colors.textSecondary }]}>{loadError}</Text>
              <Pressable onPress={load} style={[styles.retry, { borderColor: ink }]} accessibilityRole="button">
                <Text style={[styles.retryText, { color: ink }]}>Erneut versuchen</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator color={ink} />
          )}
        </View>
      </View>
    );
  }

  const whatRow = (
    <View style={[styles.row, { backgroundColor: card }]}>
      <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Was</Text>
      <Text style={[styles.rowValue, { color: ink }]} numberOfLines={2}>
        {et ? `${et.name} · ${et.duration} Min.` : ''}
      </Text>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.backdrop }]}>
      {header}
      <KeyboardAwareScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        enableOnAndroid
        enableAutomaticScroll
        extraScrollHeight={Platform.OS === 'ios' ? 24 : 80}
        extraHeight={120}
      >
        {whatRow}

        {step === 'details' && slot && day ? (
          <Pressable onPress={() => setStep('when')} style={[styles.row, { backgroundColor: card }]} accessibilityRole="button" accessibilityLabel="Termin ändern">
            <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Wann</Text>
            <Text style={[styles.rowValue, { color: ink }]}>{`${dayLabel(day).replace(/^(\w{2})\w*/, '$1.')} · ${slot.hm}`}</Text>
          </Pressable>
        ) : null}

        {step === 'when' ? (
          <View style={[styles.card, { backgroundColor: card }]}>
            <Text style={[styles.h2, { color: ink }]}>Wann?</Text>
            {strip.length === 0 ? (
              <Text style={[styles.muted, { color: colors.textSecondary }]}>In den nächsten zwei Wochen sind leider keine Termine frei.</Text>
            ) : calOpen ? (
              <>
                <View style={styles.weekRow}>
                  {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => (
                    <Text key={w} style={[styles.weekDay, { color: colors.textSecondary }]}>{w}</Text>
                  ))}
                </View>
                {months.map((mo) => (
                  <View key={mo.label} style={styles.month}>
                    <Text style={[styles.monthLabel, { color: ink }]}>{mo.label}</Text>
                    <View style={styles.grid}>
                      {mo.cells.map((c, i) => {
                        if (!c) return <View key={`b${i}`} style={styles.cell} />;
                        const free = byDay.has(c.key);
                        const sel = day === c.key;
                        return (
                          <View key={c.key} style={styles.cell}>
                            <Pressable
                              disabled={!free}
                              onPress={() => pickDay(c.key)}
                              style={[styles.dayBtn, sel && { backgroundColor: ink }]}
                              accessibilityRole="button"
                              accessibilityState={{ disabled: !free, selected: sel }}
                              accessibilityLabel={`${dayLabel(c.key)}${free ? ', freie Termine' : ', nicht verfügbar'}`}
                            >
                              <Text
                                style={[
                                  styles.dayText,
                                  { color: sel ? colors.background : free ? ink : colors.textTertiary },
                                  !free && styles.dayOff,
                                ]}
                              >
                                {c.d}
                              </Text>
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </>
            ) : (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} style={styles.stripWrap}>
                  {strip.map((k) => {
                    const [y, m, d] = k.split('-').map(Number);
                    const sel = day === k;
                    return (
                      <Pressable
                        key={k}
                        onPress={() => { setDay(k); setSlot(null); }}
                        style={[styles.stripDay, { borderColor: sel ? ink : colors.border, backgroundColor: sel ? ink : card }]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: sel }}
                        accessibilityLabel={dayLabel(k)}
                      >
                        <Text style={[styles.stripWd, { color: sel ? colors.background : ink }]}>{WD_SHORT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}</Text>
                        <Text style={[styles.stripD, { color: sel ? colors.background : ink }]}>{d}</Text>
                        <Text style={[styles.stripMon, { color: sel ? colors.background : ink }]}>{MON_SHORT[m - 1]}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                {day ? (
                  <Text style={[styles.dayHead, { color: ink }]}>
                    {dayLabel(day)} · {times.length} {times.length === 1 ? 'freie Zeit' : 'freie Zeiten'}
                  </Text>
                ) : null}
                <View style={styles.times}>
                  {times.map((t) => {
                    const sel = slot?.iso === t.iso;
                    return (
                      <Pressable
                        key={t.iso}
                        onPress={() => setSlot(t)}
                        style={[styles.timeBtn, { borderColor: sel ? ink : colors.border, backgroundColor: sel ? ink : card }]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: sel }}
                        accessibilityLabel={`${t.hm} Uhr`}
                      >
                        <Text style={[styles.timeText, { color: sel ? colors.background : ink }]}>{t.hm}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Pressable onPress={() => setCalOpen(true)} style={styles.linkBtn} accessibilityRole="button">
                  <Text style={[styles.link, { color: ink }]}>Ganzen Kalender anzeigen</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: card }]}>
            <Text style={[styles.h2, { color: ink }]}>Deine Angaben</Text>
            <Field label="Name" value={name} onChange={setName} colors={colors} autoComplete="name" />
            <Field label="E-Mail – für die Bestätigung" value={email} onChange={setEmail} colors={colors} keyboardType="email-address" autoComplete="email" />
            {et?.location_kind === 'outbound_call' ? (
              <Field label={`Telefonnummer – ${info.seller.name?.split(' ')[0] ?? 'wir'} ruft dich an`} value={phone} onChange={setPhone} colors={colors} keyboardType="phone-pad" autoComplete="tel" placeholder="+49 …" />
            ) : null}
            {et?.question ? (
              <Field label={`${et.question} (optional)`} value={answer} onChange={setAnswer} colors={colors} multiline placeholder="z. B. deine Ziele, Verletzungen, Erfahrung" />
            ) : null}
            {pendingId && pendingUrl ? (
              <View style={styles.pendingRow}>
                <Pressable onPress={() => openCalendlyConfirm(pendingUrl).then(() => checkPending(pendingId))} style={[styles.retry, { borderColor: ink }]} accessibilityRole="button">
                  <Text style={[styles.retryText, { color: ink }]}>Calendly öffnen</Text>
                </Pressable>
                <Pressable onPress={() => checkPending(pendingId)} style={[styles.retry, { borderColor: ink }]} accessibilityRole="button">
                  <Text style={[styles.retryText, { color: ink }]}>Erneut prüfen</Text>
                </Pressable>
              </View>
            ) : null}
            {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
          </View>
        )}
      </KeyboardAwareScrollView>

      {!keyboardOpen && (
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: colors.backdrop }]}>
        <Pressable
          onPress={() => (step === 'when' ? (setDay(null), setSlot(null), setCalOpen(true)) : setStep('when'))}
          style={styles.backBtn}
          accessibilityRole="button"
        >
          <Text style={[styles.backText, { color: ink }]}>{step === 'when' ? 'Zurücksetzen' : 'Zurück'}</Text>
        </Pressable>
        <Pressable
          onPress={() => (step === 'when' ? slot && setStep('details') : submit())}
          disabled={(step === 'when' && !slot) || busy}
          style={[styles.next, { backgroundColor: (step === 'when' && !slot) ? colors.border : ink }]}
          accessibilityRole="button"
          accessibilityState={{ disabled: (step === 'when' && !slot) || busy }}
        >
          {busy ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={[styles.nextText, { color: (step === 'when' && !slot) ? colors.textSecondary : colors.background }]}>
              {step === 'when' ? 'Weiter' : 'Termin buchen'}
            </Text>
          )}
        </Pressable>
      </View>
      )}
    </View>
  );
}

function Field(props: {
  label: string; value: string; onChange: (v: string) => void; colors: ReturnType<typeof useTheme>['colors'];
  keyboardType?: 'email-address' | 'phone-pad'; autoComplete?: 'name' | 'email' | 'tel'; multiline?: boolean; placeholder?: string;
}) {
  const { colors } = props;
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChange}
        keyboardType={props.keyboardType}
        autoComplete={props.autoComplete}
        autoCapitalize={props.keyboardType === 'email-address' ? 'none' : 'sentences'}
        multiline={props.multiline}
        placeholder={props.placeholder}
        placeholderTextColor={colors.textTertiary}
        style={[styles.input, props.multiline && styles.inputMulti, { borderColor: colors.border, color: colors.textPrimary }]}
        accessibilityLabel={props.label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  headerTitle: { fontFamily: fontFamily.semiBold, fontSize: 16, flex: 1 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 14, paddingBottom: 130, gap: 12 },
  row: { borderRadius: 18, paddingHorizontal: 20, paddingVertical: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  rowLabel: { fontFamily: fontFamily.regular, fontSize: 14 },
  rowValue: { fontFamily: fontFamily.semiBold, fontSize: 14, flexShrink: 1, textAlign: 'right' },
  card: { borderRadius: 28, paddingHorizontal: 18, paddingTop: 24, paddingBottom: 18, gap: 14 },
  h2: { fontFamily: fontFamily.heading, fontSize: 28, marginHorizontal: 6 },
  muted: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  weekRow: { flexDirection: 'row' },
  weekDay: { flex: 1, textAlign: 'center', fontFamily: fontFamily.medium, fontSize: 12 },
  month: { gap: 6 },
  monthLabel: { fontFamily: fontFamily.bold, fontSize: 16, marginHorizontal: 6, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 },
  cell: { width: `${100 / 7}%`, alignItems: 'center' },
  dayBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  dayOff: { textDecorationLine: 'line-through', fontFamily: fontFamily.medium },
  stripWrap: { marginHorizontal: -18 },
  strip: { paddingHorizontal: 18, gap: 8 },
  stripDay: { width: 58, height: 72, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 1 },
  stripWd: { fontFamily: fontFamily.medium, fontSize: 12 },
  stripD: { fontFamily: fontFamily.bold, fontSize: 18 },
  stripMon: { fontFamily: fontFamily.medium, fontSize: 11 },
  dayHead: { fontFamily: fontFamily.semiBold, fontSize: 15, marginHorizontal: 6 },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeBtn: { width: '23.2%', height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  timeText: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  linkBtn: { alignSelf: 'flex-start', marginHorizontal: 6, minHeight: 36, justifyContent: 'center' },
  link: { fontFamily: fontFamily.semiBold, fontSize: 14, textDecorationLine: 'underline' },
  field: { gap: 6 },
  fieldLabel: { fontFamily: fontFamily.regular, fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 50, fontFamily: fontFamily.regular, fontSize: 16 },
  inputMulti: { height: 96, paddingTop: 12, textAlignVertical: 'top' },
  pendingRow: { flexDirection: 'row', gap: 10 },
  retry: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 16, height: 44, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  error: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 18 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 12, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { height: 48, justifyContent: 'center' },
  backText: { fontFamily: fontFamily.semiBold, fontSize: 16, textDecorationLine: 'underline' },
  next: { height: 52, paddingHorizontal: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minWidth: 150 },
  nextText: { fontFamily: fontFamily.semiBold, fontSize: 16 },
});
