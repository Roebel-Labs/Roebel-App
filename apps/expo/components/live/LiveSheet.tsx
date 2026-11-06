import React, { useEffect, useState } from 'react';
import { Dimensions, Keyboard, LayoutAnimation, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
/**
 * Keyboard overlap from the keyboard's real top edge (same approach as the room's composer and the DM
 * screen). BottomDrawer's KeyboardAvoidingView mode misjudges it on Android edge-to-edge, which made the
 * Unterstützen sheet jump up and down when the message field lost focus.
 */
function useKeyboardOverlap(active: boolean): number {
  const [overlap, setOverlap] = useState(0);
  useEffect(() => {
    if (!active) { setOverlap(0); return; }
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const animate = (duration?: number) => {
      LayoutAnimation.configureNext(LayoutAnimation.create(duration && duration > 0 ? duration : 220, 'easeInEaseOut', 'opacity'));
    };
    const show = Keyboard.addListener(showEvt, (e) => {
      const y = e.endCoordinates?.screenY;
      const next = typeof y === 'number' ? Math.max(0, Dimensions.get('screen').height - y) : e.endCoordinates?.height ?? 0;
      animate(e.duration);
      setOverlap(next);
    });
    const hide = Keyboard.addListener(hideEvt, (e) => {
      animate(e?.duration);
      setOverlap(0);
    });
    return () => { show.remove(); hide.remove(); };
  }, [active]);
  return overlap;
}

export default function LiveSheet({ visible, onClose, title, subtitle, children, maxHeight = '82%' }: Props) {
  const L = useLivePalette();
  const keyboard = useKeyboardOverlap(visible);
  const styles = liveStyles(makeStyles, L);
  return (
    <BottomDrawer
      visible={visible}
      onClose={onClose}
      maxSnapPoint={parseFloat(maxHeight) / 100}
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
      {/* Lifts the content above the keyboard; the sheet grows upward instead of being resized by the OS. */}
      {keyboard > 0 ? <View style={{ height: keyboard }} /> : null}
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
