// Ticket order detail — the target of the deep link roebel://tickets/<orderId> that Stripe
// Checkout opens once the payment is done (see lib/tickets.ts openCheckout). It therefore has
// to work "cold": read the param, load, and ask for sign-in if no wallet turns up. While the
// order is still pending it reloads every 4 seconds — the same setInterval idiom as
// roebel-card/topup-success.tsx — for at most 3 minutes, after which a manual "Neu laden"
// button takes over. Only a NOT_FOUND answer is treated as "this order does not exist"; any
// other failure keeps whatever was on screen and keeps polling, because a flaky connection
// must never tell a buyer their paid order is gone.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import QRCode from 'react-native-qrcode-svg';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { ArrowLeftIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { useRequireAuth } from '@/context/AuthGateContext';
import { formatDate, formatTime } from '@/lib/utils';
import { requestCalendarPermission, saveEventToCalendar } from '@/lib/calendar';
import { logCalendarSave } from '@/lib/firebase';
import { fetchOrder, orderStatusLabel, type OrderView, type TicketView } from '@/lib/tickets';

const POLL_INTERVAL_MS = 4000;
const MAX_POLL_SECONDS = 180;
// thirdweb reports `undefined` for a moment while it restores the session. Treat that as
// "loading" instead of flashing "Bitte melde dich an" at an already signed-in buyer.
const AUTH_GRACE_MS = 3000;
const MONOSPACE = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
const VALID_GREEN = '#16a34a';

function ticketStateLabel(ticket: TicketView): string {
  switch (ticket.status) {
    case 'issued':
      return 'Gültig';
    case 'checked_in':
      return ticket.checked_in_at
        ? `Eingelöst am ${format(parseISO(ticket.checked_in_at), "d. MMM yyyy, HH:mm", { locale: de })} Uhr`
        : 'Eingelöst';
    case 'refunded':
      return 'Erstattet';
    case 'void':
      return 'Ungültig';
    default:
      return ticket.status;
  }
}

function ticketStateColor(status: TicketView['status'], errorColor: string, mutedColor: string): string {
  if (status === 'issued') return VALID_GREEN;
  if (status === 'refunded' || status === 'void') return errorColor;
  return mutedColor;
}

export default function TicketOrderDetailScreen() {
  const { order: orderId } = useLocalSearchParams<{ order: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { showSnackbar } = useSnackbar();
  const requireAuth = useRequireAuth();
  const account = useActiveAccount();

  const [order, setOrder] = useState<OrderView | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [authGraceOver, setAuthGraceOver] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [pollGen, setPollGen] = useState(0);
  const [savingCalendar, setSavingCalendar] = useState(false);
  const [ticketIndex, setTicketIndex] = useState(0);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!account || !orderId) return;
    const res = await fetchOrder(account, orderId);
    if (res.ok) {
      setOrder(res.data);
      setNotFound(false);
      setLoadFailed(false);
    } else if (res.code === 'NOT_FOUND') {
      setNotFound(true);
      setLoadFailed(false);
    } else {
      // Network hiccup, signature trouble, a 503 — none of those mean the order is gone.
      // Keep the last view (and keep polling while it is pending) and only note the failure.
      console.warn('[tickets] order load failed', res.code, res.message);
      setLoadFailed(true);
    }
    setLoading(false);
  }, [account, orderId]);

  // Give thirdweb up to AUTH_GRACE_MS to restore the session before this screen concludes
  // that nobody is signed in. Cleared on unmount and whenever an account does turn up.
  useEffect(() => {
    if (account) {
      setAuthGraceOver(false);
      return;
    }
    const timer = setTimeout(() => setAuthGraceOver(true), AUTH_GRACE_MS);
    return () => clearTimeout(timer);
  }, [account]);

  // Initial load once the wallet is available. Re-runs if the deep-link
  // param changes (e.g. two consecutive checkouts reuse this screen).
  useEffect(() => {
    if (!account) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, orderId]);

  // Poll while the order is still pending, cleared on unmount or
  // once the status moves on — same idiom as roebel-card/topup-success.tsx.
  useEffect(() => {
    if (!account || order?.status !== 'pending') return;
    setElapsed(0);
    pollingRef.current = setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);
    tickRef.current = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, order?.status, pollGen]);

  // Stop polling once the 3-minute window has elapsed; the pending screen
  // then falls back to a manual "Neu laden" button.
  useEffect(() => {
    if (elapsed < MAX_POLL_SECONDS) return;
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, [elapsed]);

  const handleReload = useCallback(() => {
    setElapsed(0);
    setPollGen((g) => g + 1);
    setLoadFailed(false);
    void load();
  }, [load]);

  const handleSaveToCalendar = useCallback(async () => {
    if (!order || !order.event.date || !order.event.location || savingCalendar) return;
    const { id: eventId, title, date, time, location } = order.event;
    setSavingCalendar(true);
    try {
      const granted = await requestCalendarPermission();
      if (!granted) {
        showSnackbar({ message: 'Kalender-Zugriff wurde nicht erlaubt', duration: 4000 });
        return;
      }
      await saveEventToCalendar({ title, description: null, date, time, endTime: null, location });
      logCalendarSave(eventId, title);
      showSnackbar({ message: 'Zum Kalender hinzugefügt', duration: 4000 });
    } catch (error) {
      console.error('Error saving to calendar:', error);
      showSnackbar({ message: 'Fehler beim Speichern in den Kalender', duration: 4000 });
    } finally {
      setSavingCalendar(false);
    }
  }, [order, savingCalendar, showSnackbar]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/tickets' as any);
  }, [router]);

  const handleTicketScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!width) return;
      const idx = Math.round(e.nativeEvent.contentOffset.x / width);
      setTicketIndex(idx);
    },
    [width]
  );

  const timedOut = order?.status === 'pending' && elapsed >= MAX_POLL_SECONDS;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={handleBack}
          style={[styles.backButtonCircle, { backgroundColor: colors.surfaceSecondary }]}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <ArrowLeftIcon size={24} color={colors.tabIconActive} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          Ticket
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {!account && !authGraceOver ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !account ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Bitte melde dich an, um dein Ticket zu sehen.
          </Text>
          <Pressable
            onPress={() => requireAuth(() => {})}
            style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: 16 }]}
            accessibilityRole="button"
          >
            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Anmelden</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !order && loadFailed ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Die Bestellung konnte gerade nicht geladen werden.
          </Text>
          <Pressable
            onPress={handleReload}
            style={[styles.secondaryButton, { borderColor: colors.border, marginTop: 20 }]}
            accessibilityRole="button"
          >
            <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>Neu laden</Text>
          </Pressable>
        </View>
      ) : notFound || !order ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Diese Bestellung wurde nicht gefunden.
          </Text>
        </View>
      ) : order.status === 'pending' ? (
        <View style={styles.center}>
          {timedOut ? (
            <>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Noch keine Bestätigung</Text>
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                Wenn du bezahlt hast, erscheint das Ticket in Kürze unter Meine Tickets.
              </Text>
              <Pressable
                onPress={handleReload}
                style={[styles.secondaryButton, { borderColor: colors.border, marginTop: 20 }]}
                accessibilityRole="button"
              >
                <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>Neu laden</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.title, { color: colors.textPrimary, marginTop: 16 }]}>
                Zahlung wird bestätigt…
              </Text>
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                Das dauert normalerweise nur wenige Sekunden.
              </Text>
            </>
          )}
        </View>
      ) : order.status === 'expired' || order.status === 'cancelled' ? (
        <View style={styles.center}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{orderStatusLabel(order.status)}</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Diese Bestellung ist abgelaufen. Du kannst neu buchen.
          </Text>
          <Pressable
            onPress={() => router.replace({ pathname: '/event/[id]/tickets' as any, params: { id: order.event.id } })}
            style={[styles.primaryButton, { backgroundColor: colors.primary, marginTop: 20 }]}
            accessibilityRole="button"
          >
            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Erneut buchen</Text>
          </Pressable>
        </View>
      ) : order.status === 'refunded' ? (
        <View style={styles.center}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Erstattet</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Erstattet – der Betrag geht an das Zahlungsmittel zurück.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
          <View style={[styles.eventCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.eventTitle, { color: colors.textPrimary }]} numberOfLines={2}>
              {order.event.title}
            </Text>
            {!!order.event.date && (
              <Text style={[styles.eventLine, { color: colors.textSecondary }]}>
                {formatDate(order.event.date)}
                {order.event.time ? ` • ${formatTime(order.event.time)} Uhr` : ''}
              </Text>
            )}
            {!!order.event.location && (
              <Text style={[styles.eventLine, { color: colors.textSecondary }]} numberOfLines={2}>
                {order.event.location}
              </Text>
            )}
            {!!order.event.date && !!order.event.location && (
              <Pressable
                onPress={handleSaveToCalendar}
                disabled={savingCalendar}
                style={[
                  styles.secondaryButton,
                  { borderColor: colors.border, marginTop: 12, opacity: savingCalendar ? 0.6 : 1 },
                ]}
                accessibilityRole="button"
              >
                <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>Zum Kalender</Text>
              </Pressable>
            )}
          </View>

          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleTicketScrollEnd}
            style={styles.ticketPager}
          >
            {order.tickets.map((ticket, i) => (
              <View key={ticket.id} style={[styles.ticketPage, { width }]}>
                <View
                  style={[styles.qrCard, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  accessibilityLabel={`Ticket ${i + 1} von ${order.tickets.length}, ${ticket.ticket_type_name}`}
                >
                  <Text style={[styles.ticketTypeName, { color: colors.textPrimary }]}>{ticket.ticket_type_name}</Text>
                  <View style={styles.qrFrame}>
                    <QRCode value={ticket.qr} size={220} backgroundColor="#FFFFFF" color="#000000" />
                  </View>
                  <Text style={[styles.ticketCode, { color: colors.textSecondary }]}>{ticket.code}</Text>
                  <Text style={[styles.ticketState, { color: ticketStateColor(ticket.status, colors.error, colors.textSecondary) }]}>
                    {ticketStateLabel(ticket)}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>

          {order.tickets.length > 1 && (
            <View style={styles.dots}>
              {order.tickets.map((ticket, i) => (
                <View
                  key={ticket.id}
                  style={[styles.dot, { backgroundColor: i === ticketIndex ? colors.primary : colors.border }]}
                />
              ))}
            </View>
          )}

          <Text style={[styles.note, { color: colors.textTertiary }]}>
            Beim Einlass vorzeigen. Nicht personengebunden – jeder Code gilt nur einmal.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButtonCircle: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-Medium',
    marginHorizontal: 8,
  },
  headerSpacer: { width: 40 },
  emptyText: { fontSize: 14, fontFamily: 'Inter-Regular', lineHeight: 20, textAlign: 'center' },
  title: { fontSize: 20, fontFamily: 'Inter-Bold', textAlign: 'center' },
  body: { fontSize: 14, fontFamily: 'Inter-Regular', lineHeight: 20, textAlign: 'center', marginTop: 8 },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  primaryButtonText: { fontSize: 15, fontFamily: 'MonaSansSemiCondensed-Bold' },
  secondaryButton: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: 24,
  },
  secondaryButtonText: { fontSize: 15, fontFamily: 'MonaSansSemiCondensed-Bold' },
  content: { flex: 1 },
  contentInner: { paddingBottom: 40 },
  eventCard: {
    marginHorizontal: 16,
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  eventTitle: { fontSize: 18, fontFamily: 'MonaSansSemiCondensed-Bold', lineHeight: 24 },
  eventLine: { fontSize: 13, fontFamily: 'Inter-Regular', marginTop: 4 },
  ticketPager: { height: 400, marginTop: 20 },
  ticketPage: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  qrCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  ticketTypeName: { fontSize: 15, fontFamily: 'Inter-SemiBold', textAlign: 'center' },
  qrFrame: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  ticketCode: { fontSize: 15, fontFamily: MONOSPACE, letterSpacing: 1 },
  ticketState: { fontSize: 13, fontFamily: 'Inter-SemiBold' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  note: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 24,
  },
});
