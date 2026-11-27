import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActiveAccount } from 'thirdweb/react';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useAccount } from '@/context/AccountContext';
import { isOrgAccount } from '@/lib/types';
import { fontFamily } from '@/constants/theme';
import { ChevronLeft } from '@/components/Icons';
import ChristmasGarland from '@/components/christmas/ChristmasGarland';
import {
  SUPPORT_MAX_EUR,
  SUPPORT_MESSAGE_MAX,
  SUPPORT_MIN_EUR,
  SUPPORT_PRESETS,
  fetchSupporters,
  openAppSupportCheckout,
  startAppSupport,
  timeAgo,
  type Supporter,
  type SupportInterval,
} from '@/lib/app-support';

// Röbel in winter: St. Nikolai, the windmill, the harbour. One per visit.
const HEROES = [
  { src: require('@/assets/illustration/christmas/support_hero_nikolai.webp'), label: 'Zwei junge Frauen mit einer kleinen Tanne vor der Nikolaikirche in Röbel' },
  { src: require('@/assets/illustration/christmas/support_hero_muehle.webp'), label: 'Zwei junge Frauen mit einer kleinen Tanne vor der Röbeler Windmühle' },
  { src: require('@/assets/illustration/christmas/support_hero_hafen.webp'), label: 'Zwei junge Frauen mit einer kleinen Tanne am Röbeler Hafen an der Müritz' },
];
const AGB_URL = 'https://www.roebel.app/agb';

function euro(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "Röbel App unterstützen" — one-time or monthly support via Stripe Checkout. */
export default function UnterstuetzenScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, variant } = useTheme();
  const account = useActiveAccount();
  const [interval, setPeriod] = useState<SupportInterval>('once');
  const [amount, setAmount] = useState<number>(SUPPORT_PRESETS.once.popular);
  const [busy, setBusy] = useState(false);
  const [hero] = useState(() => HEROES[Math.floor(Math.random() * HEROES.length)]);
  const [error, setError] = useState<string | null>(null);
  const { user } = useUser();
  const { activeAccount } = useAccount();
  // Name comes from the active profile (org name for org accounts); guests type it.
  const profileName = (activeAccount && isOrgAccount(activeAccount) ? activeAccount.name : user?.display_name || user?.username) || '';
  const [name, setName] = useState(profileName);
  const [showName, setShowName] = useState(false);
  const [message, setMessage] = useState('');
  const [supporters, setSupporters] = useState<{ total: number; items: Supporter[] }>({ total: 0, items: [] });

  useEffect(() => {
    if (profileName && !name) setName(profileName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileName]);

  const loadSupporters = useCallback(() => {
    void fetchSupporters(50).then(setSupporters);
  }, []);
  useEffect(loadSupporters, [loadSupporters]);

  // The sticky pay bar hides while typing, so it never covers the focused field.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const presets = SUPPORT_PRESETS[interval];
  const valid = amount >= SUPPORT_MIN_EUR && amount <= SUPPORT_MAX_EUR;
  const ink = variant === 'light' ? '#0B1F3A' : colors.textPrimary;
  const chipBg = colors.surfaceSecondary;

  const pickInterval = (next: SupportInterval) => {
    setPeriod(next);
    setAmount(SUPPORT_PRESETS[next].popular);
    setError(null);
  };

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const r = await startAppSupport({
      amountEur: amount,
      interval,
      wallet: account?.address,
      displayName: name,
      showName: showName && !!name.trim(),
      message,
    });
    if (!r.ok) {
      setBusy(false);
      setError(r.message);
      return;
    }
    const result = await openAppSupportCheckout(r.url);
    setBusy(false);
    if (result === 'success') {
      router.replace({
        pathname: '/unterstuetzen/danke',
        params: {
          support_id: r.supportId,
          amount: String(amount),
          interval,
          name: showName && name.trim() ? name.trim() : '',
        },
      } as any);
    }
  };

  const hint =
    interval === 'month'
      ? `… gerade mal ${euro((amount * 12) / 52)} € pro Woche.`
      : 'Jeder Euro fließt in Betrieb und Entwicklung.';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Zurück" hitSlop={8}>
          <ChevronLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Röbel App unterstützen</Text>
      </View>

      {/* Every input (amount, name, comment) scrolls above the keyboard when focused, on both platforms. */}
      <KeyboardAwareScrollView
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        enableOnAndroid
        enableAutomaticScroll
        extraScrollHeight={Platform.OS === 'ios' ? 24 : 80}
        extraHeight={120}
      >
          <View>
            <Image source={hero.src} style={styles.hero} contentFit="cover" contentPosition={{ top: '40%', left: '50%' }} accessibilityLabel={hero.label} />
            <ChristmasGarland always style={styles.heroGarland} />
          </View>

          {(
            <>
              <View style={styles.intro}>
                <Text style={[styles.headline, { color: ink }]}>DEIN BEITRAG ZÄHLT!</Text>
                <Text style={[styles.sub, { color: colors.textSecondary }]}>Damit die Röbel App weiter wachsen kann.</Text>
              </View>

              <View style={[styles.segment, { backgroundColor: chipBg }]} accessibilityRole="tablist">
                {(
                  [
                    ['once', 'Einmalig'],
                    ['month', 'Monatlich'],
                  ] as const
                ).map(([id, label]) => {
                  const active = interval === id;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => pickInterval(id)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      style={[styles.segBtn, active && { backgroundColor: colors.background, borderColor: ink }]}
                    >
                      <Text style={[styles.segText, { color: active ? ink : colors.textSecondary }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.amounts}>
                {presets.amounts.map((v) => {
                  const selected = v === amount;
                  return (
                    <View key={v} style={styles.amountCell}>
                      <Pressable
                        onPress={() => {
                          setAmount(v);
                          setError(null);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`${v} Euro${v === presets.popular ? ', beliebt' : ''}`}
                        style={[
                          styles.amountBtn,
                          { backgroundColor: selected ? colors.background : chipBg, borderColor: selected ? ink : 'transparent' },
                        ]}
                      >
                        <Text style={[styles.amountText, { color: ink }]}>{v} €</Text>
                      </Pressable>
                      {v === presets.popular && (
                        <View style={[styles.popular, { backgroundColor: colors.primaryLight }]}>
                          <Text style={[styles.popularText, { color: colors.primary }]}>beliebt</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>

              <Text style={[styles.hint, { color: colors.textSecondary }]}>{hint}</Text>

              <View style={styles.inputRow}>
                <View style={[styles.inputBox, { borderColor: colors.border }]}>
                  <TextInput
                    value={amount ? String(amount) : ''}
                    onChangeText={(t) => {
                      const n = parseInt(t.replace(/\D/g, ''), 10);
                      setAmount(Number.isFinite(n) ? Math.min(n, SUPPORT_MAX_EUR) : 0);
                      setError(null);
                    }}
                    keyboardType="number-pad"
                    maxLength={3}
                    style={[styles.input, { color: ink }]}
                    accessibilityLabel="Eigener Betrag in Euro"
                  />
                  <Text style={[styles.inputEuro, { color: ink }]}>€</Text>
                </View>
              </View>

              <View style={styles.form}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Dein Name"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={60}
                  style={[styles.field, { borderColor: colors.border, color: colors.textPrimary }]}
                  accessibilityLabel="Dein Name"
                />
                <Pressable
                  onPress={() => setShowName((v) => !v)}
                  style={styles.checkRow}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: showName }}
                >
                  <View style={[styles.checkbox, { borderColor: showName ? colors.primary : colors.border, backgroundColor: showName ? colors.primary : 'transparent' }]}>
                    {showName && (
                      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.onPrimary} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M5 12l5 5 9-10" />
                      </Svg>
                    )}
                  </View>
                  <Text style={[styles.checkText, { color: colors.textPrimary }]}>Meinen Namen öffentlich in der Liste zeigen</Text>
                </Pressable>
                {!showName && (
                  <Text style={[styles.checkHint, { color: colors.textSecondary }]}>Sonst erscheinst du als „Jemand“.</Text>
                )}
                {showName && (
                  <TextInput
                    value={message}
                    onChangeText={setMessage}
                    placeholder="Kommentar (optional)"
                    placeholderTextColor={colors.textSecondary}
                    maxLength={SUPPORT_MESSAGE_MAX}
                    multiline
                    style={[styles.field, styles.fieldMulti, { borderColor: colors.border, color: colors.textPrimary }]}
                    accessibilityLabel="Kommentar, optional"
                  />
                )}
              </View>

              <View style={styles.methods}>
                {['Karte', 'Apple Pay', 'Google Pay'].map((m) => (
                  <View key={m} style={[styles.method, { backgroundColor: chipBg }]}>
                    <Text style={[styles.methodText, { color: colors.textSecondary }]}>{m}</Text>
                  </View>
                ))}
              </View>

              {interval === 'month' && (
                <Text style={[styles.legal, { color: colors.textSecondary }]}>Monatlich per Karte, jederzeit kündbar.</Text>
              )}
              <Text style={[styles.legal, { color: colors.textSecondary }]}>
                Mit dem Klick auf „Jetzt unterstützen“ akzeptiere ich die{' '}
                <Text style={[styles.link, { color: colors.textPrimary }]} onPress={() => Linking.openURL(AGB_URL)} accessibilityRole="link">
                  AGB
                </Text>
                .
              </Text>
              {error && <Text style={[styles.error, { color: '#C9181A' }]}>{error}</Text>}
            </>
          )}

          {supporters.total > 0 && (
            <View style={styles.list}>
              <Text style={[styles.listTitle, { color: colors.textPrimary }]}>
                {supporters.total} {supporters.total === 1 ? 'Unterstützer:in' : 'Unterstützer:innen'}
              </Text>
              {supporters.items.map((sp) => (
                <View key={sp.id} style={[styles.row, { borderBottomColor: colors.border }]}>
                  <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
                    <Text style={[styles.avatarText, { color: colors.primary }]}>{(sp.name ?? 'J').trim().charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={[styles.rowName, { color: colors.textPrimary }]} numberOfLines={1}>{sp.name ?? 'Jemand'}</Text>
                    <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                      {(sp.amountCents / 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })} €{sp.interval === 'month' ? ' monatlich' : ''} · {timeAgo(sp.paidAt)}
                    </Text>
                    {sp.message ? <Text style={[styles.rowMsg, { color: colors.textPrimary }]}>{sp.message}</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          )}
      </KeyboardAwareScrollView>

      {!keyboardOpen && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <Pressable
            onPress={submit}
            disabled={!valid || busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: !valid || busy }}
            style={[styles.cta, { backgroundColor: colors.primary, opacity: !valid ? 0.5 : 1 }]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={[styles.ctaText, { color: colors.onPrimary }]}>
                {interval === 'month' ? 'Jetzt monatlich unterstützen' : 'Jetzt unterstützen'}
              </Text>
            )}
          </Pressable>
          <View style={styles.secure}>
            <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2} strokeLinecap="round">
              <Rect x={4} y={11} width={16} height={10} rx={2} />
              <Path d="M8 11V7a4 4 0 018 0v4" />
            </Svg>
            <Text style={[styles.secureText, { color: colors.textSecondary }]}>Sichere Zahlung mit Stripe</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingBottom: 8 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: fontFamily.heading, fontSize: 18 },
  hero: { width: '100%', height: 190 },
  heroGarland: { position: 'absolute', left: 0, right: 0, bottom: -14 },
  intro: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 30, gap: 6 },
  headline: { fontFamily: fontFamily.heading, fontSize: 28, letterSpacing: -0.2, textAlign: 'center' },
  sub: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  segment: { flexDirection: 'row', marginHorizontal: 20, marginTop: 22, padding: 4, borderRadius: 999, gap: 4 },
  segBtn: { flex: 1, height: 44, borderRadius: 999, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  segText: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  amounts: { flexDirection: 'row', gap: 8, marginHorizontal: 20, marginTop: 14 },
  amountCell: { flex: 1, alignItems: 'center' },
  amountBtn: { width: '100%', height: 50, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  amountText: { fontFamily: fontFamily.bold, fontSize: 16 },
  popular: { position: 'absolute', bottom: -9, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  popularText: { fontFamily: fontFamily.bold, fontSize: 11 },
  hint: { fontFamily: fontFamily.regular, fontSize: 14, textAlign: 'center', marginTop: 24, marginHorizontal: 20 },
  inputRow: { alignItems: 'center', marginTop: 12 },
  inputBox: { flexDirection: 'row', alignItems: 'center', width: 168, height: 56, borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 18, gap: 10 },
  input: { flex: 1, fontFamily: fontFamily.bold, fontSize: 24, textAlign: 'right', padding: 0 },
  inputEuro: { fontFamily: fontFamily.bold, fontSize: 24 },
  form: { marginHorizontal: 20, marginTop: 18, gap: 10 },
  field: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, height: 48, fontFamily: fontFamily.regular, fontSize: 15 },
  fieldMulti: { height: 84, paddingTop: 12, textAlignVertical: 'top' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkText: { flex: 1, fontFamily: fontFamily.medium, fontSize: 14 },
  checkHint: { fontFamily: fontFamily.regular, fontSize: 12, marginTop: -6, marginLeft: 32 },
  list: { marginTop: 28, marginHorizontal: 20 },
  listTitle: { fontFamily: fontFamily.heading, fontSize: 18, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.bold, fontSize: 16 },
  rowBody: { flex: 1, gap: 2 },
  rowName: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  rowMeta: { fontFamily: fontFamily.regular, fontSize: 13 },
  rowMsg: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, marginTop: 4 },
  methods: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 18 },
  method: { height: 30, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center' },
  methodText: { fontFamily: fontFamily.semiBold, fontSize: 13 },
  legal: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 14, marginHorizontal: 28 },
  link: { fontFamily: fontFamily.semiBold, textDecorationLine: 'underline' },
  error: { fontFamily: fontFamily.medium, fontSize: 13, textAlign: 'center', marginTop: 12, marginHorizontal: 24 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 12, paddingHorizontal: 20, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center', gap: 10 },
  cta: { width: '100%', height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: fontFamily.bold, fontSize: 17 },
  secure: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  secureText: { fontFamily: fontFamily.regular, fontSize: 13 },
});
