import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { SearchIcon } from '@/components/Icons';
import AnimatedSearchPlaceholder from '@/components/AnimatedSearchPlaceholder';

type Props = {
  onPress: () => void;
};

export default function ExploreSearchBar({ onPress }: Props) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.surfaceSecondary },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Suche öffnen"
    >
      <View style={styles.iconWrapper}>
        <SearchIcon width={20} height={20} color={colors.textTertiary} />
      </View>
      <AnimatedSearchPlaceholder fontSize={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    paddingHorizontal: 16,
    borderRadius: 24,
  },
  pressed: {
    opacity: 0.7,
  },
  iconWrapper: {
    marginRight: 12,
  },
});
