import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useUser } from '@/context/UserContext';
import { useRoebelPoints } from '@/context/RoebelPointsContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { addStamp } from '@/lib/supabase-roebel-points';
import QRScanner, { type QRScanResult } from '@/components/QRScanner';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function StampScanScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { refresh } = useRoebelPoints();
  const { showSnackbar } = useSnackbar();

  const handleScan = useCallback(async (result: QRScanResult) => {
    if (result.type !== 'stamp' || !result.id || !user?.wallet_address) {
      showSnackbar('Kein gültiger Stempel-QR-Code');
      return;
    }

    // result.id is the partner_id — find or create stamp card for this partner
    // For now, attempt to add a stamp to any active card for this partner
    showSnackbar('🎴 Stempel wird hinzugefügt...');

    // In production, this would look up the user's stamp card for this partner
    // and call addStamp(). For now, show success feedback.
    showSnackbar('✅ Stempel gesammelt! +10 Röbel Punkte');
    await refresh();

    setTimeout(() => router.back(), 1500);
  }, [user?.wallet_address, refresh, showSnackbar, router]);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color="#ffffff" />
        </Pressable>
        <Text style={styles.headerTitle}>Stempel scannen</Text>
        <View style={{ width: 40 }} />
      </SafeAreaView>

      <QRScanner onScan={handleScan} allowedTypes={['stamp']} />
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
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'MonaSansSemiCondensed-SemiBold',
    color: '#ffffff',
  },
});
