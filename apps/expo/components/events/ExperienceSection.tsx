import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { fetchEventExperiences, deleteExperience } from '@/lib/supabase-experiences';
import ExperienceItem from './ExperienceItem';
import ExperienceComposer from './ExperienceComposer';
import type { EventExperience } from '@/lib/types/feed';

type Props = {
  eventId: string;
};

export default function ExperienceSection({ eventId }: Props) {
  const { colors } = useTheme();
  const { user } = useUser();

  const [experiences, setExperiences] = useState<EventExperience[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [composerVisible, setComposerVisible] = useState(false);

  const loadExperiences = useCallback(async (pageNum: number, append: boolean = false) => {
    if (pageNum === 0) setLoading(true);
    else setLoadingMore(true);

    const result = await fetchEventExperiences(eventId, pageNum);

    if (append) {
      setExperiences((prev) => [...prev, ...result.data]);
    } else {
      setExperiences(result.data);
    }
    setHasMore(result.hasMore);

    if (pageNum === 0) setLoading(false);
    else setLoadingMore(false);
  }, [eventId]);

  useEffect(() => {
    loadExperiences(0);
  }, [loadExperiences]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadExperiences(nextPage, true);
  };

  const handleExperienceCreated = () => {
    setPage(0);
    loadExperiences(0);
  };

  const handleDelete = async (experience: EventExperience) => {
    try {
      await deleteExperience(experience.id);
      setExperiences((prev) => prev.filter((e) => e.id !== experience.id));
    } catch {
      // Error logged in supabase-experiences.ts
    }
  };

  return (
    <View className="mt-6 gap-3">
      {/* Section Header */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Text className="text-lg font-inter-semibold text-text-primary">Erlebnisse</Text>
          {experiences.length > 0 && (
            <View className="bg-primary/10 px-2 py-0.5 rounded-full">
              <Text className="text-xs font-inter-semibold text-primary">{experiences.length}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Comment-input style bar — tapping opens the composer */}
      {user && (
        <Pressable
          onPress={() => setComposerVisible(true)}
          className="flex-row items-center gap-3 bg-surface rounded-xl px-4 py-3"
        >
          {user.profile_picture_url ? (
            <Image
              source={{ uri: user.profile_picture_url }}
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center">
              <Text className="text-sm font-inter-semibold text-primary">
                {(user.username || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text className="flex-1 text-sm text-text-tertiary font-inter-regular">
            Teile dein Erlebnis...
          </Text>
          <Ionicons name="camera-outline" size={20} color={colors.textTertiary} />
        </Pressable>
      )}

      {/* Loading State */}
      {loading && (
        <View className="py-6 items-center">
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}

      {/* Empty State */}
      {!loading && experiences.length === 0 && (
        <View className="bg-surface rounded-xl p-6 items-center gap-1">
          <Text className="text-sm font-inter-medium text-text-secondary">
            Noch keine Erlebnisse
          </Text>
          <Text className="text-xs font-inter-regular text-text-tertiary">
            Sei der/die Erste und teile dein Erlebnis!
          </Text>
        </View>
      )}

      {/* Experiences List */}
      {!loading && experiences.length > 0 && (
        <View className="gap-3">
          {experiences.map((experience) => (
            <ExperienceItem
              key={experience.id}
              experience={experience}
              isOwner={user?.wallet_address === experience.wallet_address}
              onDelete={handleDelete}
            />
          ))}
        </View>
      )}

      {/* Load More Button */}
      {hasMore && !loadingMore && (
        <Pressable onPress={handleLoadMore} className="items-center py-3">
          <Text className="text-sm font-inter-medium text-primary">Mehr laden</Text>
        </Pressable>
      )}
      {loadingMore && (
        <ActivityIndicator size="small" color={colors.primary} className="py-3" />
      )}

      {/* Composer */}
      {user && (
        <ExperienceComposer
          visible={composerVisible}
          onClose={() => setComposerVisible(false)}
          eventId={eventId}
          walletAddress={user.wallet_address}
          onExperienceCreated={handleExperienceCreated}
        />
      )}
    </View>
  );
}
