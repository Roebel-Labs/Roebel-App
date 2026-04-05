import { useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import PostAuthorRow from '@/components/feed/PostAuthorRow';
import PostImageGrid from '@/components/feed/PostImageGrid';
import { Ionicons } from '@expo/vector-icons';
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
    <View className="bg-surface rounded-xl overflow-hidden">
      {/* Emoji banner */}
      {experience.emoji && (
        <View className="items-center py-3 bg-primary/5">
          <Text className="text-4xl">{experience.emoji}</Text>
        </View>
      )}

      <View className="p-4 gap-3">
        {/* Author + menu */}
        <View className="flex-row items-center">
          <View className="flex-1">
            <PostAuthorRow
              author={experience.author}
              createdAt={experience.created_at}
            />
          </View>
          {isOwner && (
            <Pressable
              onPress={() => setMenuVisible(!menuVisible)}
              hitSlop={8}
              className="pl-2 py-1"
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>

        {/* Delete option */}
        {menuVisible && isOwner && (
          <Pressable
            onPress={handleDelete}
            className="self-end bg-surface-secondary px-3 py-2 rounded-lg"
          >
            <Text className="text-xs font-inter-medium" style={{ color: colors.error }}>
              Löschen
            </Text>
          </Pressable>
        )}

        {/* Content text */}
        <Text className="text-sm font-inter-regular leading-5 text-text-primary">
          {experience.content}
        </Text>

        {/* Images — same grid as feed posts */}
        {imageUrls.length > 0 && (
          <PostImageGrid imageUrls={imageUrls} />
        )}

        {/* Video */}
        {experience.video_url && (
          <Pressable className="flex-row items-center justify-center gap-2 bg-surface-secondary p-4 rounded-xl">
            <Ionicons name="play-circle" size={24} color={colors.primary} />
            <Text className="text-sm font-inter-medium text-text-secondary">
              Video abspielen
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
