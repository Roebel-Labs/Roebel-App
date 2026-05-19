import { useState, useEffect, useCallback, useImperativeHandle, forwardRef, RefObject } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, ScrollView, Image } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { fetchEventExperiences, deleteExperience } from '@/lib/supabase-experiences';
import ExperienceItem from './ExperienceItem';
import ImageIcon from '@/assets/icons/image-01.svg';
import type { EventExperience } from '@/lib/types/feed';

const MAX_HIGHLIGHT_PAGES = 5;

type Props = {
  eventId: string;
  /** Optional id of an experience to scroll to and visually highlight */
  highlightExperienceId?: string;
  /** Parent ScrollView ref so the highlighted item can scroll itself into view */
  scrollViewRef?: RefObject<ScrollView | null>;
  /** Called when the user taps the in-section composer trigger */
  onOpenComposer?: () => void;
};

export type ExperienceSectionHandle = {
  refresh: () => void;
  prepend: (experience: EventExperience) => void;
};

const ExperienceSection = forwardRef<ExperienceSectionHandle, Props>(function ExperienceSection(
  { eventId, highlightExperienceId, scrollViewRef, onOpenComposer },
  ref,
) {
  const { colors } = useTheme();
  const { user } = useUser();

  const [experiences, setExperiences] = useState<EventExperience[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

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

  useImperativeHandle(ref, () => ({
    refresh: () => {
      setPage(0);
      loadExperiences(0);
    },
    prepend: (experience: EventExperience) => {
      setExperiences((prev) => [experience, ...prev]);
    },
  }), [loadExperiences]);

  // Page through experiences until the highlighted one shows up (or give up).
  useEffect(() => {
    if (!highlightExperienceId || loading) return;
    if (experiences.some((e) => e.id === highlightExperienceId)) return;
    if (!hasMore) return;
    if (page >= MAX_HIGHLIGHT_PAGES - 1) return;
    if (loadingMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    loadExperiences(nextPage, true);
  }, [highlightExperienceId, experiences, hasMore, loading, loadingMore, page, loadExperiences]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadExperiences(nextPage, true);
  };

  const handleDelete = async (experience: EventExperience) => {
    const walletAddress = user?.wallet_address;
    if (!walletAddress) return;
    if (experience.wallet_address?.toLowerCase() !== walletAddress.toLowerCase()) return;
    try {
      await deleteExperience(experience.id, walletAddress);
      setExperiences((prev) => prev.filter((e) => e.id !== experience.id));
    } catch {
      // Error logged in supabase-experiences.ts
    }
  };

  return (
    <View style={styles.section}>
      {/* Section Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Erlebnisse</Text>
          {experiences.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.countText, { color: colors.primary }]}>{experiences.length}</Text>
            </View>
          )}
        </View>
      </View>

      {/* In-section composer trigger */}
      {user && onOpenComposer && (
        <Pressable
          onPress={onOpenComposer}
          style={[styles.trigger, { backgroundColor: colors.surfaceSecondary }]}
          accessibilityRole="button"
          accessibilityLabel="Erlebnis teilen"
        >
          {user.profile_picture_url ? (
            <Image source={{ uri: user.profile_picture_url }} style={styles.triggerAvatar} />
          ) : (
            <View style={[styles.triggerAvatarFallback, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.triggerAvatarText, { color: colors.primary }]}>
                {(user.username || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={[styles.triggerPlaceholder, { color: colors.textTertiary }]}>
            Teile dein Erlebnis...
          </Text>
          <ImageIcon width={20} height={20} color={colors.textTertiary} />
        </Pressable>
      )}

      {/* Loading State */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}

      {/* Empty State */}
      {!loading && experiences.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
            Noch keine Erlebnisse
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
            Sei der/die Erste und teile dein Erlebnis!
          </Text>
        </View>
      )}

      {/* Experiences List */}
      {!loading && experiences.length > 0 && (
        <View style={styles.list}>
          {experiences.map((experience) => (
            <ExperienceItem
              key={experience.id}
              experience={experience}
              isOwner={user?.wallet_address === experience.wallet_address}
              onDelete={handleDelete}
              isHighlighted={experience.id === highlightExperienceId}
              scrollViewRef={scrollViewRef}
            />
          ))}
        </View>
      )}

      {/* Load More Button */}
      {hasMore && !loadingMore && (
        <Pressable onPress={handleLoadMore} style={styles.loadMoreButton}>
          <Text style={[styles.loadMoreText, { color: colors.primary }]}>Mehr laden</Text>
        </Pressable>
      )}
      {loadingMore && (
        <ActivityIndicator size="small" color={colors.primary} style={styles.loadingMore} />
      )}
    </View>
  );
});

export default ExperienceSection;

const styles = StyleSheet.create({
  section: {
    marginTop: 24,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  triggerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  triggerAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  triggerAvatarText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  triggerPlaceholder: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  loadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  list: {
    gap: 0,
  },
  loadMoreButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  loadMoreText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  loadingMore: {
    paddingVertical: 12,
  },
});
