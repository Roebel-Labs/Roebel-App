/**
 * Abzeichen-QR: the event's Smart Event QR full screen, white on black, for the organiser at the
 * door. One code gives the Röbel Münzen for attending and records attendance for the badge.
 * Opened from the organiser block on the event page; the QR row is created on first use
 * (event_badge_qr). The live count is polled every 10 s while the screen is focused.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActiveAccount } from 'thirdweb/react';
import QRCode from 'react-native-qrcode-svg';
import { useGoBack } from '@/hooks/useGoBack';
import { fontFamily } from '@/constants/theme';
import { useCredentialsGate } from '@/lib/credreg/gate';
import { ensureEventQr, fetchEventBadge } from '@/lib/credreg/api';
import { badgeCountLine, ORGANISER_LABELS } from '@/lib/credreg/event-page';
import { safeServerText } from '@/lib/credreg/org';
import type { EventBadgeGetResult } from '@/lib/credreg/types';
import { supabase } from '@/lib/supabase';

// Defensive expo-keep-awake load (same pattern as the live room): the screen may sleep without it.
type KeepAwakeFn = (tag?: string) => Promise<void> | void;
let activateKeepAwakeAsync: KeepAwakeFn = async () => {};
let deactivateKeepAwake: KeepAwakeFn = async () => {};
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ka = require('expo-keep-awake');
  if (ka?.activateKeepAwakeAsync) activateKeepAwakeAsync = ka.activateKeepAwakeAsync as KeepAwakeFn;
  if (ka?.deactivateKeepAwake) deactivateKeepAwake = ka.deactivateKeepAwake as KeepAwakeFn;
} catch {
  // Screen may sleep; the code itself still works.
}
const KEEP_AWAKE_TAG = 'roebel-badge-qr';
const QR_BASE = 'https://www.roebel.app/e/';
const POLL_MS = 10_000;

export default function BadgeQrScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = typeof id === 'string' ? id : '';
  const insets = useSafeAreaInsets();
  const goBack = useGoBack();
  const focused = useIsFocused();
  const account = useActiveAccount();
  const gate = useCredentialsGate();

  const address = account?.address;
  const [title, setTitle] = useState('');
  const [qrId, setQrId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [badge, setBadge] = useState<EventBadgeGetResult | null>(null);

  useEffect(() => {
    if (!eventId) return;
    let alive = true;
    void supabase
      .from('events')
      .select('title')
      .eq('id', eventId)
      .maybeSingle()
      .then(({ data }) => {
        if (alive && data?.title) setTitle(String(data.title));
      });
    return () => {
      alive = false;
    };
  }, [eventId]);

  const loadQr = useCallback(() => {
    const signer = account;
    if (!signer || !eventId) return Promise.resolve();
    return ensureEventQr(signer, eventId).then((r) => {
      if (r.ok) {
        setError(null);
        setQrId(r.data.rewardEventId);
      } else setError(safeServerText(r.message, 'Der Code konnte nicht geladen werden.'));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the account object changes identity on re-render; the address is what matters
  }, [address, eventId]);

  useEffect(() => {
    if (gate === true && address) void loadQr();
  }, [gate, address, loadQr]);

  // Live count while the screen is focused.
  useEffect(() => {
    const signer = account;
    if (!focused || gate !== true || !signer || !eventId) return;
    let alive = true;
    const tick = () =>
      void fetchEventBadge(signer, eventId).then((r) => {
        if (alive && r.ok) setBadge(r.data);
      });
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see loadQr
  }, [focused, gate, address, eventId]);

  useEffect(() => {
    if (!focused) return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG);
    };
  }, [focused]);

  const url = qrId ? `${QR_BASE}${qrId}` : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Schließen">
          <Text style={styles.close}>Schließen</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {title || ORGANISER_LABELS.heading}
        </Text>

        <View style={styles.qrBox}>
          {url ? (
            <QRCode value={url} size={260} color="#FFFFFF" backgroundColor="#000000" />
          ) : error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={loadQr} accessibilityRole="button" style={styles.retry}>
                <Text style={styles.retryText}>Erneut versuchen</Text>
              </Pressable>
            </View>
          ) : gate === false ? (
            <Text style={styles.errorText}>Abzeichen gibt es in deiner App bald.</Text>
          ) : !account && gate === true ? (
            <Text style={styles.errorText}>Bitte melde dich an.</Text>
          ) : (
            <ActivityIndicator color="#FFFFFF" />
          )}
        </View>

        <Text style={styles.hint}>{ORGANISER_LABELS.qrHint}</Text>
        {badge ? (
          <Text style={styles.count} accessibilityLiveRegion="polite">
            {badgeCountLine(badge)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000', paddingHorizontal: 24 },
  header: { flexDirection: 'row', justifyContent: 'flex-end' },
  close: { color: '#FFFFFF', fontSize: 16, fontFamily: fontFamily.semiBold },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  title: { color: '#FFFFFF', fontSize: 24, lineHeight: 30, fontFamily: fontFamily.heading, textAlign: 'center' },
  qrBox: { width: 284, height: 284, alignItems: 'center', justifyContent: 'center' },
  errorBox: { alignItems: 'center', gap: 16 },
  errorText: { color: '#FFFFFF', fontSize: 15, lineHeight: 21, fontFamily: fontFamily.regular, textAlign: 'center' },
  retry: { borderWidth: 1, borderColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#FFFFFF', fontSize: 15, fontFamily: fontFamily.semiBold },
  hint: { color: '#D1D5DB', fontSize: 14, lineHeight: 20, fontFamily: fontFamily.regular, textAlign: 'center' },
  count: { color: '#FFFFFF', fontSize: 16, fontFamily: fontFamily.semiBold, textAlign: 'center' },
});
