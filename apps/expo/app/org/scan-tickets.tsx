/**
 * Door Scanner
 *
 * Full-screen ticket QR scanner for event check-in. Org accounts only.
 * Scans `ticket` QR codes, calls checkInTicket() for each one, and shows
 * a color-coded result banner that auto-hides and re-arms the scanner.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import * as Haptics from 'expo-haptics';
import { useAccount } from '@/context/AccountContext';
import QRScanner, { type QRScanResult } from '@/components/QRScanner';
import { checkInTicket } from '@/lib/tickets';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

// Fixed, theme-independent tones — the scanner backdrop is always black
// (like the header below), so a pale theme-derived badge would wash out.
const BANNER_COLORS = { success: '#16A34A', warning: '#D97706', error: '#DC2626' } as const;
const BANNER_DURATION_MS = 2500;

type BannerTone = keyof typeof BANNER_COLORS;

interface Banner {
  tone: BannerTone;
  message: string;
  counter: string | null;
}

export default function ScanTicketsScreen() {
  const router = useRouter();
  const { activeAccount } = useAccount();
  const thirdwebAccount = useActiveAccount();

  const [banner, setBanner] = useState<Banner | null>(null);
  // Bumped whenever the banner auto-hides, to force QRScanner to remount —
  // it does not reset its internal `scanned` flag on its own when a parent
  // `onScan` handler is present (see components/QRScanner.tsx), so this is
  // how the scanner re-arms between check-ins.
  const [scannerKey, setScannerKey] = useState(0);
  // Ref (not state) so a re-entrant onScan call can be rejected synchronously
  // without waiting on a render; guards against double submission while a
  // check-in request is in flight.
  const checkingInRef = useRef(false);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guard: this screen is only valid for org accounts.
  useEffect(() => {
    if (!activeAccount || activeAccount.account_type !== 'organisation') {
      router.replace('/profile');
    }
  }, [activeAccount, router]);

  useEffect(() => {
    return () => {
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    };
  }, []);

  const showBanner = useCallback((next: Banner) => {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setBanner(next);
    bannerTimerRef.current = setTimeout(() => {
      setBanner(null);
      setScannerKey((k) => k + 1);
    }, BANNER_DURATION_MS);
  }, []);

  const handleScan = useCallback(
    async (result: QRScanResult) => {
      if (checkingInRef.current) return;

      if (!result.ticketPayload || !thirdwebAccount) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        showBanner({ tone: 'error', message: 'Ungültig', counter: null });
        return;
      }

      checkingInRef.current = true;
      try {
        const response = await checkInTicket(thirdwebAccount, result.ticketPayload);

        if (!response.ok) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          const message = response.code === 'FORBIDDEN' ? 'Kein Zugriff' : response.message;
          showBanner({ tone: 'error', message, counter: null });
          return;
        }

        const data = response.data;
        const counter =
          data.checked_in_count != null && data.issued_count != null
            ? `${data.checked_in_count} / ${data.issued_count} eingelassen`
            : null;

        if (data.result === 'ok') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          const typeName = data.ticket?.ticket_type_name;
          showBanner({
            tone: 'success',
            message: typeName ? `Gültig · ${typeName}` : 'Gültig',
            counter,
          });
        } else if (data.result === 'already_checked_in') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          const time = data.ticket?.checked_in_at
            ? new Date(data.ticket.checked_in_at).toLocaleTimeString('de-DE', {
                hour: '2-digit',
                minute: '2-digit',
              })
            : '–';
          showBanner({ tone: 'warning', message: `Bereits eingelöst um ${time}`, counter });
        } else if (data.result === 'refunded') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          showBanner({ tone: 'error', message: 'Erstattet', counter });
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          showBanner({ tone: 'error', message: 'Ungültig', counter });
        }
      } finally {
        checkingInRef.current = false;
      }
    },
    [thirdwebAccount, showBanner],
  );

  if (!activeAccount || activeAccount.account_type !== 'organisation') {
    return null;
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
          <ChevronLeftIcon width={24} height={24} color="#ffffff" />
        </Pressable>
        <Text style={styles.headerTitle}>Einlass</Text>
        <View style={styles.headerSpacer} />
      </SafeAreaView>

      <QRScanner key={scannerKey} onScan={handleScan} allowedTypes={['ticket']} />

      {banner && (
        <SafeAreaView edges={['top']} style={styles.bannerSafeArea} pointerEvents="none">
          <View style={[styles.banner, { backgroundColor: BANNER_COLORS[banner.tone] }]}>
            <Text style={styles.bannerText}>{banner.message}</Text>
            {banner.counter && <Text style={styles.bannerCounter}>{banner.counter}</Text>}
          </View>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: { padding: 4 },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'MonaSansSemiCondensed-SemiBold',
    color: '#ffffff',
  },
  headerSpacer: { width: 32 },
  bannerSafeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 64,
    paddingHorizontal: 16,
    zIndex: 20,
  },
  banner: {
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
  },
  bannerText: {
    fontSize: 17,
    fontFamily: 'MonaSansSemiCondensed-Bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  bannerCounter: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 4,
  },
});
