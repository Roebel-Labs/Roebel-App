import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';

export type SegmentOption<T extends string> = {
  key: T;
  label: string;
};

type Props<T extends string> = {
  value: T;
  options: SegmentOption<T>[];
  onChange: (next: T) => void;
};

export default function SearchSegmentedTabs<T extends string>({
  value,
  options,
  onChange,
}: Props<T>) {
  const { colors, isDark } = useTheme();
  const [width, setWidth] = useState(0);
  const segmentWidth = width > 0 ? width / options.length : 0;

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.key === value)
  );

  const indicatorX = useSharedValue(0);

  useEffect(() => {
    if (segmentWidth > 0) {
      indicatorX.value = withSpring(selectedIndex * segmentWidth, {
        damping: 18,
        stiffness: 220,
        mass: 0.6,
      });
    }
  }, [selectedIndex, segmentWidth, indicatorX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };

  return (
    <View
      onLayout={onLayout}
      style={[styles.container, { backgroundColor: colors.surface }]}
    >
      {segmentWidth > 0 && (
        <Animated.View
          style={[
            styles.indicator,
            {
              width: segmentWidth - 8,
              backgroundColor: isDark ? colors.background : '#FFFFFF',
            },
            indicatorStyle,
          ]}
        />
      )}
      {options.map((opt) => {
        const isActive = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            style={styles.segment}
            onPress={() => onChange(opt.key)}
            hitSlop={6}
          >
            <Text
              style={[
                styles.label,
                {
                  color: isActive ? colors.textPrimary : colors.textSecondary,
                  fontFamily: isActive ? 'Inter-SemiBold' : 'Inter-Medium',
                },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 4,
    left: 4,
    bottom: 4,
    borderRadius: 9,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  label: {
    fontSize: 13,
  },
});
