import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LocationIcon, CalendarIcon } from '@/components/Icons';
import { useTheme } from '@/context/ThemeContext';
import type { EventRecord } from '@/lib/types';

type Props = {
  event: EventRecord | null;
  onClose: () => void;
};

export default function EventPreviewCard({ event, onClose }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const slideAnim = useRef(new Animated.Value(500)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (event) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 65,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 500,
          tension: 65,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [event]);

  if (!event) return null;

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.card, { backgroundColor: colors.background }]}>
        <View style={styles.row}>
          {event.image_url ? (
            <Image
              source={{ uri: event.image_url }}
              style={[styles.image, { backgroundColor: colors.surface }]}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.imagePlaceholder, { backgroundColor: colors.surface }]}>
              <Text style={styles.placeholderIcon}>📍</Text>
            </View>
          )}

          <View style={styles.content}>
            <View style={styles.textContainer}>
              <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
                {event.title}
              </Text>
              <View style={styles.infoRow}>
                <LocationIcon width={14} height={14} color={colors.textSecondary} />
                <Text style={[styles.location, { color: colors.textSecondary }]} numberOfLines={1}>
                  {event.location}
                </Text>
              </View>
              {event.date && (
                <View style={styles.infoRow}>
                  <CalendarIcon width={14} height={14} color={colors.textSecondary} />
                  <Text style={[styles.date, { color: colors.textTertiary }]}>
                    {new Date(event.date).toLocaleDateString('de-DE', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Text>
                </View>
              )}
            </View>

            <Pressable
              style={[styles.detailsButton, { backgroundColor: colors.tabIconActive }]}
              onPress={() => {
                router.push({
                  pathname: '/event/[id]',
                  params: { id: event.id },
                });
              }}
            >
              <Text style={[styles.detailsButtonText, { color: colors.onPrimary }]}>Details</Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.closeButton, { backgroundColor: colors.surface }]}
            onPress={onClose}
          >
            <Text style={[styles.closeButtonText, { color: colors.textSecondary }]}>×</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 140,
    left: 16,
    right: 16,
    zIndex: 1000,
  },
  backdrop: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
    backgroundColor: 'transparent',
  },
  card: {
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
    padding: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  image: {
    width: 80,
    height: 80,
    borderRadius: 12,
  },
  imagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 32,
  },
  content: {
    flex: 1,
    gap: 8,
  },
  textContainer: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    marginBottom: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  location: {
    fontSize: 13,
    fontFamily: 'Inter',
    flex: 1,
  },
  date: {
    fontSize: 12,
    fontFamily: 'Inter',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  closeButtonText: {
    fontFamily: 'MonaSansSemiCondensed-Bold',
    fontSize: 20,
    lineHeight: 20,
  },
  detailsButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  detailsButtonText: {
    fontSize: 14,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});
