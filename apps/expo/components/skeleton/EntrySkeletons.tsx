/**
 * Entry skeletons of the three main screens — geometry taken 1:1 from the real
 * components so nothing moves when content replaces them (Max 2026-11-21):
 *
 *   Erkunden  ExploreSearchBar + ExploreCategoryChips are rendered for REAL
 *             (static, no data), then HeroCarouselSkeleton (= hero block incl.
 *             pagination space) and RailSectionSkeleton (= ThisWeekEventsHorizontal
 *             + HorizontalEventCard).
 *   Profil    exact CredentialCardStack zone for the real card count, ProfileSheet
 *             paddings, IdentityRow, 3-column ProfileActionGrid, ProfileMenu rows.
 *   Austausch FeedList top padding, HomeStoryBar row, FeedPostSkeleton.
 *
 * Text bones (TextBone) hold an invisible copy of the real text style, so line
 * heights match by construction. All bones share one top-to-bottom sweep.
 */
import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { Bone, SkeletonScope, TextBone } from '@/components/skeleton/Skeleton';
import { HeroCarouselSkeleton } from '@/components/SkeletonLoader';
import ExploreSearchBar from '@/components/ExploreSearchBar';
import ExploreCategoryChips from '@/components/ExploreCategoryChips';
import FeedPostSkeleton from '@/components/feed/FeedPostSkeleton';
import { CARD_PEEK_STEP, STACK_TOP, stackHeight } from '@/components/profile/CredentialCardStack';
import { TILE_RADIUS, TILE_SIZE } from '@/components/profile/ProfileActionTile';
import { POSTER_ASPECT_RATIO, POSTER_CARD_WIDTH, POSTER_RADIUS } from '@/constants/poster';
import { CARD_ASPECT } from '@/components/profile/credential-art';

const noop = () => {};

/** One event rail exactly like ThisWeekEventsHorizontal with HorizontalEventCard items. */
export function RailSectionSkeleton({ titleWidth = '40%' }: { titleWidth?: `${number}%` | number }) {
  const posterHeight = Math.round(POSTER_CARD_WIDTH / POSTER_ASPECT_RATIO);
  return (
    <SkeletonScope style={rail.container}>
      <View style={rail.header}>
        <TextBone textStyle={rail.sectionTitle} width={titleWidth} />
      </View>
      <View style={rail.list}>
        {[0, 1].map((i) => (
          <View key={i} style={{ width: POSTER_CARD_WIDTH }}>
            <Bone width={POSTER_CARD_WIDTH} height={posterHeight} radius={POSTER_RADIUS} />
            <View style={rail.caption}>
              <TextBone textStyle={rail.title} width="72%" />
              <TextBone textStyle={rail.meta} width="56%" />
              <TextBone textStyle={rail.meta} width="40%" />
            </View>
          </View>
        ))}
      </View>
    </SkeletonScope>
  );
}

/** Erkunden: real search bar + category row, then hero block and the first rail. */
export function ExploreEntrySkeleton() {
  return (
    <View pointerEvents="none">
      <ExploreSearchBar onPress={noop} />
      <ExploreCategoryChips />
      <View style={explore.hero}>
        <HeroCarouselSkeleton />
      </View>
      <RailSectionSkeleton titleWidth="35%" />
    </View>
  );
}

/** Profil: the peeking credential cards, then the sheet with identity row, tiles and menu. */
export function ProfileEntrySkeleton({ sheetColor, cardCount = 0 }: { sheetColor: string; cardCount?: number }) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const cardWidth = width - 32;
  const cardHeight = Math.round(cardWidth / CARD_ASPECT);
  const count = cardCount;
  return (
    <SkeletonScope>
      {/* = CredentialCardStack zone: STACK_TOP + stackHeight(count), cards overflow below.
          No cards (org / guest): no zone, the sheet is "flat" with marginTop 12. */}
      {count > 0 ? (
      <View style={[profile.zone, { height: STACK_TOP + stackHeight(count) }]}>
        {Array.from({ length: count }, (_, i) => {
          const front = i === count - 1;
          const w = front ? cardWidth : Math.round(cardWidth * 0.93);
          return (
            <Bone
              key={i}
              width={w}
              height={cardHeight}
              radius={18}
              style={{ position: 'absolute', top: STACK_TOP + i * CARD_PEEK_STEP, left: 16 + (cardWidth - w) / 2 }}
            />
          );
        })}
      </View>
      ) : null}
      {/* = ProfileSheet (paddingTop 20, rounded top, above the cards). */}
      <View style={[profile.sheet, { backgroundColor: sheetColor }, count === 0 && { marginTop: 12 }]}>
        <View style={profile.identity}>
          <Bone width={48} height={48} radius={24} />
          <View style={profile.texts}>
            <TextBone textStyle={profile.name} width="55%" />
            <TextBone textStyle={profile.sub} width="32%" />
          </View>
          <Bone width={150} height={44} radius={22} />
        </View>
        <View style={profile.grid}>
          {Array.from({ length: 6 }, (_, i) => (
            <View key={i} style={profile.cell}>
              <Bone width={TILE_SIZE} height={TILE_SIZE} radius={TILE_RADIUS} />
              <TextBone textStyle={profile.tileLabel} width={64} lines={2} />
            </View>
          ))}
        </View>
        <View style={profile.menu}>
          {[2, 5].map((rows, g) => (
            <React.Fragment key={g}>
              {g > 0 ? <View style={[profile.divider, { backgroundColor: colors.border }]} /> : null}
              <View style={profile.group}>
                {Array.from({ length: rows }, (_, i) => (
                  <View key={i} style={profile.menuRow}>
                    <Bone width={20} height={20} radius={6} />
                    <TextBone textStyle={profile.menuLabel} width={`${46 + ((i * 17 + g * 9) % 28)}%`} />
                  </View>
                ))}
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>
    </SkeletonScope>
  );
}

/** Austausch: FeedList's top padding, the story row, then posts. */
export function FeedEntrySkeleton() {
  return (
    <SkeletonScope style={feed.page}>
      <View style={feed.stories}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Bone key={i} width={90} height={140} radius={14} />
        ))}
      </View>
      <FeedPostSkeleton />
      <FeedPostSkeleton />
    </SkeletonScope>
  );
}

// ---- styles copied from the real components (keep in sync) ----

/** ThisWeekEventsHorizontal + HorizontalEventCard. */
const rail = StyleSheet.create({
  container: { marginTop: 24, marginBottom: 8 },
  header: { paddingHorizontal: 16, marginBottom: 12, flexDirection: 'row' },
  sectionTitle: { fontSize: 22, fontFamily: 'MonaSansSemiCondensed-Medium' },
  list: { flexDirection: 'row', paddingHorizontal: 16, gap: 12, overflow: 'hidden' },
  caption: { paddingTop: 12, gap: 4 },
  title: { fontSize: 17, lineHeight: 22, fontFamily: 'MonaSans-Medium' },
  meta: { fontSize: 14, lineHeight: 19, fontFamily: 'MonaSans-Regular' },
});

/** app/explore.tsx `styles.hero` around HeroCarousel. */
const explore = StyleSheet.create({
  hero: {},
});

/** ProfileSheet, IdentityRow, ProfileActionGrid/Tile, ProfileMenu/ProfileMenuItem. */
const profile = StyleSheet.create({
  zone: { overflow: 'visible', zIndex: 1 },
  sheet: { paddingTop: 20, zIndex: 2, borderTopLeftRadius: 24, borderTopRightRadius: 24, minHeight: 900 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  texts: { flex: 1, gap: 2 },
  name: { fontSize: 17, fontFamily: 'MonaSans-SemiBold' },
  sub: { fontSize: 13, fontFamily: 'MonaSans-Regular' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, paddingHorizontal: 12, marginTop: 24 },
  cell: { width: '33.333%', alignItems: 'center', paddingHorizontal: 4, gap: 8 },
  tileLabel: { fontFamily: 'MonaSans-Medium', fontSize: 12, lineHeight: 15, textAlign: 'center' },
  menu: { paddingHorizontal: 16, marginTop: 24 },
  group: { gap: 8 },
  divider: { height: 1, marginVertical: 16 },
  menuRow: { flexDirection: 'row', alignItems: 'center', height: 48, paddingHorizontal: 16, gap: 12 },
  menuLabel: { fontSize: 16, fontFamily: 'MonaSans-Medium' },
});

/** FeedList (paddingTop topPadding + 8 — the overlay already starts at topPadding) + HomeStoryBar. */
const feed = StyleSheet.create({
  page: { paddingTop: 8 },
  stories: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12, overflow: 'hidden' },
});
