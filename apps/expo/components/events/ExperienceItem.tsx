import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking, Alert } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import PostAuthorRow from '@/components/feed/PostAuthorRow';
import PostImageGrid from '@/components/feed/PostImageGrid';
import type { EventExperience } from '@/lib/types/feed';

type Props = {
  experience: EventExperience;
  isOwner: boolean;
  onDelete?: (experience: EventExperience) => void;
};

export default function ExperienceItem({ experience, isOwner, onDelete }: Props) {
  const { colors } = useTheme();
  const [menuVisible, setMenuVisible] = useState(false);

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
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      {experience.emoji && (
        <Text style={styles.emoji}>{experience.emoji}</Text>
      )}

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
            <Text style={[styles.menuDots, { color: colors.textTertiary }]}>···</Text>
          </Pressable>
        )}
      </View>

      {menuVisible && isOwner && (
        <Pressable onPress={handleDelete} style={[styles.deleteOption, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.deleteText, { color: colors.error }]}>Löschen</Text>
        </Pressable>
      )}

      <Text style={[styles.content, { color: colors.textPrimary }]}>
        {experience.content}
      </Text>

      {imageUrls.length > 0 && (
        <PostImageGrid imageUrls={imageUrls} />
      )}

      {experience.video_url && (
        <Pressable
          onPress={() => Linking.openURL(experience.video_url!)}
          style={[styles.videoPlaceholder, { backgroundColor: colors.surfaceSecondary }]}
        >
          <Text style={[styles.videoIcon]}>▶</Text>
          <Text style={[styles.videoLabel, { color: colors.textSecondary }]}>Video abspielen</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  emoji: {
    fontSize: 48,
    textAlign: 'center',
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
  menuDots: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    letterSpacing: 1,
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
  videoIcon: {
    fontSize: 20,
  },
  videoLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
