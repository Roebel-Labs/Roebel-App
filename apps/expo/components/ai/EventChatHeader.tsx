/**
 * Header of the event-submission chat in the agent-chat look: a round glass back button and
 * Mecky's glass pill with the title, floating on the chat background (no rule underneath).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GlassCircleButton } from '@/components/chat/GlassCircleButton';
import { GlassPillHeader } from '@/components/chat/GlassPillHeader';
import { chatSize, useChatTokens } from '@/components/chat/tokens';
import { MECKY_AVATAR_SPEC } from '@/lib/chat/avatar-picture';

export default function EventChatHeader({ right }: { right?: React.ReactNode }) {
  const router = useRouter();
  const t = useChatTokens();
  return (
    <View style={styles.row}>
      <GlassCircleButton accessibilityLabel="Zurück" onPress={() => router.back()}>
        <Feather name="chevron-left" size={26} color={t.icon} />
      </GlassCircleButton>
      <GlassPillHeader avatars={[MECKY_AVATAR_SPEC]} names={['Mecky']} title="Event einreichen" style={styles.pill} />
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: chatSize.screenPadH,
    paddingTop: 8,
    paddingBottom: 8,
  },
  pill: { flexShrink: 1 },
  right: { flex: 1, alignItems: 'flex-end' },
});
