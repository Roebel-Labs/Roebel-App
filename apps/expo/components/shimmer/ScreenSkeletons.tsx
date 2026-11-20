/**
 * Entry skeletons for ScreenShimmer — one per main screen, shaped after the
 * real layout so the fade to content reads as the page "developing", not as
 * a different page. Detail screens with a loading skeleton of their own
 * (event, post, account, mini apps) reuse that one instead.
 */
import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bone } from '@/components/shimmer/ScreenShimmer';
import { HERO_CAROUSEL_CARD_HEIGHT, HERO_CAROUSEL_PEEK, heroCarouselLayout } from '@/lib/hero-carousel-layout';

function PostBones() {
  return (
    <View style={styles.post}>
      <View style={styles.authorRow}>
        <Bone style={styles.avatar} />
        <View style={styles.authorLines}>
          <Bone style={{ width: 140, height: 14 }} />
          <Bone style={{ width: 90, height: 12 }} />
        </View>
      </View>
      <Bone style={{ width: '100%', height: 14 }} />
      <Bone style={{ width: '78%', height: 14 }} />
      <Bone style={styles.postMedia} />
      <View style={styles.actionRow}>
        <Bone style={{ width: 44, height: 16 }} />
        <Bone style={{ width: 44, height: 16 }} />
        <Bone style={{ width: 44, height: 16 }} />
      </View>
    </View>
  );
}

/** Austausch: a column of posts below the floating header. */
export function FeedEntrySkeleton() {
  return (
    <View>
      <PostBones />
      <PostBones />
      <PostBones />
    </View>
  );
}

/** Erkunden: search bar, category tiles, hero carousel, one rail. */
export function ExploreEntrySkeleton() {
  const { width } = useWindowDimensions();
  const { cardWidth } = heroCarouselLayout(width);
  return (
    <View>
      <Bone style={styles.search} />
      <View style={styles.chips}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.chip}>
            <Bone style={styles.chipIcon} />
            <Bone style={{ width: 48, height: 10 }} />
          </View>
        ))}
      </View>
      <View style={styles.hero}>
        <Bone style={{ width: HERO_CAROUSEL_PEEK, height: HERO_CAROUSEL_CARD_HEIGHT * 0.92, borderRadius: 24 }} />
        <Bone style={{ width: cardWidth, height: HERO_CAROUSEL_CARD_HEIGHT, borderRadius: 24 }} />
        <Bone style={{ width: HERO_CAROUSEL_PEEK, height: HERO_CAROUSEL_CARD_HEIGHT * 0.92, borderRadius: 24 }} />
      </View>
    </View>
  );
}

/** Profil: credential card, action tiles, menu rows. */
export function ProfileEntrySkeleton() {
  return (
    <View style={styles.page}>
      <Bone style={styles.card} />
      <View style={styles.tiles}>
        {[0, 1, 2, 3].map((i) => (
          <Bone key={i} style={styles.tile} />
        ))}
      </View>
      <MenuRows count={6} />
    </View>
  );
}

function MenuRows({ count }: { count: number }) {
  return (
    <View style={styles.menu}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.menuRow}>
          <Bone style={{ width: 24, height: 24, borderRadius: 6 }} />
          <Bone style={{ width: `${45 + ((i * 17) % 30)}%`, height: 15 }} />
        </View>
      ))}
    </View>
  );
}

/** Nachweise / generic card list below a stack header. */
export function CardListEntrySkeleton({ withHeader = true }: { withHeader?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.page, withHeader && { paddingTop: insets.top + 12 }]}>
      {withHeader && (
        <View style={styles.headerRow}>
          <Bone style={{ width: 28, height: 28, borderRadius: 14 }} />
          <Bone style={{ width: 140, height: 18 }} />
          <View style={{ width: 28 }} />
        </View>
      )}
      <Bone style={styles.card} />
      <Bone style={[styles.card, { height: 120 }]} />
      <MenuRows count={3} />
    </View>
  );
}

const styles = StyleSheet.create({
  post: { paddingHorizontal: 16, paddingVertical: 14, gap: 10 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  authorLines: { gap: 6 },
  postMedia: { width: '100%', height: 220, borderRadius: 14, marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 28, marginTop: 2 },
  search: { height: 48, borderRadius: 24, marginHorizontal: 16, marginTop: 8, marginBottom: 12 },
  chips: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 20 },
  chip: { alignItems: 'center', gap: 8 },
  chipIcon: { width: 56, height: 56, borderRadius: 16 },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  page: { paddingHorizontal: 16, paddingTop: 12, gap: 16 },
  card: { width: '100%', height: 200, borderRadius: 20 },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, height: 76, borderRadius: 16 },
  menu: { gap: 22, paddingTop: 8 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 32 },
});
