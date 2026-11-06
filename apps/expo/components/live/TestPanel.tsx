// Dev tools for the "testlauf" show: simulate an Unterstützung and advance the on-stage group.
// Only rendered when show.is_test is true. Nothing here moves money.
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { F, liveStyles, useLivePalette, type LivePalette } from './tokens';

type Props = {
  loggedIn: boolean;
  busy: 'support' | 'next' | null;
  onSimulateSupport: () => void;
  onNextGroup: () => void;
  onLogin: () => void;
};

export default function TestPanel({ loggedIn, busy, onSimulateSupport, onNextGroup, onLogin }: Props) {
  const L = useLivePalette();
  const styles = liveStyles(makeStyles, L);
  const [open, setOpen] = useState(true);
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={styles.header}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Testlauf-Werkzeuge einklappen' : 'Testlauf-Werkzeuge ausklappen'}
      >
        <Ionicons name="construct-outline" size={14} color={L.goldText} />
        <Text style={styles.headerText}>Testlauf-Werkzeuge</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={L.textSecondary} />
      </Pressable>
      {open ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={styles.body}>
          {!loggedIn ? (
            <Pressable onPress={onLogin} style={({ pressed }) => [styles.btn, styles.btnWide, pressed && styles.pressed]}>
              <Ionicons name="log-in-outline" size={15} color={L.text} />
              <Text style={styles.btnText}>Zum Testen bitte anmelden</Text>
            </Pressable>
          ) : (
            <>
              <View style={styles.row}>
                <Pressable
                  onPress={onSimulateSupport}
                  disabled={busy !== null}
                  style={({ pressed }) => [styles.btn, pressed && styles.pressed, busy !== null && styles.disabled]}
                  accessibilityRole="button"
                >
                  {busy === 'support'
                    ? <ActivityIndicator size="small" color={L.text} />
                    : <Ionicons name="heart-outline" size={15} color={L.goldText} />}
                  <Text style={styles.btnText} numberOfLines={1}>Unterstützung simulieren</Text>
                </Pressable>
                <Pressable
                  onPress={onNextGroup}
                  disabled={busy !== null}
                  style={({ pressed }) => [styles.btn, pressed && styles.pressed, busy !== null && styles.disabled]}
                  accessibilityRole="button"
                >
                  {busy === 'next'
                    ? <ActivityIndicator size="small" color={L.text} />
                    : <Ionicons name="play-skip-forward-outline" size={15} color={L.accent} />}
                  <Text style={styles.btnText} numberOfLines={1}>Nächste Gruppe</Text>
                </Pressable>
              </View>
              <Text style={styles.hint}>
                „Nächste Gruppe“ verschickt die Erinnerungen an alle, die bei dieser Gruppe „Erinnern“ gewählt haben – auch an dich.
              </Text>
            </>
          )}
        </Animated.View>
      ) : null}
    </View>
  );
}

const makeStyles = (L: LivePalette) => StyleSheet.create({
  wrap: {
    marginHorizontal: 12, marginTop: 8, borderRadius: 12, backgroundColor: L.goldSoft,
    borderWidth: StyleSheet.hairlineWidth, borderColor: L.goldBorder, overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32 },
  headerText: { flex: 1, color: L.goldText, fontSize: 12, fontFamily: F.bold, letterSpacing: 0.4 },
  body: { paddingHorizontal: 10, paddingBottom: 10, gap: 6 },
  row: { flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 18,
    paddingHorizontal: 10, backgroundColor: L.surfaceRaised,
  },
  btnWide: { flex: 0, alignSelf: 'stretch' },
  btnText: { flexShrink: 1, color: L.text, fontSize: 13, fontFamily: F.semiBold },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
  hint: { color: L.textSecondary, fontSize: 11, fontFamily: F.medium, lineHeight: 15, paddingHorizontal: 4 },
});
