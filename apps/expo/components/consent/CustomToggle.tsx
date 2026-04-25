import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
};

export function CustomToggle({ value, onChange, disabled }: Props) {
  const { colors } = useTheme();
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [value, progress]);

  const trackBackground = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.borderSecondary, colors.primary],
  });
  const thumbTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 22],
  });

  if (disabled) {
    return (
      <View
        style={[
          styles.track,
          {
            backgroundColor: colors.disabled,
            opacity: 0.6,
            justifyContent: 'center',
            alignItems: value ? 'flex-end' : 'flex-start',
            paddingHorizontal: 2,
          },
        ]}
      >
        <View style={[styles.thumb, { backgroundColor: '#ffffff' }]}>
          {value && <Text style={[styles.check, { color: colors.primary }]}>✓</Text>}
        </View>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => onChange(!value)}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <Animated.View style={[styles.track, { backgroundColor: trackBackground }]}>
        <Animated.View
          style={[
            styles.thumb,
            { backgroundColor: '#ffffff', transform: [{ translateX: thumbTranslate }] },
          ]}
        >
          {value && <Text style={[styles.check, { color: colors.primary }]}>✓</Text>}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 48,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
  },
  thumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  check: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
});
