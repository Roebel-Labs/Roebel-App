import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import UserAvatarWithFrame from '@/components/UserAvatarWithFrame';
import ImageIcon from '@/assets/icons/image-01.svg';

type Props = {
  avatarUrl: string | null;
  onPress: () => void;
};

export default function PostBar({ avatarUrl, onPress }: Props) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.container,
        { backgroundColor: colors.background, borderBottomColor: colors.border },
      ]}
    >
      {/* Avatar — viewer's own, uses the equipped frame from the rewards hook */}
      <UserAvatarWithFrame size={36} uri={avatarUrl} />

      {/* Input area with gray background */}
      <View style={[styles.inputArea, { backgroundColor: colors.surfaceSecondary }]}>
        <Text style={[styles.placeholder, { color: colors.textTertiary }]}>
          Teile etwas mit Röbel
        </Text>
        <ImageIcon width={20} height={20} color={colors.textTertiary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  inputArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 8,
  },
  placeholder: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
});
