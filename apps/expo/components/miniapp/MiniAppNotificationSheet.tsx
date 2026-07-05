/**
 * MiniAppNotificationSheet — the notification opt-in prompt a mini app's host
 * shows on first open (reference: World-App/Remix "Turn on notifications").
 *
 * A FLOATING card: rounded on all four corners and inset from the screen
 * edges (not flush to the bottom). Content: app icon + ✕ circle, headline,
 * "für {App} ✓", divider, explainer, full-width dark pill CTA.
 *
 * Pure presentation — the host decides when to show it and persists the
 * decision (lib/miniapp-notifications.ts).
 */
import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { CloseIcon, VerifiedIcon } from '@/components/miniapp/hostIcons';
import { AppIcon } from '@/components/miniapp/MiniAppCard';
import type { MiniApp } from '@/lib/miniapps';

type Props = {
  visible: boolean;
  app: MiniApp;
  busy?: boolean;
  onEnable: () => void;
  onDismiss: () => void;
};

export default function MiniAppNotificationSheet({
  visible,
  app,
  busy,
  onEnable,
  onDismiss,
}: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onDismiss}>
        <Pressable
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              marginBottom: Math.max(insets.bottom, 12) + 12,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Icon + ✕ */}
          <View style={styles.topRow}>
            <AppIcon app={app} size={56} />
            <Pressable
              onPress={onDismiss}
              disabled={busy}
              style={[styles.closeBtn, { backgroundColor: colors.surfaceSecondary }]}
              hitSlop={8}
              accessibilityLabel="Schließen"
            >
              <CloseIcon size={18} color={colors.textPrimary} />
            </Pressable>
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Benachrichtigungen einschalten
          </Text>
          <View style={styles.appRow}>
            <Text style={[styles.appName, { color: colors.textSecondary }]} numberOfLines={1}>
              für {app.name}
            </Text>
            <VerifiedIcon size={16} color={colors.primary} />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.borderSecondary }]} />

          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Aktiviere Benachrichtigungen, um Neuigkeiten und Hinweise von dieser Mini-App zu
            erhalten.
          </Text>

          <Pressable
            onPress={onEnable}
            disabled={busy}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: isDark ? '#FFFFFF' : '#111114' },
              (pressed || busy) && { opacity: 0.8 },
            ]}
          >
            <Text style={[styles.ctaText, { color: isDark ? '#111114' : '#FFFFFF' }]}>
              {busy ? 'Wird gespeichert…' : 'Benachrichtigungen aktivieren'}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  // Floating card: inset from every edge, rounded on ALL corners.
  card: {
    marginHorizontal: 12,
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fontFamily.heading,
    fontSize: 24,
  },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  appName: {
    fontFamily: fontFamily.medium,
    fontSize: 16,
    flexShrink: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 16,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  cta: {
    marginTop: 20,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
  },
});
