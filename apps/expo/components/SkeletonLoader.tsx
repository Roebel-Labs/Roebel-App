import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

type SkeletonProps = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: any;
};

export function Skeleton({ width = '100%', height = 20, borderRadius = 4, style }: SkeletonProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.skeleton,
        { width, height, borderRadius, backgroundColor: colors.skeleton },
        style
      ]}
    />
  );
}

export function EventCardSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[styles.eventCardSkeleton, { backgroundColor: colors.surface }]}>
      <Skeleton height={200} borderRadius={12} style={styles.imageSkeleton} />
      <View style={styles.contentSkeleton}>
        <View style={styles.headerSkeleton}>
          <Skeleton width="70%" height={20} />
          <Skeleton width={24} height={24} borderRadius={12} />
        </View>
        <Skeleton width="90%" height={16} style={{ marginTop: 8 }} />
        <View style={styles.metaSkeleton}>
          <Skeleton width={80} height={20} borderRadius={10} />
          <Skeleton width={100} height={16} />
        </View>
      </View>
    </View>
  );
}

export function HeroCardSkeleton() {
  return (
    <View style={styles.heroCardSkeleton}>
      <Skeleton height={450} borderRadius={20} />
    </View>
  );
}

export function CategoryChipSkeleton() {
  return (
    <View style={styles.chipContainer}>
      {[1, 2, 3, 4, 5].map((index) => (
        <View key={index} style={styles.chipSkeleton}>
          <Skeleton width={50} height={50} borderRadius={25} />
          <Skeleton width={50} height={12} style={{ marginTop: 8 }} />
        </View>
      ))}
    </View>
  );
}

export function NewsCardSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[styles.newsCardSkeleton, { backgroundColor: colors.surface }]}>
      <Skeleton height={200} borderRadius={12} style={styles.imageSkeleton} />
      <View style={styles.contentSkeleton}>
        <Skeleton width="85%" height={20} />
        <Skeleton width="95%" height={16} style={{ marginTop: 8 }} />
        <Skeleton width="90%" height={16} style={{ marginTop: 4 }} />
        <View style={styles.newsMetaSkeleton}>
          <Skeleton width={100} height={14} />
          <Skeleton width={60} height={14} />
        </View>
        <Skeleton width={120} height={12} style={{ marginTop: 4 }} />
      </View>
    </View>
  );
}

export function NewsDetailSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[styles.newsDetailSkeleton, { backgroundColor: colors.background }]}>
      {/* Cover Image - 16:9 aspect ratio */}
      <View style={{ width: '100%', aspectRatio: 16 / 9 }}>
        <Skeleton height="100%" />
      </View>

      <View style={{ padding: 16 }}>
        {/* Title (2 lines) - No category badge */}
        <Skeleton width="95%" height={28} style={{ marginBottom: 8 }} />
        <Skeleton width="70%" height={28} style={{ marginBottom: 16 }} />

        {/* Meta Information (3 rows) */}
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 8 }}>
          <Skeleton width={120} height={16} />
          <Skeleton width={80} height={16} />
          <Skeleton width={100} height={16} />
        </View>

        {/* View Count */}
        <Skeleton width={100} height={14} style={{ marginBottom: 16 }} />

        {/* Excerpt (3 lines) */}
        <Skeleton width="100%" height={18} style={{ marginBottom: 6 }} />
        <Skeleton width="100%" height={18} style={{ marginBottom: 6 }} />
        <Skeleton width="85%" height={18} style={{ marginBottom: 24 }} />

        {/* Content Paragraphs */}
        <Skeleton width="100%" height={16} style={{ marginBottom: 6 }} />
        <Skeleton width="100%" height={16} style={{ marginBottom: 6 }} />
        <Skeleton width="100%" height={16} style={{ marginBottom: 6 }} />
        <Skeleton width="95%" height={16} style={{ marginBottom: 16 }} />

        <Skeleton width="100%" height={16} style={{ marginBottom: 6 }} />
        <Skeleton width="100%" height={16} style={{ marginBottom: 6 }} />
        <Skeleton width="80%" height={16} style={{ marginBottom: 24 }} />

        {/* Author Card - with two buttons */}
        <View style={{ backgroundColor: colors.surfaceSecondary, padding: 16, borderRadius: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Skeleton width={48} height={48} borderRadius={24} />
              <View>
                <Skeleton width={120} height={16} style={{ marginBottom: 6 }} />
                <Skeleton width={60} height={14} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Skeleton width={100} height={36} borderRadius={8} />
              <Skeleton width={100} height={36} borderRadius={8} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

export function EventDetailSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[styles.eventDetailSkeleton, { backgroundColor: colors.background }]}>
      {/* Hero Image Section */}
      <View style={{ height: 400 }}>
        <Skeleton height={400} />
      </View>

      {/* Content Overlay */}
      <View style={{
        backgroundColor: colors.background,
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        marginTop: -30,
        padding: 24,
      }}>
        {/* Title and Category */}
        <View style={{ marginBottom: 20 }}>
          <Skeleton width="95%" height={26} style={{ marginBottom: 8 }} />
          <Skeleton width="70%" height={26} style={{ marginBottom: 12 }} />
          <Skeleton width={80} height={24} borderRadius={12} />
        </View>

        {/* Info Cards (Date, Location, Price) */}
        <View style={{ marginBottom: 24, gap: 12 }}>
          {[1, 2, 3].map((index) => (
            <View
              key={index}
              style={{
                flexDirection: 'row',
                backgroundColor: colors.surfaceSecondary,
                borderRadius: 12,
                padding: 16,
                gap: 12,
                alignItems: 'center',
              }}
            >
              <Skeleton width={40} height={40} borderRadius={20} />
              <View style={{ flex: 1 }}>
                <Skeleton width={100} height={12} style={{ marginBottom: 4 }} />
                <Skeleton width="80%" height={15} />
              </View>
            </View>
          ))}
        </View>

        {/* About Section */}
        <View style={{ marginBottom: 28 }}>
          <Skeleton width={180} height={18} style={{ marginBottom: 12 }} />
          <Skeleton width="100%" height={15} style={{ marginBottom: 6 }} />
          <Skeleton width="100%" height={15} style={{ marginBottom: 6 }} />
          <Skeleton width="100%" height={15} style={{ marginBottom: 6 }} />
          <Skeleton width="85%" height={15} />
        </View>

        {/* Organizer Section */}
        <View>
          <Skeleton width={120} height={18} style={{ marginBottom: 12 }} />
          <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <Skeleton width={36} height={36} borderRadius={18} />
              <Skeleton width={140} height={16} />
            </View>
            <View style={{ marginLeft: 48, gap: 8 }}>
              <Skeleton width="80%" height={14} />
              <Skeleton width="60%" height={14} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

export function RestaurantDetailSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Hero Image */}
      <Skeleton height={220} />

      {/* Content */}
      <View style={{ padding: 16 }}>
        {/* Name + Status */}
        <Skeleton width="70%" height={26} style={{ marginBottom: 8 }} />
        <Skeleton width={80} height={24} borderRadius={12} style={{ marginBottom: 16 }} />

        {/* Description */}
        <Skeleton width="100%" height={16} style={{ marginBottom: 6 }} />
        <Skeleton width="90%" height={16} style={{ marginBottom: 6 }} />
        <Skeleton width="75%" height={16} style={{ marginBottom: 24 }} />

        {/* Contact info */}
        <View style={{ gap: 12, marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Skeleton width={20} height={20} borderRadius={10} />
            <Skeleton width="60%" height={16} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Skeleton width={20} height={20} borderRadius={10} />
            <Skeleton width="50%" height={16} />
          </View>
        </View>

        {/* Menu categories */}
        <Skeleton width={120} height={22} style={{ marginBottom: 16 }} />
        {[1, 2, 3].map(i => (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
            <Skeleton width="60%" height={16} />
            <Skeleton width={60} height={16} />
          </View>
        ))}
      </View>
    </View>
  );
}

export function NotificationCardSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[styles.notificationCardSkeleton, { backgroundColor: colors.surface }]}>
      <Skeleton width={40} height={40} borderRadius={20} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="60%" height={14} />
        <Skeleton width="90%" height={12} />
        <Skeleton width={80} height={10} />
      </View>
    </View>
  );
}

export function MovieDetailSkeleton() {
  const { colors } = useTheme();
  return (
    <View style={[styles.movieDetailSkeleton, { backgroundColor: colors.background }]}>
      {/* Movie Poster Section */}
      <View style={{ height: 450 }}>
        <Skeleton height={450} />
      </View>

      {/* Content Overlay */}
      <View style={{
        backgroundColor: colors.background,
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        marginTop: -30,
        padding: 24,
      }}>
        {/* Title and FSK Badge */}
        <View style={{ marginBottom: 20 }}>
          <Skeleton width={80} height={24} borderRadius={8} style={{ marginBottom: 12 }} />
          <Skeleton width="95%" height={26} style={{ marginBottom: 8 }} />
          <Skeleton width="70%" height={26} />
        </View>

        {/* Trailer Button */}
        <Skeleton width="100%" height={48} borderRadius={12} style={{ marginBottom: 24 }} />

        {/* Description Section */}
        <View style={{ marginBottom: 28 }}>
          <Skeleton width={140} height={18} style={{ marginBottom: 12 }} />
          <Skeleton width="100%" height={16} style={{ marginBottom: 6 }} />
          <Skeleton width="100%" height={16} style={{ marginBottom: 6 }} />
          <Skeleton width="100%" height={16} style={{ marginBottom: 6 }} />
          <Skeleton width="90%" height={16} />
        </View>

        {/* Info Cards (Date, Time, Location, Price) */}
        <View style={{ marginBottom: 24, gap: 12 }}>
          {[1, 2, 3, 4].map((index) => (
            <View
              key={index}
              style={{
                flexDirection: 'row',
                backgroundColor: colors.surfaceSecondary,
                borderRadius: 12,
                padding: 16,
                gap: 12,
                alignItems: 'center',
              }}
            >
              <Skeleton width={40} height={40} borderRadius={20} />
              <View style={{ flex: 1 }}>
                <Skeleton width={80} height={12} style={{ marginBottom: 4 }} />
                <Skeleton width="70%" height={15} />
              </View>
            </View>
          ))}
        </View>

        {/* Organizer Section */}
        <View style={{ marginBottom: 28 }}>
          <Skeleton width={140} height={18} style={{ marginBottom: 12 }} />
          <View style={{ backgroundColor: colors.surfaceSecondary, borderRadius: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <Skeleton width={36} height={36} borderRadius={18} />
              <Skeleton width={160} height={16} />
            </View>
            <View style={{ marginLeft: 48 }}>
              <Skeleton width="85%" height={14} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    opacity: 0.7,
  },
  eventCardSkeleton: {
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  imageSkeleton: {
    margin: 0,
  },
  contentSkeleton: {
    padding: 16,
    gap: 8,
  },
  headerSkeleton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  metaSkeleton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  heroCardSkeleton: {
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  chipContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 20,
    marginBottom: 20,
  },
  chipSkeleton: {
    alignItems: 'center',
    gap: 8,
  },
  newsCardSkeleton: {
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  newsMetaSkeleton: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  newsDetailSkeleton: {
    flex: 1,
  },
  eventDetailSkeleton: {
    flex: 1,
  },
  movieDetailSkeleton: {
    flex: 1,
  },
  notificationCardSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 4,
  },
});
