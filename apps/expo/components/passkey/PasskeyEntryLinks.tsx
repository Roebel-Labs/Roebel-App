/**
 * "Konto wiederherstellen" + "Mein Konto-Code" links for the login / welcome surfaces. Renders
 * NOTHING unless the passkey preview gate is open (production returns before any network read).
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { isPasskeyPreviewAllowed } from '@/lib/passkey/gate';

export default function PasskeyEntryLinks({ onNavigate, light = false }: { onNavigate?: () => void; light?: boolean }) {
  const router = useRouter();
  const { colors } = useTheme();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isPasskeyPreviewAllowed()
      .catch(() => false)
      .then((ok) => {
        if (!cancelled) setAllowed(ok);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!allowed) return null;

  const go = (path: string) => {
    onNavigate?.();
    router.push(path as any);
  };
  const color = light ? '#fff' : colors.primary;

  return (
    <View style={styles.wrap}>
      <Pressable onPress={() => go('/passkey/restore')} accessibilityRole="button" style={styles.link}>
        <Text style={[styles.text, { color }]}>Neues Handy? Konto wiederherstellen</Text>
      </Pressable>
      <Pressable onPress={() => go('/passkey/code')} accessibilityRole="button" style={styles.link}>
        <Text style={[styles.text, { color }]}>Mein Konto-Code</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, marginTop: 12, alignItems: 'center' },
  link: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 },
  text: { fontFamily: fontFamily.semiBold, fontSize: 16, textDecorationLine: 'underline' },
});
