import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomDrawer from '@/components/BottomDrawer';
import { F, liveStyles, useLivePalette, type LivePalette } from './tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Max share of the screen height. */
  maxHeight?: `${number}%`;
};

/**
 * Bottom sheet for the live room. Same drawer as the login sheet (BottomDrawer: spring slide-up,
 * drag the handle down to dismiss, docks above the keyboard), in the live room palette (follows the app theme).
 */
export default function LiveSheet({ visible, onClose, title, subtitle, children, maxHeight = '82%' }: Props) {
  const L = useLivePalette();
  const styles = liveStyles(makeStyles, L);
  return (
    <BottomDrawer
      visible={visible}
      onClose={onClose}
      maxSnapPoint={parseFloat(maxHeight) / 100}
      keyboardAware
      contentPaddingHorizontal={0}
      backgroundColor={L.isDark ? L.surface : L.bg}
      handleColor={L.isDark ? L.borderStrong : undefined}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel="Schließen">
          <Ionicons name="close" size={20} color={L.text} />
        </Pressable>
      </View>
      {children}
    </BottomDrawer>
  );
}

const makeStyles = (L: LivePalette) => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  headerText: { flex: 1, gap: 4 },
  title: { color: L.text, fontSize: 20, fontFamily: F.heading },
  subtitle: { color: L.textSecondary, fontSize: 13, fontFamily: F.regular, lineHeight: 18 },
  close: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: L.surfaceRaised,
  },
});
