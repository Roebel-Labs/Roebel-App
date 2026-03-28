import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

const MARKER_POSITIONS = [
  { top: '18%', left: '25%' },
  { top: '22%', right: '20%' },
  { top: '40%', left: '12%' },
  { top: '45%', right: '15%' },
  { bottom: '38%', left: '20%' },
  { bottom: '32%', right: '25%' },
  { bottom: '22%', left: '35%' },
  { bottom: '18%', right: '35%' },
];

const STATUS_TEXTS = [
  'Suche Veranstaltungen...',
  'Karte wird vorbereitet...',
  'Fast fertig...',
];

export default function MapLoadingSkeleton() {
  const { colors } = useTheme();
  const radar1 = useRef(new Animated.Value(0)).current;
  const radar2 = useRef(new Animated.Value(0)).current;
  const radar3 = useRef(new Animated.Value(0)).current;
  const markersOpacity = useRef(new Animated.Value(0)).current;
  const [statusIndex, setStatusIndex] = useState(0);

  useEffect(() => {
    const createRadarAnimation = (anim: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 2000, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
    };

    const anim1 = createRadarAnimation(radar1, 0);
    const anim2 = createRadarAnimation(radar2, 600);
    const anim3 = createRadarAnimation(radar3, 1200);
    anim1.start(); anim2.start(); anim3.start();

    Animated.timing(markersOpacity, { toValue: 1, duration: 600, delay: 400, useNativeDriver: true }).start();

    const statusInterval = setInterval(() => {
      setStatusIndex((prev) => (prev + 1) % STATUS_TEXTS.length);
    }, 1500);

    return () => { anim1.stop(); anim2.stop(); anim3.stop(); clearInterval(statusInterval); };
  }, [radar1, radar2, radar3, markersOpacity]);

  const getRadarStyle = (anim: Animated.Value) => ({
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.2, 2.5] }) }],
    opacity: anim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] }),
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={StyleSheet.absoluteFillObject}>
        <View style={[styles.hLine, { top: '25%', backgroundColor: colors.borderSecondary }]} />
        <View style={[styles.hLine, { top: '50%', backgroundColor: colors.borderSecondary }]} />
        <View style={[styles.hLine, { top: '75%', backgroundColor: colors.borderSecondary }]} />
        <View style={[styles.vLine, { left: '25%', backgroundColor: colors.borderSecondary }]} />
        <View style={[styles.vLine, { left: '50%', backgroundColor: colors.borderSecondary }]} />
        <View style={[styles.vLine, { left: '75%', backgroundColor: colors.borderSecondary }]} />
      </View>

      <View style={styles.radarContainer}>
        <Animated.View style={[styles.radarCircle, { borderColor: colors.primary }, getRadarStyle(radar1)]} />
        <Animated.View style={[styles.radarCircle, { borderColor: colors.primary }, getRadarStyle(radar2)]} />
        <Animated.View style={[styles.radarCircle, { borderColor: colors.primary }, getRadarStyle(radar3)]} />

        <View style={styles.centerPin}>
          <View style={[styles.pinOuter, { backgroundColor: colors.primary, shadowColor: colors.primary }]}>
            <View style={[styles.pinInner, { backgroundColor: colors.background }]} />
          </View>
          <View style={styles.pinShadow} />
        </View>
      </View>

      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: markersOpacity }]}>
        {MARKER_POSITIONS.map((pos, index) => (
          <View key={index} style={[styles.marker, { backgroundColor: colors.disabled }, pos as any]} />
        ))}
      </Animated.View>

      <View style={styles.statusContainer}>
        <Text style={[styles.statusText, { color: colors.tabIconActive }]}>
          {STATUS_TEXTS[statusIndex]}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hLine: { position: 'absolute', left: 0, right: 0, height: 1 },
  vLine: { position: 'absolute', top: 0, bottom: 0, width: 1 },
  radarContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  radarCircle: { position: 'absolute', width: 120, height: 120, borderRadius: 9999, borderWidth: 2 },
  centerPin: { alignItems: 'center' },
  pinOuter: { width: 32, height: 32, borderRadius: 9999, justifyContent: 'center', alignItems: 'center', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  pinInner: { width: 12, height: 12, borderRadius: 9999 },
  pinShadow: { width: 16, height: 6, borderRadius: 12, marginTop: 4, backgroundColor: 'rgba(0, 0, 0, 0.15)' },
  marker: { position: 'absolute', width: 10, height: 10, borderRadius: 9999 },
  statusContainer: { position: 'absolute', bottom: 120, left: 0, right: 0, alignItems: 'center' },
  statusText: { fontSize: 16, fontFamily: 'Inter-Medium' },
});
