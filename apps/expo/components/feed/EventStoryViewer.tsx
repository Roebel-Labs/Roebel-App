import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  PanResponder,
  useWindowDimensions,
  StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { EventRecord } from '@/lib/types';

type Props = {
  events: EventRecord[];
  initialIndex: number;
  onClose: () => void;
  onNavigateToEvent: (id: string) => void;
};

function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export default function EventStoryViewer({
  events,
  initialIndex,
  onClose,
  onNavigateToEvent,
}: Props) {
  const { width, height } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const event = events[currentIndex];

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8,
      onPanResponderRelease: (_, g) => {
        // Swipe up at least 60px → go to event detail
        if (g.dy < -60) {
          onNavigateToEvent(events[currentIndex].id);
        }
      },
    })
  ).current;

  const handleTap = useCallback(
    (side: 'left' | 'right') => {
      if (side === 'left') {
        setCurrentIndex((i) => Math.max(0, i - 1));
      } else {
        if (currentIndex < events.length - 1) {
          setCurrentIndex((i) => i + 1);
        } else {
          onClose();
        }
      }
    },
    [currentIndex, events.length, onClose]
  );

  if (!event) return null;

  const orgName = event.account?.name ?? event.organizer_name;
  const orgAvatar = (event.account as any)?.avatar_url ?? null;

  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar hidden />
      <View style={[styles.container, { width, height }]} {...panResponder.panHandlers}>

        {/* Background image */}
        {event.image_url ? (
          <Image
            source={{ uri: event.image_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.imageFallback]} />
        )}

        {/* Left / right tap zones — must be above image but below header */}
        <View style={styles.tapRow} pointerEvents="box-none">
          <Pressable style={styles.tapZone} onPress={() => handleTap('left')} />
          <Pressable style={styles.tapZone} onPress={() => handleTap('right')} />
        </View>

        {/* Progress bars */}
        <View style={styles.progressRow}>
          {events.map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressBar,
                {
                  backgroundColor:
                    i <= currentIndex
                      ? '#ffffff'
                      : 'rgba(255,255,255,0.35)',
                },
              ]}
            />
          ))}
        </View>

        {/* Header: org avatar + name + close */}
        <View style={styles.header}>
          <View style={styles.orgAvatarWrap}>
            {orgAvatar ? (
              <Image
                source={{ uri: orgAvatar }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            ) : (
              <Text style={styles.orgAvatarLetter}>
                {orgName.charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <View style={styles.orgInfo}>
            <Text style={styles.orgName} numberOfLines={1}>
              {orgName}
            </Text>
            <Text style={styles.eventDate}>{formatEventDate(event.date)}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={16} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#ffffff" />
          </Pressable>
        </View>

        {/* Bottom gradient */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.93)']}
          locations={[0, 0.45, 1]}
          style={styles.bottomGradient}
          pointerEvents="none"
        />

        {/* Bottom content */}
        <View style={styles.bottomContent} pointerEvents="box-none">
          <Text style={styles.eventTitle} numberOfLines={2}>
            {event.title}
          </Text>
          {event.location ? (
            <Text style={styles.eventMeta} numberOfLines={1}>
              {'\u{1F4CD}'} {event.location}
            </Text>
          ) : null}
          <Pressable
            style={styles.ctaBtn}
            onPress={() => onNavigateToEvent(event.id)}
            pointerEvents="auto"
          >
            <Ionicons name="chevron-up" size={18} color="#ffffff" />
            <Text style={styles.ctaText}>Mehr erfahren</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  imageFallback: {
    backgroundColor: '#1a2a4a',
  },
  tapRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    top: 120,
    bottom: 200,
  },
  tapZone: {
    flex: 1,
  },
  progressRow: {
    position: 'absolute',
    top: 52,
    left: 12,
    right: 12,
    flexDirection: 'row',
    gap: 4,
  },
  progressBar: {
    flex: 1,
    height: 2,
    borderRadius: 1,
  },
  header: {
    position: 'absolute',
    top: 64,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orgAvatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: '#ffffff',
    backgroundColor: '#194383',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  orgAvatarLetter: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  orgInfo: {
    flex: 1,
  },
  orgName: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  eventDate: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 260,
  },
  bottomContent: {
    position: 'absolute',
    bottom: 48,
    left: 20,
    right: 20,
  },
  eventTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    lineHeight: 28,
    marginBottom: 6,
  },
  eventMeta: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginBottom: 20,
  },
  ctaBtn: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: 2,
  },
  ctaText: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
});
