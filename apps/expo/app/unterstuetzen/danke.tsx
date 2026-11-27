import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import ChristmasGarland from '@/components/christmas/ChristmasGarland';
import { confirmAppSupport } from '@/lib/app-support';

const ILLUSTRATION = require('@/assets/illustration/christmas/kasse_christmas.webp');

/**
 * Thank-you screen after every successful "Röbel App unterstützen" payment. Reached from the support
 * screen (with amount/interval/name) or from the web return page deep link (support_id only).
 * Settles the support right away so it is on the public list when they go back.
 */
export default function UnterstuetzenDankeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const p = useLocalSearchParams<{ support_id?: string; amount?: string; interval?: string; name?: string }>();
  const [listed, setListed] = useState(false);

  useEffect(() => {
    if (p.support_id) void confirmAppSupport(String(p.support_id)).then(setListed);
  }, [p.support_id]);

  const amount = Number(p.amount);
  const monthly = p.interval === 'month';
  const name = (p.name ?? '').trim();
  const what =
    Number.isFinite(amount) && amount > 0
      ? `${amount.toLocaleString('de-DE')} €${monthly ? ' im Monat' : ''}`
      : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 140 }} showsVerticalScrollIndicator={false}>
        <ChristmasGarland always />
        <Image source={ILLUSTRATION} style={styles.illustration} contentFit="contain" accessible={false} />

        <View style={styles.body}>
          <Text style={[styles.headline, { color: colors.textPrimary }]}>{name ? `Danke, ${name}!` : 'Danke!'}</Text>
          <Text style={[styles.text, { color: colors.textSecondary }]}>
            {what ? `Deine Unterstützung von ${what} ` : 'Deine Unterstützung '}
            hilft uns, die Röbel App weiter zu betreiben und für alle in Röbel besser zu machen.
          </Text>
          {monthly && (
            <Text style={[styles.text, { color: colors.textSecondary }]}>
              Du unterstützt uns ab jetzt jeden Monat. Die Quittung kommt per E-Mail.
            </Text>
          )}
          <View style={[styles.note, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.noteText, { color: colors.textPrimary }]}>
              {name
                ? `Du stehst jetzt als „${name}“ auf der Unterstützer-Liste.`
                : 'Du stehst jetzt als „Jemand“ auf der Unterstützer-Liste.'}
              {p.support_id && !listed ? ' Es kann einen Moment dauern, bis du dort auftauchst.' : ''}
            </Text>
          </View>
          <Text style={[styles.wish, { color: colors.textPrimary }]}>Frohe Weihnachten!</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Pressable
          onPress={() => router.replace('/unterstuetzen' as any)}
          style={[styles.secondary, { borderColor: colors.border }]}
          accessibilityRole="button"
        >
          <Text style={[styles.secondaryText, { color: colors.textPrimary }]}>Unterstützer-Liste ansehen</Text>
        </Pressable>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/explore' as any))}
          style={[styles.cta, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
        >
          <Text style={[styles.ctaText, { color: colors.onPrimary }]}>Fertig</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  illustration: { width: '100%', aspectRatio: 1600 / 893, marginTop: 8 },
  body: { paddingHorizontal: 24, paddingTop: 8, gap: 12, alignItems: 'center' },
  headline: { fontFamily: fontFamily.heading, fontSize: 30, textAlign: 'center' },
  text: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  note: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, marginTop: 4, alignSelf: 'stretch' },
  noteText: { fontFamily: fontFamily.medium, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  wish: { fontFamily: fontFamily.semiBold, fontSize: 16, marginTop: 4 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 12, paddingHorizontal: 20, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  cta: { height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: fontFamily.bold, fontSize: 17 },
  secondary: { height: 50, borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: fontFamily.semiBold, fontSize: 15 },
});
