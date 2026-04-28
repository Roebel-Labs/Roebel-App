import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';

type Props = Readonly<{
  label: string;
  onPress: () => void;
}>;

const PLACEHOLDER_IMAGE = require('@/assets/illustration/collections/events.png');

export default function AppSectionTile({ label, onPress }: Props) {
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
      accessibilityLabel={label}
    >
      <View style={styles.labelWrapper}>
        <Text style={[styles.label, { color: colors.textPrimary }]} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Image
        source={PLACEHOLDER_IMAGE}
        style={styles.image}
        contentFit="contain"
        transition={0}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    aspectRatio: 1.55,
    borderRadius: 12,
    paddingTop: 16,
    paddingLeft: 16,
    paddingBottom: 16,
    paddingRight: 0,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.7,
  },
  labelWrapper: {
    maxWidth: '55%',
  },
  label: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Inter-Medium',
  },
  image: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: '70%',
    height: '90%',
  },
});
