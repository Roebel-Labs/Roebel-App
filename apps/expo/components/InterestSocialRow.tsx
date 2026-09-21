import React from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useInterest } from '@/context/InterestContext';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import AvatarStack from './AvatarStack';

type Props = {
  eventId: string;
  style?: StyleProp<ViewStyle>;
};

function label(count: number, interested: boolean): string {
  if (interested) {
    return count > 1 ? `Du und ${count - 1} weitere sind interessiert` : 'Du bist interessiert';
  }
  if (count === 0) return 'Sei die erste Person, die Interesse zeigt';
  return count === 1 ? '1 Person ist interessiert' : `${count} Personen sind interessiert`;
}

/**
 * Avatar stack + "N Personen sind interessiert" under the title on the
 * detail page; tapping opens the full list. Reads the same preview the
 * flyer orbs use, so both move together when interest is toggled.
 */
export default function InterestSocialRow({ eventId, style }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const { getPreview, isInterested } = useInterest();
  const preview = getPreview(eventId);
  if (!preview) return null;

  const interested = isInterested(eventId);
  const count = preview.count;
  const avatars = preview.users.slice(0, 4).map((u) => ({
    avatar_url: u.profile_picture_url,
    username: u.username,
  }));

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/event/[id]/interested' as any, params: { id: eventId } })}
      disabled={count === 0}
      hitSlop={8}
      style={({ pressed }) => [styles.row, style, pressed && count > 0 && styles.rowPressed]}
      accessibilityRole={count > 0 ? 'button' : undefined}
      accessibilityLabel={count > 0 ? 'Alle interessierten Personen anzeigen' : undefined}
    >
      {avatars.length > 0 && (
        <AvatarStack users={avatars} maxVisible={4} size="large" totalCount={count} />
      )}
      <Text style={[styles.text, { color: colors.textSecondary }]} numberOfLines={2}>
        {label(count, interested)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowPressed: {
    opacity: 0.6,
  },
  text: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    fontFamily: fontFamily.regular,
  },
});
