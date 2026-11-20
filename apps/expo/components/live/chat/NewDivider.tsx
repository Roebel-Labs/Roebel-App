import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { F, liveStyles, useLivePalette, type LivePalette } from '../tokens';

/** Twitch-style "Neu" line before the first message that arrived since your last visit. */
export default function NewDivider() {
  const L = useLivePalette();
  const styles = liveStyles(makeStyles, L);
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={styles.row} accessibilityLabel="Neue Nachrichten">
      <View style={styles.line} />
      <Text style={styles.label}>Neu</Text>
    </Animated.View>
  );
}

const makeStyles = (L: LivePalette) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 12, paddingVertical: 4 },
  line: { flex: 1, height: 1, backgroundColor: L.red },
  label: { color: L.red, fontSize: 11, fontFamily: F.bold, letterSpacing: 0.4 },
});
