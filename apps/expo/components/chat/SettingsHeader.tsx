import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { GlassCircleButton } from './GlassCircleButton';
import { chatFont, chatSize, useChatTokens } from './tokens';

/** Header of the chat settings screens: floating back circle + centered title (chat list style). */
export function SettingsHeader({ title }: { title: string }) {
  const t = useChatTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <GlassCircleButton
        accessibilityLabel="Zurück"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/chat' as Href))}
      >
        <Feather name="chevron-left" size={26} color={t.icon} />
      </GlassCircleButton>
      <Text numberOfLines={1} style={[styles.title, { color: t.textPrimary }]}>
        {title}
      </Text>
      <View style={styles.spacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 8, gap: 12 },
  title: { flex: 1, textAlign: 'center', fontFamily: chatFont.semiBold, fontSize: 18, letterSpacing: -0.2 },
  spacer: { width: chatSize.control },
});

export default SettingsHeader;
