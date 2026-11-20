/**
 * MiniAppConsentSheet — what a version-2 mini app asks to know about the person (profile,
 * account address, credentials). One switch per item, all on by default.
 *
 * Same floating-card pattern as MiniAppNotificationSheet. Pure presentation: the host decides
 * when to show it and stores the decision (lib/miniapp-identity.ts). "Nicht jetzt" still counts
 * the items as asked, so they are not asked again on the next open.
 */
import React, { useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, Switch, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ConsentKey } from '@netizen-labs/miniapp-sdk/host';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { CloseIcon } from '@/components/miniapp/hostIcons';
import { CONSENT_COPY, type ConsentItem } from '@/lib/miniapp-identity';

type Props = {
  visible: boolean;
  appName: string;
  iconUrl: string | null;
  items: ConsentItem[];
  busy?: boolean;
  onAllow(on: Set<ConsentKey>): void;
  onLater(): void;
};

const initialOn = (items: ConsentItem[]) => new Set(items.filter((i) => i.defaultOn).map((i) => i.key));

export default function MiniAppConsentSheet({ visible, appName, iconUrl, items, busy, onAllow, onLater }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [on, setOn] = useState<Set<ConsentKey>>(() => initialOn(items));
  // A new set of items (a later open, a runtime request) starts from the defaults again.
  const [shownItems, setShownItems] = useState(items);
  if (shownItems !== items) {
    setShownItems(items);
    setOn(initialOn(items));
  }

  const toggle = (key: ConsentKey, value: boolean) =>
    setOn((prev) => {
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={busy ? undefined : onLater}>
      <View style={styles.backdrop}>
        <View
          style={[styles.card, { backgroundColor: colors.card, marginBottom: Math.max(insets.bottom, 12) + 12 }]}
        >
          <View style={styles.topRow}>
            <View style={[styles.icon, { backgroundColor: colors.surfaceSecondary }]}>
              {iconUrl ? (
                <Image source={{ uri: iconUrl }} style={styles.iconImg} contentFit="cover" />
              ) : (
                <Text style={[styles.iconLetter, { color: colors.textPrimary }]}>
                  {appName.slice(0, 1).toUpperCase()}
                </Text>
              )}
            </View>
            <Pressable
              onPress={onLater}
              disabled={busy}
              style={[styles.closeBtn, { backgroundColor: colors.surfaceSecondary }]}
              hitSlop={8}
              accessibilityLabel="Schließen"
            >
              <CloseIcon size={18} color={colors.textPrimary} />
            </Pressable>
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>{`${appName} möchte wissen`}</Text>

          <View style={[styles.divider, { backgroundColor: colors.borderSecondary }]} />

          <ScrollView style={styles.list} bounces={false}>
            {items.map((item) => (
              <View key={item.key} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{item.title}</Text>
                  <Text style={[styles.rowDetail, { color: colors.textSecondary }]}>{item.detail}</Text>
                  {item.privateNote ? (
                    <Text style={[styles.rowNote, { color: colors.textSecondary }]}>{CONSENT_COPY.privateNote}</Text>
                  ) : null}
                </View>
                <Switch
                  value={on.has(item.key)}
                  onValueChange={(v) => toggle(item.key, v)}
                  disabled={busy}
                  trackColor={{ true: colors.primary, false: colors.surfaceSecondary }}
                  accessibilityLabel={item.title}
                />
              </View>
            ))}
          </ScrollView>

          <Pressable
            onPress={() => onAllow(new Set(on))}
            disabled={busy}
            accessibilityLabel="Erlauben"
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: isDark ? '#FFFFFF' : '#111114' },
              (pressed || busy) && { opacity: 0.8 },
            ]}
          >
            <Text style={[styles.ctaText, { color: isDark ? '#111114' : '#FFFFFF' }]}>
              {busy ? 'Wird gespeichert…' : 'Erlauben'}
            </Text>
          </Pressable>
          <Pressable onPress={onLater} disabled={busy} accessibilityLabel="Nicht jetzt" style={styles.secondary}>
            <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>Nicht jetzt</Text>
          </Pressable>

          <Text style={[styles.footer, { color: colors.textSecondary }]}>
            Du kannst das jederzeit auf der Seite der Mini-App ändern.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  card: {
    marginHorizontal: 12,
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    maxHeight: '88%',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 13,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconImg: { width: '100%', height: '100%' },
  iconLetter: { fontFamily: fontFamily.heading, fontSize: 22 },
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
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 16,
  },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  rowText: { flex: 1 },
  rowTitle: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  rowDetail: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, marginTop: 2 },
  rowNote: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 18, marginTop: 4 },
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
  secondary: {
    height: 44,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  footer: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 4,
  },
});
