/**
 * Shared building blocks for the passkey guardian / recovery screens. Grandma test: big touch
 * targets (min. 56 pt), one primary button per screen, plain words.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import { isPasskeyPreviewAllowed } from '@/lib/passkey/gate';

/**
 * The preview fence for deep-linked passkey screens: null while checking, false = closed (the
 * screen is replaced by home, so production users never see anything).
 */
export function usePasskeyGate(redirectHome = true): boolean | null {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    isPasskeyPreviewAllowed()
      .catch(() => false)
      .then((ok) => {
        if (cancelled) return;
        setAllowed(ok);
        if (!ok && redirectHome) router.replace('/' as any);
      });
    return () => {
      cancelled = true;
    };
  }, [router, redirectHome]);
  return allowed;
}

export function ScreenHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/' as any)))}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Zurück"
      >
        <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'danger';

export function BigButton({
  label,
  onPress,
  kind = 'primary',
  busy = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const bg = kind === 'primary' ? colors.primary : kind === 'danger' ? colors.error : 'transparent';
  const fg = kind === 'secondary' ? colors.primary : '#fff';
  const inactive = busy || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: inactive ? 0.5 : pressed ? 0.85 : 1 },
        kind === 'secondary' && { borderWidth: 1.5, borderColor: colors.primary },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export type NoticeTone = 'info' | 'error' | 'success' | 'warning';

export function Notice({ tone, text }: { tone: NoticeTone; text: string }) {
  const { colors } = useTheme();
  const c =
    tone === 'error'
      ? { bg: colors.errorBackground, fg: colors.error }
      : tone === 'success'
        ? { bg: colors.successBackground, fg: colors.success }
        : tone === 'warning'
          ? { bg: colors.warningBackground, fg: colors.warning }
          : { bg: colors.surfaceSecondary, fg: colors.textSecondary };
  return (
    <View style={[styles.notice, { backgroundColor: c.bg }]} accessibilityLiveRegion="polite">
      <Text style={[styles.noticeText, { color: c.fg }]}>{text}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { backgroundColor: colors.surface }, style]}>{children}</View>;
}

export function Initials({ name, size = 40 }: { name: string; size?: number }) {
  const { colors } = useTheme();
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View style={[styles.initials, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceSecondary }]}>
      <Text style={[styles.initialsText, { color: colors.textSecondary, fontSize: size * 0.38 }]}>{letters || '?'}</Text>
    </View>
  );
}

/** Maps library errors to plain German (never shows stack / RPC text). */
export function friendlyError(e: unknown, fallback = 'Das hat nicht geklappt. Bitte versuche es erneut.'): string | null {
  const name = (e as { name?: string } | null)?.name;
  if (name === 'PasskeyCancelledError') return null; // the user closed the sheet: no error
  if (name === 'PasskeyNotSupportedError') return 'Dieses Gerät unterstützt keine Passkeys.';
  const msg = e instanceof Error ? e.message : '';
  if (/HTTP 429/.test(msg)) return 'Für heute sind zu viele Aktionen gelaufen. Bitte versuche es morgen erneut.';
  if (/HTTP 403|not sponsorable|deny|refus/i.test(msg)) return 'Diese Aktion ist gerade nicht möglich.';
  if (/timed out|timeout|abort|network/i.test(msg)) return 'Keine Verbindung. Bitte versuche es erneut.';
  return fallback;
}

export const passkeyStyles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 16, paddingBottom: 56, gap: 16 },
  lede: { fontFamily: fontFamily.heading, fontSize: 26, lineHeight: 31 },
  body: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 23 },
  bodySmall: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  sectionHeading: { fontFamily: fontFamily.medium, fontSize: 11, letterSpacing: 0.6, marginTop: 6, marginLeft: 4 },
  label: { fontFamily: fontFamily.semiBold, fontSize: 16 },
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { fontFamily: fontFamily.semiBold, fontSize: 17, flex: 1, textAlign: 'center', marginHorizontal: 12 },
  headerSpacer: { width: 24 },
  button: { minHeight: 56, borderRadius: 16, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: fontFamily.semiBold, fontSize: 17 },
  notice: { borderRadius: 12, padding: 14 },
  noticeText: { fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 21 },
  card: { borderRadius: 16, padding: 16, gap: 12 },
  initials: { alignItems: 'center', justifyContent: 'center' },
  initialsText: { fontFamily: fontFamily.semiBold },
});
