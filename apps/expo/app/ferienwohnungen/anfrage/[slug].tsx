import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { useRequireAuth } from '@/context/AuthGateContext';
import { fontFamily } from '@/constants/theme';
import MeckyNotFound from '@/components/MeckyNotFound';
import InlineErrorBoundary from '@/components/InlineErrorBoundary';
import StayRangeCalendar from '@/components/vacation/StayRangeCalendar';
import { findOrCreateConversation, sendMessage } from '@/lib/supabase-messages';
import {
  buildStayRequestMessage,
  fetchVacationRental,
  formatEuro,
  formatStayRange,
  guestsLabel,
  nightsBetween,
  nightsLabel,
  quoteStay,
  type VacationRental,
} from '@/lib/vacation-rentals';

export default function StayRequestScreen() {
  return (
    <InlineErrorBoundary label="stay-request">
      <StayRequestScreenInner />
    </InlineErrorBoundary>
  );
}

function StayRequestScreenInner() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors } = useTheme();
  const { data: rental, isPending } = useQuery({
    queryKey: ['vacation-rental', slug],
    queryFn: () => fetchVacationRental(slug!),
    enabled: !!slug,
  });

  if (isPending && slug) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={colors.textSecondary} />
      </View>
    );
  }
  if (!rental) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <MeckyNotFound title="Ferienwohnung nicht gefunden" />
      </SafeAreaView>
    );
  }
  return <StayRequestForm rental={rental} />;
}

type Sent = { conversationId: string; checkIn: string; checkOut: string; guests: number; total: number };

function StayRequestForm({ rental }: { rental: VacationRental }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();
  const requireAuth = useRequireAuth();

  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [adults, setAdults] = useState(Math.min(2, rental.max_guests));
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);

  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const quote = quoteStay(rental, nights);
  const tooShort = nights > 0 && nights < rental.min_nights;
  const seatsLeft = rental.max_guests - adults - children;
  const ownListing = activeAccount?.id === rental.account_id;
  const canSend = nights > 0 && !tooShort && !sending && !ownListing;

  const submit = () => {
    if (!checkIn || !checkOut || !canSend) return;
    if (!activeAccount) {
      requireAuth(() => {});
      return;
    }
    requireAuth(async () => {
      setSending(true);
      setError(null);
      try {
        const convo = await findOrCreateConversation(activeAccount.id, rental.account_id);
        const text = buildStayRequestMessage(rental, { checkIn, checkOut, adults, children, infants, message });
        const msg = convo ? await sendMessage(convo.id, activeAccount.id, text) : null;
        if (!convo || !msg) {
          setError('Die Anfrage konnte nicht gesendet werden. Bitte versuche es erneut.');
          return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setSent({ conversationId: convo.id, checkIn, checkOut, guests: adults + children, total: quote.total });
      } finally {
        setSending(false);
      }
    });
  };

  if (sent) {
    return <StaySentScreen rental={rental} sent={sent} />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.closeRow}>
        <Pressable
          onPress={() => router.back()}
          style={styles.closeBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Schließen"
        >
          <Ionicons name="close" size={26} color={colors.textPrimary} />
        </Pressable>
      </View>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>Anfrage prüfen</Text>

          <View style={[styles.card, { borderColor: colors.borderSecondary }]}>
            <View style={styles.summaryRow}>
              {rental.images[0] ? (
                <Image source={{ uri: rental.images[0] }} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" />
              ) : null}
              <View style={styles.flex}>
                <Text style={[styles.summaryTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                  {rental.title}
                </Text>
                <Text style={[styles.muted, { color: colors.textSecondary }]} numberOfLines={1}>
                  {[rental.kind_label, rental.host?.name].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Reisedaten</Text>
          <Text style={[styles.muted, styles.sectionHint, { color: colors.textSecondary }]}>
            {checkIn && checkOut
              ? `${formatStayRange(checkIn, checkOut)} · ${nightsLabel(nights)}`
              : checkIn
                ? 'Jetzt den Abreisetag wählen'
                : 'Anreisetag wählen'}
          </Text>
          <StayRangeCalendar
            checkIn={checkIn}
            checkOut={checkOut}
            onChange={(a, b) => {
              setCheckIn(a);
              setCheckOut(b);
            }}
          />
          {tooShort ? (
            <Text style={[styles.warn, { color: colors.error }]}>Mindestaufenthalt: {nightsLabel(rental.min_nights)}</Text>
          ) : null}

          <View style={[styles.divider, { backgroundColor: colors.borderSecondary }]} />

          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Gäste</Text>
          <Text style={[styles.muted, styles.sectionHint, { color: colors.textSecondary }]}>
            Maximal {guestsLabel(rental.max_guests)}, Kleinkinder nicht mitgezählt
          </Text>
          <Stepper label="Erwachsene & Jugendliche" hint="ab 12 Jahre" value={adults} min={1} canAdd={seatsLeft > 0} onChange={setAdults} />
          <Stepper label="Kinder" hint="4–11 Jahre" value={children} min={0} canAdd={seatsLeft > 0} onChange={setChildren} />
          <Stepper label="Kleinkinder" hint="0–3 Jahre" value={infants} min={0} canAdd={infants < 2} onChange={setInfants} />

          <View style={[styles.divider, { backgroundColor: colors.borderSecondary }]} />

          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Nachricht an den Gastgeber</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Z. B. ungefähre Ankunftszeit oder Fragen zur Wohnung (optional)"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={800}
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSecondary }]}
          />

          {nights > 0 ? (
            <>
              <View style={[styles.divider, { backgroundColor: colors.borderSecondary }]} />
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Preis</Text>
              <PriceRow label={`${formatEuro(rental.price_per_night)} × ${nightsLabel(nights)}`} value={formatEuro(quote.nightsTotal)} />
              {quote.cleaningFee > 0 ? <PriceRow label="Endreinigung" value={formatEuro(quote.cleaningFee)} /> : null}
              <View style={[styles.totalLine, { borderTopColor: colors.borderSecondary }]}>
                <PriceRow label="Gesamt" value={formatEuro(quote.total)} strong />
              </View>
            </>
          ) : null}

          <Text style={[styles.note, { color: colors.textSecondary }]}>
            Du sendest eine unverbindliche Anfrage. {rental.host?.name ?? 'Der Gastgeber'} bestätigt im Chat; bezahlt wird
            erst danach, direkt beim Gastgeber.
            {rental.payment_note ? ` ${rental.payment_note}` : ''}
          </Text>
          {ownListing ? (
            <Text style={[styles.warn, { color: colors.textSecondary }]}>
              Du bist gerade als Gastgeber unterwegs. Wechsle zu deinem persönlichen Konto, um anzufragen.
            </Text>
          ) : null}
          {error ? <Text style={[styles.warn, { color: colors.error }]}>{error}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.footer, { borderTopColor: colors.borderSecondary, backgroundColor: colors.background }]}>
        <Pressable
          onPress={submit}
          disabled={!canSend}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: canSend ? colors.textPrimary : colors.disabled },
            pressed && { opacity: 0.85 },
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSend }}
        >
          {sending ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={[styles.ctaText, { color: canSend ? colors.background : colors.disabledText }]}>
              {nights > 0 ? `Anfrage senden · ${formatEuro(quote.total)}` : 'Reisedaten wählen'}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Stepper({
  label,
  hint,
  value,
  min,
  canAdd,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  canAdd: boolean;
  onChange: (n: number) => void;
}) {
  const { colors } = useTheme();
  const btn = (icon: 'remove' | 'add', enabled: boolean, next: number) => (
    <Pressable
      onPress={() => enabled && onChange(next)}
      disabled={!enabled}
      style={[styles.stepBtn, { borderColor: colors.border }, !enabled && styles.stepDisabled]}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${icon === 'add' ? 'erhöhen' : 'verringern'}`}
    >
      <Ionicons name={icon} size={18} color={colors.textPrimary} />
    </Pressable>
  );
  return (
    <View style={styles.stepRow}>
      <View style={styles.flex}>
        <Text style={[styles.stepLabel, { color: colors.textPrimary }]}>{label}</Text>
        <Text style={[styles.muted, { color: colors.textSecondary }]}>{hint}</Text>
      </View>
      {btn('remove', value > min, value - 1)}
      <Text style={[styles.stepValue, { color: colors.textPrimary }]}>{value}</Text>
      {btn('add', canAdd, value + 1)}
    </View>
  );
}

function PriceRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const { colors } = useTheme();
  const font = strong ? styles.priceStrong : styles.priceText;
  return (
    <View style={styles.priceRow}>
      <Text style={[font, { color: colors.textPrimary }]}>{label}</Text>
      <Text style={[font, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function StaySentScreen({ rental, sent }: { rental: VacationRental; sent: Sent }) {
  const router = useRouter();
  const { colors } = useTheme();
  const hostName = rental.host?.name ?? 'Der Gastgeber';
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <ScrollView contentContainerStyle={styles.sentScroll}>
        <Text style={[styles.sentTitle, { color: colors.textPrimary }]}>Deine Anfrage ist unterwegs</Text>
        <Text style={[styles.sentText, { color: colors.textSecondary }]}>
          {hostName} meldet sich im Chat bei dir und bestätigt deinen Aufenthalt. Bezahlt wird erst danach.
        </Text>
        <View style={[styles.sentCard, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}>
          <View>
            {rental.images[0] ? (
              <Image source={{ uri: rental.images[0] }} style={styles.sentImage} contentFit="cover" cachePolicy="memory-disk" />
            ) : null}
            <View style={styles.sentPill}>
              <Text style={styles.sentPillText}>Angefragt</Text>
            </View>
          </View>
          <Text style={[styles.summaryTitle, styles.sentCardTitle, { color: colors.textPrimary }]}>{rental.title}</Text>
          <Text style={[styles.sentLine, { color: colors.textSecondary }]}>{formatStayRange(sent.checkIn, sent.checkOut)}</Text>
          <Text style={[styles.sentLine, { color: colors.textSecondary }]}>
            {guestsLabel(sent.guests)} · {formatEuro(sent.total)} gesamt
          </Text>
        </View>
      </ScrollView>
      <View style={styles.sentActions}>
        <Pressable
          onPress={() => router.replace(`/messages/${sent.conversationId}` as never)}
          style={({ pressed }) => [styles.cta, { backgroundColor: colors.textPrimary }, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Text style={[styles.ctaText, { color: colors.background }]}>Zum Chat</Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.cta, { backgroundColor: colors.surfaceSecondary }, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Text style={[styles.ctaText, { color: colors.textPrimary }]}>Fertig</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  closeRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 8 },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 24, paddingBottom: 32 },
  pageTitle: { fontSize: 30, fontFamily: fontFamily.heading, marginBottom: 20 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 28 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  thumb: { width: 88, height: 88, borderRadius: 10 },
  summaryTitle: { fontSize: 18, fontFamily: fontFamily.semiBold },
  muted: { fontSize: 14, fontFamily: fontFamily.regular, marginTop: 2 },
  sectionTitle: { fontSize: 20, fontFamily: fontFamily.heading },
  sectionHint: { marginBottom: 12 },
  warn: { fontSize: 14, fontFamily: fontFamily.medium, marginTop: 10 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 24 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  stepLabel: { fontSize: 16, fontFamily: fontFamily.medium },
  stepBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepDisabled: { opacity: 0.3 },
  stepValue: { minWidth: 20, textAlign: 'center', fontSize: 16, fontFamily: fontFamily.semiBold },
  input: {
    minHeight: 96,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    fontSize: 15,
    fontFamily: fontFamily.regular,
    textAlignVertical: 'top',
  },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, marginTop: 4 },
  priceText: { fontSize: 15, fontFamily: fontFamily.regular },
  priceStrong: { fontSize: 16, fontFamily: fontFamily.bold },
  totalLine: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 6 },
  note: { fontSize: 13, fontFamily: fontFamily.regular, lineHeight: 19, marginTop: 24 },
  footer: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth },
  cta: { height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 17, fontFamily: fontFamily.semiBold },
  sentScroll: { paddingHorizontal: 32, paddingTop: 48, paddingBottom: 24, alignItems: 'center' },
  sentTitle: { fontSize: 32, fontFamily: fontFamily.heading, textAlign: 'center' },
  sentText: { fontSize: 16, fontFamily: fontFamily.regular, lineHeight: 23, textAlign: 'center', marginTop: 12 },
  sentCard: { alignSelf: 'stretch', borderWidth: 1, borderRadius: 24, padding: 16, marginTop: 32 },
  sentImage: { width: '100%', aspectRatio: 1.05, borderRadius: 16 },
  sentPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  sentPillText: { fontSize: 14, fontFamily: fontFamily.semiBold, color: '#000' },
  sentCardTitle: { marginTop: 14 },
  sentLine: { fontSize: 15, fontFamily: fontFamily.regular, marginTop: 4 },
  sentActions: { paddingHorizontal: 24, paddingBottom: 8, gap: 10 },
});
