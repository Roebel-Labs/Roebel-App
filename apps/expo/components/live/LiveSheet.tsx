import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomDrawer from '@/components/BottomDrawer';
import { F, LIVE } from './tokens';

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
 * Dark bottom sheet for the live room. Same drawer as the login sheet (BottomDrawer: spring slide-up,
 * drag the handle down to dismiss, docks above the keyboard), in the live room's fixed dark palette.
 */
export default function LiveSheet({ visible, onClose, title, subtitle, children, maxHeight = '82%' }: Props) {
  return (
    <BottomDrawer
      visible={visible}
      onClose={onClose}
      maxSnapPoint={parseFloat(maxHeight) / 100}
      keyboardAware
      contentPaddingHorizontal={0}
      backgroundColor={LIVE.surface}
      handleColor={LIVE.borderStrong}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel="Schließen">
          <Ionicons name="close" size={20} color={LIVE.text} />
        </Pressable>
      </View>
      {children}
    </BottomDrawer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  headerText: { flex: 1, gap: 4 },
  title: { color: LIVE.text, fontSize: 20, fontFamily: F.heading },
  subtitle: { color: LIVE.textSecondary, fontSize: 13, fontFamily: F.regular, lineHeight: 18 },
  close: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: LIVE.surfaceRaised,
  },
});
