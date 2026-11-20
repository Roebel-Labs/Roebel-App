/**
 * MiniAppConsentSheet — the standard connect dialog of every mini app ("Verbinden mit …").
 *
 * Shows the app, a verified mark for reviewed apps, and what the app will see. Every row is a
 * check the person can tap off. "Verbinden" stores the choice (the host decides where: node
 * grants for version-2 apps, the device for version-1 apps) and then shows "Verbunden" briefly.
 * Closing with ✕ counts as answered too, so the dialog does not come back; the person can change
 * the choice later on the app's detail page.
 */
import React, { useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
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
  /** Reviewed app: a check after its name. */
  verified?: boolean;
  /** Saved: the button turns into "Verbunden" until the host closes the sheet. */
  connected?: boolean;
  onAllow(on: Set<ConsentKey>): void;
  onLater(): void;
};

const initialOn = (items: ConsentItem[]) => new Set(items.filter((i) => i.defaultOn).map((i) => i.key));

const SUCCESS = '#16A34A';
const VERIFIED = '#3B82F6';

function Check({ size, color, fill }: { size: number; color: string; fill: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z" fill={fill} />
      <Path d="m7.5 12.5 3 3 6-6.5" stroke={color} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function MiniAppConsentSheet({ visible, appName, iconUrl, items, busy, verified, connected, onAllow, onLater }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [on, setOn] = useState<Set<ConsentKey>>(() => initialOn(items));
  // A new set of items (a later open, a runtime request) starts from the defaults again.
  const [shownItems, setShownItems] = useState(items);
  if (shownItems !== items) {
    setShownItems(items);
    setOn(initialOn(items));
  }
  const locked = !!busy || !!connected;

  const toggle = (key: ConsentKey) =>
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const ink = isDark ? '#FFFFFF' : '#111114';
  const inkOn = isDark ? '#111114' : '#FFFFFF';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={locked ? undefined : onLater}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.card, marginBottom: Math.max(insets.bottom, 12) + 12 }]}>
          <View style={styles.topRow}>
            <View style={[styles.icon, { backgroundColor: colors.surfaceSecondary }]}>
              {iconUrl ? (
                <Image source={{ uri: iconUrl }} style={styles.iconImg} contentFit="cover" />
              ) : (
                <Text style={[styles.iconLetter, { color: colors.textPrimary }]}>{appName.slice(0, 1).toUpperCase()}</Text>
              )}
            </View>
            <Pressable
              onPress={onLater}
              disabled={locked}
              style={[styles.closeBtn, { borderColor: colors.borderSecondary }]}
              hitSlop={8}
              accessibilityLabel="Schließen"
            >
              <CloseIcon size={18} color={colors.textPrimary} />
            </Pressable>
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>{CONSENT_COPY.connectTitle}</Text>
          <View style={styles.subRow}>
            <Text style={[styles.subtitle, { color: colors.textPrimary }]} numberOfLines={1}>{`mit ${appName}`}</Text>
            {verified ? <Check size={20} color="#FFFFFF" fill={VERIFIED} /> : null}
          </View>
          <Text style={[styles.lead, { color: colors.textSecondary }]}>{CONSENT_COPY.connectLead}</Text>

          <View style={[styles.divider, { backgroundColor: colors.borderSecondary }]} />
          <Text style={[styles.sees, { color: colors.textSecondary }]}>{CONSENT_COPY.seesTitle}</Text>

          <ScrollView style={styles.list} bounces={false}>
            {items.map((item) => {
              const checked = on.has(item.key);
              return (
                <Pressable
                  key={item.key}
                  onPress={() => toggle(item.key)}
                  disabled={locked}
                  style={styles.row}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={item.title}
                >
                  {checked ? (
                    <Check size={24} color={inkOn} fill={ink} />
                  ) : (
                    <View style={[styles.unchecked, { borderColor: colors.borderSecondary }]} />
                  )}
                  <View style={styles.rowText}>
                    <Text style={[styles.rowTitle, { color: checked ? colors.textPrimary : colors.textSecondary }]}>{item.title}</Text>
                    {item.privateNote ? (
                      <Text style={[styles.rowNote, { color: colors.textSecondary }]}>{CONSENT_COPY.privateNote}</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          {connected ? (
            <View style={styles.done} accessibilityLiveRegion="polite">
              <Check size={26} color="#FFFFFF" fill={SUCCESS} />
              <Text style={[styles.doneText, { color: SUCCESS }]}>{CONSENT_COPY.connected}</Text>
            </View>
          ) : (
            <Pressable
              onPress={() => onAllow(new Set(on))}
              disabled={locked}
              accessibilityLabel={CONSENT_COPY.connectCta}
              style={({ pressed }) => [styles.cta, { backgroundColor: ink }, (pressed || busy) && { opacity: 0.8 }]}
            >
              <Text style={[styles.ctaText, { color: inkOn }]}>{busy ? 'Wird gespeichert…' : CONSENT_COPY.connectCta}</Text>
            </Pressable>
          )}
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
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fontFamily.heading,
    fontSize: 28,
  },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  subtitle: { fontFamily: fontFamily.medium, fontSize: 18, flexShrink: 1 },
  lead: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21, marginTop: 14 },
  sees: { fontFamily: fontFamily.regular, fontSize: 15, marginBottom: 6 },
  unchecked: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5 },
  done: { marginTop: 20, height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  doneText: { fontFamily: fontFamily.semiBold, fontSize: 18 },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 16,
    marginBottom: 14,
  },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
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
