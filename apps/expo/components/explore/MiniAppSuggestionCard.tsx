/**
 * One fitting mini app suggested on Erkunden (lib/miniapp-suggestions.ts). Nothing is pinned
 * until the person taps "Übernehmen" — same pattern as components/mecky/LayoutProposalCard.tsx.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import type { MiniApp } from '@/lib/miniapps';

interface Props {
  app: MiniApp;
  onAccept(): void;
  onDismiss(): void;
}

export default function MiniAppSuggestionCard({ app, onAccept, onDismiss }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSecondary }]}>
      <Text style={[styles.text, { color: colors.textPrimary }]}>
        {`Passt zu dir: ${app.name}. Auf deine Startseite legen?`}
      </Text>
      <View style={styles.actions}>
        <Pressable
          onPress={onAccept}
          style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Übernehmen</Text>
        </Pressable>
        <Pressable onPress={onDismiss} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.link, { color: colors.primary }]}>Nicht jetzt</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginHorizontal: 16, marginVertical: 8, gap: 4 },
  text: { fontFamily: fontFamily.medium, fontSize: 15 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10 },
  button: { paddingHorizontal: 16, height: 36, borderRadius: 18, justifyContent: 'center' },
  buttonText: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  link: { fontFamily: fontFamily.semiBold, fontSize: 14 },
});
