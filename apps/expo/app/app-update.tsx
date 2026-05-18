/**
 * Full-screen "Update verfügbar" modal.
 *
 * Triggered by AppUpdateGate when the installed app version is older than the
 * platform-specific `latest_version` set in `app_release_config`. Soft-block:
 * the secondary "Später" button dismisses for the current session only; the
 * modal re-appears on cold launch and on background → foreground.
 */

import React from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAppReleaseGate } from '@/hooks/useAppReleaseGate';

export default function AppUpdateModalScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const {
    currentVersion,
    latestVersion,
    storeUrl,
    title,
    body,
    ctaLabel,
    dismissLabel,
    dismiss,
  } = useAppReleaseGate();

  const handleOpenStore = () => {
    Linking.openURL(storeUrl).catch(() => {
      // ignore — system handles "no app available" itself
    });
  };

  const handleDismiss = () => {
    dismiss();
    if (router.canGoBack()) router.back();
    else router.replace('/' as any);
  };

  const storeLabel = Platform.OS === 'ios' ? 'App Store' : 'Google Play';

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right', 'bottom']}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: colors.primary + '1A' },
          ]}
        >
          <Ionicons name="arrow-up-circle" size={72} color={colors.primary} />
        </View>

        <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>Röbel App</Text>
        <Text style={[styles.headline, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.lede, { color: colors.textSecondary }]}>{body}</Text>

        <View
          style={[
            styles.versionsCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.versionRow}>
            <Text style={[styles.versionLabel, { color: colors.textTertiary }]}>
              Deine Version
            </Text>
            <Text style={[styles.versionValue, { color: colors.textPrimary }]}>
              {currentVersion}
            </Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.versionRow}>
            <Text style={[styles.versionLabel, { color: colors.textTertiary }]}>
              Neueste Version
            </Text>
            <Text style={[styles.versionValue, { color: colors.primary }]}>
              {latestVersion}
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Pressable
          onPress={handleOpenStore}
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel={`${ctaLabel} im ${storeLabel}`}
        >
          <Text style={[styles.primaryLabel, { color: colors.onPrimary }]}>
            {ctaLabel}
          </Text>
        </Pressable>
        <Pressable
          onPress={handleDismiss}
          style={styles.tertiaryButton}
          accessibilityRole="button"
        >
          <Text style={[styles.tertiaryLabel, { color: colors.textSecondary }]}>
            {dismissLabel}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
    alignItems: 'center',
  },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    marginTop: 16,
  },
  eyebrow: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headline: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    lineHeight: 34,
    marginBottom: 12,
    textAlign: 'center',
  },
  lede: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
    marginBottom: 24,
    textAlign: 'center',
  },
  versionsCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  versionLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  versionValue: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  primaryButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryLabel: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  tertiaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  tertiaryLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
