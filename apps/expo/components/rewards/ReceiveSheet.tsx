import React from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCodeStyled from 'react-native-qrcode-styled';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTheme } from '@/context/ThemeContext';
import { useSnackbar } from '@/context/SnackbarContext';
import BottomDrawer from '@/components/BottomDrawer';

/** Near-black used for the QR modules — reads as black, ties to the brand navy. */
const QR_COLOR = '#0B1220';

interface ReceiveSheetProps {
  visible: boolean;
  address?: string | null;
  /** Display name — shown as the title, in its natural casing (never uppercased). */
  name?: string | null;
  /** Handle used for the Profil-URL row (without the leading @). */
  username?: string | null;
  onClose: () => void;
}

function CopyIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={9} y={9} width={11} height={11} rx={2.5} stroke={color} strokeWidth={1.8} />
      <Path d="M5 15V6a2 2 0 0 1 2-2h8" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ShareIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M14 4h6v6" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M20 4l-9 9" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path
        d="M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Custom bottom sheet to receive Röbel Münzen — name, black rounded QR + share rows. */
export default function ReceiveSheet({ visible, address, name, username, onClose }: ReceiveSheetProps) {
  const { colors } = useTheme();
  const { showSnackbar } = useSnackbar();

  const addr = address ?? '';
  const short = addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';
  const handle = username ? username.replace(/^@/, '') : '';
  const profileUrl = handle ? `https://roebel.app/profile/${handle}` : '';
  const title = name || handle || 'Empfangen';

  const copyTo = async (value: string, message: string) => {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    showSnackbar({ message });
  };
  const shareValue = async (value: string) => {
    if (!value) return;
    try {
      await Share.share({ message: value });
    } catch {
      /* dismissed */
    }
  };

  const InfoRow = ({
    label,
    value,
    onCopy,
    onShare,
  }: {
    label: string;
    value: string;
    onCopy: () => void;
    onShare: () => void;
  }) => (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{label}</Text>
        <Text style={[styles.rowValue, { color: colors.textSecondary }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <Pressable
        onPress={onCopy}
        hitSlop={6}
        style={({ pressed }) => [styles.iconBtn, { backgroundColor: colors.surface, opacity: pressed ? 0.6 : 1 }]}
        accessibilityLabel="Kopieren"
      >
        <CopyIcon color={colors.textPrimary} />
      </Pressable>
      <Pressable
        onPress={onShare}
        hitSlop={6}
        style={({ pressed }) => [styles.iconBtn, { backgroundColor: colors.surface, opacity: pressed ? 0.6 : 1 }]}
        accessibilityLabel="Teilen"
      >
        <ShareIcon color={colors.textPrimary} />
      </Pressable>
    </View>
  );

  return (
    <BottomDrawer visible={visible} onClose={onClose}>
      {/* BottomDrawer already reserves the bottom safe-area inset. */}
      <View style={[styles.inner, { paddingBottom: 20 }]}>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>

        <View style={styles.qrCard}>
          {!!addr && (
            <QRCodeStyled
              data={addr}
              style={styles.qr}
              size={216}
              padding={8}
              pieceBorderRadius="50%"
              isPiecesGlued
              color={QR_COLOR}
              outerEyesOptions={{ borderRadius: '30%', color: QR_COLOR }}
              innerEyesOptions={{ borderRadius: '40%', color: QR_COLOR }}
            />
          )}
        </View>

        {!!handle && (
          <InfoRow
            label="Profil-URL"
            value={`@${handle}`}
            onCopy={() => copyTo(profileUrl, 'Profil-Link kopiert')}
            onShare={() => shareValue(profileUrl)}
          />
        )}

        <View style={styles.divider}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.dividerLabel, { color: colors.textSecondary }]}>Erweitert</Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        <InfoRow
          label="Wallet-Adresse"
          value={short}
          onCopy={() => copyTo(addr, 'Adresse kopiert')}
          onShare={() => shareValue(addr)}
        />
      </View>
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  inner: { alignItems: 'center', paddingTop: 4 },
  name: { fontFamily: 'Inter-Bold', fontSize: 22, marginBottom: 22 },
  qrCard: { padding: 16, backgroundColor: '#FFFFFF', borderRadius: 24 },
  qr: { backgroundColor: 'transparent' },
  row: { flexDirection: 'row', alignItems: 'center', width: '100%', marginTop: 20, gap: 10 },
  rowLabel: { fontFamily: 'Inter-SemiBold', fontSize: 15 },
  rowValue: { fontFamily: 'Inter-Regular', fontSize: 14, marginTop: 2 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', width: '100%', marginTop: 24, gap: 12 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth + 1, borderRadius: 1 },
  dividerLabel: { fontFamily: 'Inter-Medium', fontSize: 12 },
});
