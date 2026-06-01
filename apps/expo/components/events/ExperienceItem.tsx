import { useEffect, useRef, useState, RefObject } from 'react';
import { View, Text, Pressable, Alert, StyleSheet, Linking, ScrollView, findNodeHandle } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import PostAuthorRow from '@/components/feed/PostAuthorRow';
import PostImageGrid from '@/components/feed/PostImageGrid';
import ImageZoomModal from '@/components/ImageZoomModal';
import type { EventExperience } from '@/lib/types/feed';

type Props = {
  experience: EventExperience;
  isOwner: boolean;
  onDelete?: (experience: EventExperience) => void;
  isHighlighted?: boolean;
  scrollViewRef?: RefObject<ScrollView | null>;
};

export default function ExperienceItem({
  experience,
  isOwner,
  onDelete,
  isHighlighted = false,
  scrollViewRef,
}: Props) {
  const { colors } = useTheme();
  const [menuVisible, setMenuVisible] = useState(false);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [showHighlight, setShowHighlight] = useState(false);
  const cardRef = useRef<View>(null);

  useEffect(() => {
    if (!isHighlighted) return;
    const node = cardRef.current;
    const scrollNode = scrollViewRef?.current
      ? findNodeHandle(scrollViewRef.current)
      : null;
    if (!node || !scrollNode) return;

    const measureTimer = setTimeout(() => {
      node.measureLayout(
        scrollNode,
        (_x, y) => {
          scrollViewRef?.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
        },
        () => {},
      );
    }, 250);

    setShowHighlight(true);
    const fadeTimer = setTimeout(() => setShowHighlight(false), 2200);

    return () => {
      clearTimeout(measureTimer);
      clearTimeout(fadeTimer);
    };
  }, [isHighlighted, scrollViewRef]);

  const handleDelete = () => {
    Alert.alert('Erlebnis löschen', 'Möchtest du dieses Erlebnis wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () => onDelete?.(experience),
      },
    ]);
  };

  const imageUrls = experience.media_urls?.filter(Boolean) ?? [];

  return (
    <View
      ref={cardRef}
      style={[
        styles.card,
        { borderBottomColor: colors.border },
        showHighlight && { backgroundColor: colors.primaryLight },
      ]}
    >
      {/* Emoji or sticker banner */}
      {experience.sticker ? (
        <View style={[styles.emojiBanner, { backgroundColor: colors.primaryLight }]}>
          <Image
            source={{ uri: experience.sticker.asset_url }}
            style={styles.stickerBanner}
            contentFit="contain"
          />
        </View>
      ) : experience.emoji ? (
        <View style={[styles.emojiBanner, { backgroundColor: colors.primaryLight }]}>
          <Text style={styles.emoji}>{experience.emoji}</Text>
        </View>
      ) : null}

      <View style={styles.body}>
        {/* Author + menu */}
        <View style={styles.headerRow}>
          <View style={styles.authorContainer}>
            <PostAuthorRow
              author={experience.author}
              createdAt={experience.created_at}
            />
          </View>
          {isOwner && (
            <Pressable
              onPress={() => setMenuVisible(!menuVisible)}
              hitSlop={8}
              style={styles.menuButton}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>

        {/* Delete option */}
        {menuVisible && isOwner && (
          <Pressable
            onPress={handleDelete}
            style={[styles.deleteOption, { backgroundColor: colors.surfaceSecondary }]}
          >
            <Text style={[styles.deleteText, { color: colors.error }]}>Löschen</Text>
          </Pressable>
        )}

        {/* Content text */}
        <Text style={[styles.content, { color: colors.textPrimary }]}>
          {experience.content}
        </Text>

        {/* Images — same grid as feed posts */}
        {imageUrls.length > 0 && (
          <PostImageGrid imageUrls={imageUrls} onPress={(i) => setZoomImageUrl(imageUrls[i])} />
        )}

        <ImageZoomModal
          visible={!!zoomImageUrl}
          imageUrl={zoomImageUrl || ''}
          images={imageUrls}
          onClose={() => setZoomImageUrl(null)}
        />

        {/* Video */}
        {experience.video_url && (
          <Pressable
            onPress={() => Linking.openURL(experience.video_url!)}
            style={[styles.videoPlaceholder, { backgroundColor: colors.surfaceSecondary }]}
          >
            <Ionicons name="play-circle" size={24} color={colors.primary} />
            <Text style={[styles.videoLabel, { color: colors.textSecondary }]}>Video abspielen</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  emojiBanner: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  emoji: {
    fontSize: 48,
  },
  stickerBanner: {
    width: 140,
    height: 140,
  },
  body: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  authorContainer: {
    flex: 1,
  },
  menuButton: {
    paddingLeft: 8,
    paddingVertical: 4,
  },
  deleteOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-end',
  },
  deleteText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  content: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  videoPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
  },
  videoLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
