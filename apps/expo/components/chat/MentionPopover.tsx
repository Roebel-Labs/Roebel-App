import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { BotAvatarSpec } from '@/lib/chat/types';
import { BotAvatar } from './BotAvatar';
import { chatFont, haloShadow, useChatTokens } from './tokens';

export type MentionCandidate = { id: string; name: string; avatar: BotAvatarSpec };

export type MentionPopoverProps = {
  candidates: MentionCandidate[];
  onSelect: (c: MentionCandidate) => void;
  style?: StyleProp<ViewStyle>;
};

/** "@" bot list above the composer (ref 10). */
export function MentionPopover({ candidates, onSelect, style }: MentionPopoverProps) {
  const t = useChatTokens();
  if (!candidates.length) return null;
  return (
    <View style={[styles.card, { backgroundColor: t.surface }, haloShadow(t, true), style]}>
      {candidates.map((c, i) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          accessibilityLabel={`${c.name} erwähnen`}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onSelect(c);
          }}
          style={({ pressed }) => [styles.row, pressed ? { backgroundColor: t.chipBackground } : null]}
        >
          <BotAvatar spec={c.avatar} size={22} />
          <View style={[styles.labelWrap, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: t.separator } : null]}>
            <Text numberOfLines={1} style={[styles.label, { color: t.textPrimary }]}>
              {c.name}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, overflow: 'hidden', paddingVertical: 1 },
  row: { height: 45, flexDirection: 'row', alignItems: 'center', paddingLeft: 17 },
  labelWrap: { flex: 1, alignSelf: 'stretch', justifyContent: 'center', marginLeft: 13 },
  label: { fontFamily: chatFont.regular, fontSize: 17 },
});

export default MentionPopover;
