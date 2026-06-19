import React from 'react';
import { Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '@/context/ThemeContext';
import { useSnackbar } from '@/context/SnackbarContext';
import ShareIcon from '@/assets/icons/share-02.svg';

interface ReceiveSheetProps {
  visible: boolean;
  address?: string | null;
  name?: string | null;
  onClose: () => void;
}

/** Custom bottom sheet to receive Röbel Münzen — QR of the wallet + address. */
export default function ReceiveSheet({ visible, address, name, onClose }: ReceiveSheetProps) {
  const { colors, isDark } = useTheme();
  const { showSnackbar } = useSnackbar();
  const addr = address ?? '';
  const short = addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';

  const copy = async () => {
    if (!addr) return;
    await Clipboard.setStringAsync(addr);
    showSnackbar({ message: 'Adresse kopiert' });
  };
  const share = async () => {
    if (!addr) return;
    try {
      await Share.share({ message: addr });
    } catch {
      /* dismissed */
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {(name || 'Empfangen').toUpperCase()}
        </Text>

        <View style={styles.qrWrap}>
          {!!addr && <QRCode value={addr} size={196} color="#194383" backgroundColor="#FFFFFF" />}
        </View>

        <View style={[styles.warn, { backgroundColor: isDark ? '#3a2a12' : '#FBEFE3' }]}>
          <Text style={styles.warnTitle}>Nur Gnosis Chain</Text>
          <Text style={[styles.warnSub, { color: colors.textSecondary }]}>
            Gelder von anderen Netzwerken können verloren gehen.
          </Text>
        </View>

        <View style={styles.addrRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.addrLabel, { color: colors.textSecondary }]}>Wallet-Adresse</Text>
            <Text style={[styles.addrVal, { color: colors.textPrimary }]}>{short}</Text>
          </View>
          <Pressable
            onPress={copy}
            style={({ pressed }) => [styles.copyBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={styles.copyText}>Kopieren</Text>
          </Pressable>
          <Pressable
            onPress={share}
            style={({ pressed }) => [styles.iconBtn, { backgroundColor: colors.surface, opacity: pressed ? 0.6 : 1 }]}
            accessibilityLabel="Teilen"
          >
            <ShareIcon width={20} height={20} color={colors.primary} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    alignItems: 'center',
  },
  handle: { width: 44, height: 5, borderRadius: 3, marginBottom: 18 },
  name: { fontFamily: 'Inter-Bold', fontSize: 24, letterSpacing: 0.5, marginBottom: 18 },
  qrWrap: { padding: 16, backgroundColor: '#FFFFFF', borderRadius: 20 },
  warn: { width: '100%', borderRadius: 16, padding: 14, marginTop: 22 },
  warnTitle: { fontFamily: 'Inter-SemiBold', fontSize: 14, color: '#B45309' },
  warnSub: { fontFamily: 'Inter-Regular', fontSize: 12, marginTop: 2 },
  addrRow: { flexDirection: 'row', alignItems: 'center', width: '100%', marginTop: 18, gap: 10 },
  addrLabel: { fontFamily: 'Inter-Medium', fontSize: 12 },
  addrVal: { fontFamily: 'Inter-SemiBold', fontSize: 16, marginTop: 2 },
  copyBtn: { height: 44, borderRadius: 999, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  copyText: { color: '#fff', fontFamily: 'Inter-SemiBold', fontSize: 14 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
