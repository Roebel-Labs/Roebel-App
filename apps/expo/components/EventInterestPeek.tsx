import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useInterest } from '@/context/InterestContext';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import AvatarStack from './AvatarStack';

type Props = {
  eventId: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The poster card's social line: a small avatar stack plus "N interessiert".
 * Reads the batched preview from InterestContext (loaded by the rail via
 * useInterestPreviews) and renders nothing until someone is interested, so
 * an empty event keeps a clean three-line caption.
 */
export default function EventInterestPeek({ eventId, style }: Props) {
  const { getPreview } = useInterest();
  const { colors } = useTheme();
  const preview = getPreview(eventId);

  if (!preview || preview.count === 0) return null;

  const visible = preview.users.slice(0, 3).map((u) => ({
    avatar_url: u.profile_picture_url,
    username: u.username,
  }));

  return (
    <View style={[styles.row, style]}>
      <AvatarStack users={visible} maxVisible={3} size="small" totalCount={visible.length} />
      <Text style={[styles.text, { color: colors.textSecondary }]} numberOfLines={1}>
        {preview.count} interessiert
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
  },
});
