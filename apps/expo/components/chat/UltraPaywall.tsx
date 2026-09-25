import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { BotAvatarSpec } from '@/lib/chat/types';
import { BotAvatar, BOT_COLORS } from './BotAvatar';
import { BlackPillButton } from './BlackPillButton';
import { GlassCircleButton } from './GlassCircleButton';
import { chatFont, useChatTokens } from './tokens';

export type UltraPaywallProps = {
  /** Preformatted, e.g. "29,99 €/Monat". */
  price: string;
  onSubscribe: () => void;
  onRestore: () => void;
  onClose: () => void;
  botName?: string;
  avatar?: BotAvatarSpec;
  onTerms?: () => void;
  onPrivacy?: () => void;
  subscribing?: boolean;
  style?: StyleProp<ViewStyle>;
};

const DEFAULT_AVATAR: BotAvatarSpec = { shape: 'circle', color: BOT_COLORS.black, eyes: 'dashes' };

/** Ultra paywall card content (ref 19). Wrap it in a sheet / modal. */
export function UltraPaywall({
  price,
  onSubscribe,
  onRestore,
  onClose,
  botName = 'Mecky',
  avatar = DEFAULT_AVATAR,
  onTerms,
  onPrivacy,
  subscribing,
  style,
}: UltraPaywallProps) {
  const t = useChatTokens();
  const features = [
    `Voller Zugriff auf die Cloud-Agenten von ${botName}`,
    'Maximale Nutzung für Power-User',
    'Alles aus Ultra, auch unterwegs',
  ];
  const legal =
    Platform.OS === 'ios'
      ? 'Monatliches Abo mit automatischer Verlängerung. Deine Apple-ID wird jeden Monat belastet, bis du in den App-Store-Einstellungen kündigst.'
      : 'Monatliches Abo mit automatischer Verlängerung. Dein Google-Konto wird jeden Monat belastet, bis du im Play Store kündigst.';

  return (
    <View style={[styles.card, { backgroundColor: t.sheetBackground }, style]}>
      <View style={styles.header}>
        <GlassCircleButton tone="grey" size={42} accessibilityLabel="Schließen" onPress={onClose}>
          <Feather name="x" size={24} color={t.icon} />
        </GlassCircleButton>
        <Text style={[styles.headerTitle, { color: t.textPrimary }]}>Ultra holen</Text>
      </View>

      <View style={styles.content}>
        <BotAvatar spec={avatar} size={74} style={styles.avatar} />
        <Text style={[styles.title, { color: t.textPrimary }]}>{botName} läuft mit Ultra</Text>
        <Text style={[styles.subtitle, { color: t.textSecondary }]}>
          Ultra schaltet die Cloud-Agenten von {botName} mit den höchsten Nutzungslimits frei.
        </Text>

        <View style={[styles.features, { backgroundColor: t.groupedBackground }]}>
          {features.map((f) => (
            <View key={f} style={styles.feature}>
              <Feather name="check" size={20} color={t.paywallCheck} style={styles.check} />
              <Text style={[styles.featureText, { color: t.textPrimary }]}>{f}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.price, { color: t.textSecondary }]}>{price}</Text>
        <BlackPillButton label="Ultra abonnieren" onPress={onSubscribe} loading={subscribing} style={styles.cta} />
        <Pressable accessibilityRole="button" onPress={onRestore} hitSlop={8}>
          <Text style={[styles.restore, { color: t.textSecondary }]}>Käufe wiederherstellen</Text>
        </Pressable>

        <Text style={[styles.legal, { color: t.textTertiary }]}>{legal}</Text>
        <View style={styles.links}>
          <Text accessibilityRole="link" onPress={onTerms} style={[styles.link, { color: t.textSecondary }]}>
            AGB
          </Text>
          <Text accessibilityRole="link" onPress={onPrivacy} style={[styles.link, { color: t.textSecondary }]}>
            Datenschutz
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 40, paddingBottom: 24, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 18, gap: 16 },
  headerTitle: { fontFamily: chatFont.medium, fontSize: 17, letterSpacing: -0.2 },
  content: { paddingHorizontal: 30, alignItems: 'center' },
  avatar: { marginTop: 38 },
  title: { fontFamily: chatFont.semiBold, fontSize: 23, letterSpacing: -0.3, marginTop: 30, textAlign: 'center' },
  subtitle: { fontFamily: chatFont.regular, fontSize: 16, lineHeight: 19, textAlign: 'center', marginTop: 8 },
  features: { alignSelf: 'stretch', borderRadius: 18, paddingVertical: 20, paddingLeft: 16, paddingRight: 18, marginTop: 24, gap: 22 },
  feature: { flexDirection: 'row', alignItems: 'flex-start' },
  check: { width: 28, marginTop: 1 },
  featureText: { flex: 1, fontFamily: chatFont.regular, fontSize: 17, lineHeight: 22 },
  price: { fontFamily: chatFont.regular, fontSize: 16, marginTop: 48 },
  cta: { marginTop: 18 },
  restore: { fontFamily: chatFont.medium, fontSize: 17, marginTop: 28 },
  legal: { fontFamily: chatFont.regular, fontSize: 14, lineHeight: 17, textAlign: 'center', marginTop: 34 },
  links: { flexDirection: 'row', gap: 16, marginTop: 20 },
  link: { fontFamily: chatFont.regular, fontSize: 15 },
});

export default UltraPaywall;
