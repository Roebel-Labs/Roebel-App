import React, { useRef, useEffect } from 'react';
import { Pressable, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { LocationIcon } from '@/components/Icons';
import { BOTTOM_NAV_HEIGHT } from '@/components/BottomNavigation';

type Props = {
  visible?: boolean;
};

export default function MapFAB({ visible = true }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: visible ? 0 : 80,
        duration: 400,
        easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: 350,
        easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ scale: scaleAnim }, { translateY }],
          opacity,
        },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <Pressable
        onPress={() => router.push('/location' as any)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.pill, { backgroundColor: colors.background }]}
        accessibilityRole="button"
        accessibilityLabel="Karte öffnen"
      >
        <LocationIcon size={16} color={colors.textPrimary} />
        <Text style={[styles.label, { color: colors.textPrimary }]}>Karte</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: BOTTOM_NAV_HEIGHT + 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  label: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
});
