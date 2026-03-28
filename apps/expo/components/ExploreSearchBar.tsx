import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { SearchIcon } from '@/components/Icons';

type Props = {
  onPress: () => void;
};

export default function ExploreSearchBar({ onPress }: Props) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[styles.container, { backgroundColor: colors.surface }]}
      accessibilityRole="button"
      accessibilityLabel="Suche öffnen"
    >
      <View style={styles.iconWrapper}>
        <SearchIcon width={20} height={20} color={colors.textTertiary} />
      </View>
      <Text style={[styles.placeholder, { color: colors.textTertiary }]}>
        Suche in Röbel...
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  iconWrapper: {
    marginRight: 10,
  },
  placeholder: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
});
