/**
 * Entry skeletons of the three main screens, measured from the real
 * components (ExploreSearchBar, ExploreCategoryChips, HeroEventCard,
 * CredentialCardStack, IdentityRow, ProfileActionGrid, ProfileMenu, posts) so
 * the fade to content reads as the page developing, not a different page.
 * All bones share one top-to-bottom sweep (SkeletonScope).
 */
import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { Bone, SkeletonScope } from '@/components/skeleton/Skeleton';
import { HERO_CAROUSEL_CARD_HEIGHT, HERO_CAROUSEL_GAP, HERO_CAROUSEL_PEEK, heroCarouselLayout } from '@/lib/hero-carousel-layout';
import { CARD_PEEK_FRONT, CARD_PEEK_STEP, STACK_TOP } from '@/components/profile/CredentialCardStack';
import { POSTER_ASPECT_RATIO } from '@/constants/poster';

/** Erkunden: search bar, category tiles, hero card with its neighbours, one rail. */
export function ExploreEntrySkeleton() {
  const { width } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const { cardWidth } = heroCarouselLayout(width);
  const railCard = Math.round((width - 16 - 12) / 2.3);
  return (
    <SkeletonScope>
      <Bone height={48} radius={12} style={styles.search} />
      <View style={styles.chips}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.chip}>
            <Bone width={48} height={48} radius={12} />
            <Bone width={44} height={10} radius={4} style={{ marginTop: 8 }} />
          </View>
        ))}
      </View>
      <View style={styles.heroRow}>
        <Bone width={HERO_CAROUSEL_PEEK} height={HERO_CAROUSEL_CARD_HEIGHT * 0.92} radius={24} />
        <View
          style={[
            styles.heroCard,
            { width: cardWidth, height: HERO_CAROUSEL_CARD_HEIGHT, borderColor: isDark ? colors.border : colors.borderSecondary },
          ]}
        >
          <Bone radius={18} style={styles.heroImage} />
          <View style={styles.heroContent}>
            <Bone width="80%" height={26} radius={6} />
            <Bone width="52%" height={26} radius={6} style={{ marginTop: 8 }} />
            <Bone width="38%" height={14} radius={4} style={{ marginTop: 12 }} />
            <View style={[styles.hairline, { backgroundColor: colors.borderSecondary }]} />
            <View style={styles.heroBottom}>
              <View style={styles.flexLines}>
                <Bone width="72%" height={12} radius={4} />
                <Bone width="46%" height={12} radius={4} />
              </View>
              <Bone width={104} height={48} radius={12} />
            </View>
          </View>
        </View>
        <Bone width={HERO_CAROUSEL_PEEK} height={HERO_CAROUSEL_CARD_HEIGHT * 0.92} radius={24} />
      </View>
      <Bone width="38%" height={22} radius={6} style={styles.railTitle} />
      <View style={styles.rail}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ width: railCard }}>
            <Bone width={railCard} height={Math.round(railCard / POSTER_ASPECT_RATIO)} radius={14} />
            <Bone width="78%" height={15} radius={4} style={{ marginTop: 12 }} />
            <Bone width="52%" height={12} radius={4} style={{ marginTop: 8 }} />
          </View>
        ))}
      </View>
    </SkeletonScope>
  );
}

/** Profil: the peeking credential cards, then the sheet with identity row, tiles and menu. */
export function ProfileEntrySkeleton({ sheetColor }: { sheetColor: string }) {
  const { width } = useWindowDimensions();
  const cardWidth = width - 32;
  const peeks = 2;
  const stackHeight = STACK_TOP + CARD_PEEK_STEP * (peeks - 1) + CARD_PEEK_FRONT;
  return (
    <SkeletonScope>
      <View style={{ height: stackHeight + 120 }}>
        {Array.from({ length: peeks }, (_, i) => {
          const front = i === peeks - 1;
          const w = front ? cardWidth : Math.round(cardWidth * 0.93);
          return (
            <Bone
              key={i}
              width={w}
              height={Math.round(cardWidth / 1.593)}
              radius={18}
              style={{ position: 'absolute', top: STACK_TOP + i * CARD_PEEK_STEP, left: 16 + (cardWidth - w) / 2 }}
            />
          );
        })}
      </View>
      <View style={[styles.sheet, { backgroundColor: sheetColor, marginTop: -120 + 8 }]}>
        <View style={styles.identity}>
          <Bone width={48} height={48} radius={24} />
          <View style={styles.flexLines}>
            <Bone width="55%" height={17} radius={5} />
            <Bone width="35%" height={12} radius={4} />
          </View>
          <Bone width={112} height={44} radius={22} />
        </View>
        <View style={styles.tiles}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.tile}>
              <Bone width={52} height={52} radius={16} />
              <Bone width={48} height={10} radius={4} style={{ marginTop: 8 }} />
            </View>
          ))}
        </View>
        <View style={styles.menu}>
          {[62, 48, 70, 54, 44, 58].map((w, i) => (
            <View key={i} style={styles.menuRow}>
              <Bone width={20} height={20} radius={6} />
              <Bone width={`${w}%`} height={15} radius={4} />
            </View>
          ))}
        </View>
      </View>
    </SkeletonScope>
  );
}

function PostBones() {
  const { colors } = useTheme();
  return (
    <View style={[styles.post, { borderBottomColor: colors.border }]}>
      <View style={styles.identityPost}>
        <Bone width={40} height={40} radius={20} />
        <View style={styles.flexLines}>
          <Bone width={140} height={14} radius={4} />
          <Bone width={90} height={11} radius={4} />
        </View>
      </View>
      <Bone width="100%" height={14} radius={4} />
      <Bone width="78%" height={14} radius={4} />
      <Bone height={220} radius={14} style={{ marginTop: 4 }} />
      <View style={styles.actions}>
        {[0, 1, 2, 3].map((i) => (
          <Bone key={i} width={40} height={16} radius={4} />
        ))}
      </View>
    </View>
  );
}

/** Austausch: a column of posts below the floating header. */
export function FeedEntrySkeleton() {
  return (
    <SkeletonScope>
      <PostBones />
      <PostBones />
      <PostBones />
    </SkeletonScope>
  );
}

const styles = StyleSheet.create({
  search: { marginHorizontal: 16, marginTop: 8, marginBottom: 12 },
  chips: { flexDirection: 'row', paddingHorizontal: 16, gap: 16, marginBottom: 12 },
  chip: { width: 64, alignItems: 'center' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: HERO_CAROUSEL_GAP, paddingTop: 4, paddingBottom: 16, overflow: 'hidden' },
  heroCard: { borderRadius: 24, borderWidth: 1, padding: 8 },
  heroImage: { flex: 1, width: '100%' },
  heroContent: { paddingHorizontal: 16, paddingVertical: 24 },
  hairline: { height: 1, marginVertical: 16 },
  heroBottom: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flexLines: { flex: 1, gap: 6 },
  railTitle: { marginHorizontal: 16, marginTop: 8, marginBottom: 12 },
  rail: { flexDirection: 'row', gap: 12, paddingLeft: 16 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, minHeight: 800 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  tiles: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 24 },
  tile: { alignItems: 'center' },
  menu: { paddingHorizontal: 16, marginTop: 28, gap: 24 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  post: { paddingHorizontal: 16, paddingVertical: 14, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  identityPost: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actions: { flexDirection: 'row', gap: 28, marginTop: 2 },
});
