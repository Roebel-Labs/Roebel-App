import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { chatFont, chatSize, chatType, useChatTokens } from './tokens';

export type IntegrationCardProps = {
  provider: 'google_calendar';
  title: string;
  description: string;
  status: 'pending' | 'connected';
  onAuthorize?: () => void;
  style?: StyleProp<ViewStyle>;
};

function ProviderIcon() {
  // Google-Calendar-like tile ("31" on blue) — no brand asset shipped.
  return (
    <View style={styles.iconTile}>
      <View style={styles.iconInner}>
        <Text style={styles.iconText}>31</Text>
      </View>
    </View>
  );
}

/** Integration request card with black "Autorisieren" (ref 8). */
export function IntegrationCard({ title, description, status, onAuthorize, style }: IntegrationCardProps) {
  const t = useChatTokens();
  return (
    <View style={[styles.card, { backgroundColor: t.bubbleBot }, style]}>
      <View style={styles.head}>
        <ProviderIcon />
        <Text numberOfLines={1} style={[styles.title, { color: t.textPrimary }]}>
          {title}
        </Text>
      </View>
      <Text numberOfLines={2} style={[chatType.secondary, styles.desc, { color: t.textSecondary }]}>
        {description}
      </Text>
      {status === 'connected' ? (
        <View style={styles.connected}>
          <Feather name="check" size={18} color={t.check} />
          <Text style={[styles.connectedText, { color: t.textSecondary }]}>Verbunden</Text>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onAuthorize?.();
          }}
          style={({ pressed }) => [styles.btn, { backgroundColor: t.primaryButton, opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={[styles.btnText, { color: t.primaryButtonText }]}>Autorisieren</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'flex-start', width: chatSize.bubbleMaxWidth, borderRadius: chatSize.bubbleRadius, padding: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  iconTile: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInner: {
    width: 17,
    height: 17,
    borderRadius: 3,
    backgroundColor: '#4285F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { color: '#FFFFFF', fontFamily: chatFont.semiBold, fontSize: 9 },
  title: { fontFamily: chatFont.medium, fontSize: 18, letterSpacing: -0.2, flexShrink: 1 },
  desc: { marginTop: 8 },
  btn: { alignSelf: 'flex-start', height: 37, borderRadius: 9, paddingHorizontal: 12, justifyContent: 'center', marginTop: 14 },
  btnText: { fontFamily: chatFont.medium, fontSize: 16 },
  connected: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  connectedText: { fontFamily: chatFont.medium, fontSize: 15 },
});

export default IntegrationCard;
