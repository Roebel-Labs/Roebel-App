/**
 * Why a mini app is locked for this person, and the way in when there is one
 * ("Bürger:in werden", "Mitglied werden"). Shown on the detail page under the disabled button.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { LockIcon } from '@/components/miniapp/hostIcons';
import { lockInfo } from '@/lib/miniapp-audience';
import type { MiniApp } from '@/lib/miniapps';

export default function MiniAppLockNote({ app }: { app: MiniApp }) {
  const { colors } = useTheme();
  const router = useRouter();
  const info = lockInfo(app);
  const cta = info.cta;

  return (
    <View style={[styles.box, { backgroundColor: colors.surfaceSecondary }]}>
      <View style={styles.row}>
        <LockIcon size={16} color={colors.textPrimary} />
        <Text style={[styles.text, { color: colors.textPrimary }]}>{info.text}</Text>
      </View>
      {cta ? (
        <Pressable
          onPress={() => router.push(cta.href as any)}
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel={cta.label}
          style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.linkText, { color: colors.primary }]}>{cta.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: 12, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { flex: 1, fontFamily: fontFamily.medium, fontSize: 14, lineHeight: 19 },
  link: { marginTop: 6, alignSelf: 'flex-start' },
  linkText: { fontFamily: fontFamily.semiBold, fontSize: 14 },
});
