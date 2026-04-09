# Home Feed — Stories Bar, Post Bar & App Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a post bar, a third "App" feed tab, a Facebook-style horizontal event story bar (Für dich only), and a full-screen story viewer to the Expo home feed.

**Architecture:** New components (`PostBar`, `EventStoryBar`, `EventStoryViewer`) are composed into the existing `FeedHome` `listHeader`. `FeedType` is extended with `'app'` — the existing `fetchFeedPosts` already filters by `feed_type`, so the App tab works with no new query logic. A new `fetchThisWeekEvents` function fetches events for the story bar independently of the main feed.

**Tech Stack:** React Native (StyleSheet + useTheme), expo-image, expo-linear-gradient, expo-router, react-native PanResponder (swipe-up), Supabase

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Modify | `apps/expo/lib/types/feed.ts:13` | Add `'app'` to `FeedType` |
| Modify | `apps/expo/components/feed/FeedTabBar.tsx:11-14` | Add App tab to TABS array |
| Modify | `apps/expo/components/feed/FeedEmptyState.tsx:21` | Add empty state for 'app' tab |
| Modify | `apps/expo/lib/supabase-posts.ts` | Add `fetchThisWeekEvents()` |
| Create | `apps/expo/components/feed/PostBar.tsx` | Tappable post entry row |
| Create | `apps/expo/components/feed/EventStoryViewer.tsx` | Full-screen story modal |
| Create | `apps/expo/components/feed/EventStoryBar.tsx` | Horizontal story scroll strip |
| Modify | `apps/expo/components/feed/FeedHome.tsx` | Wire PostBar + EventStoryBar into listHeader; pass feedType param to /create |
| Modify | `apps/expo/app/create/index.tsx` | Read `feedType` search param; call `draft.setFeedType()` |

---

## Task 1: Extend FeedType + FeedTabBar + FeedEmptyState

**Files:**
- Modify: `apps/expo/lib/types/feed.ts`
- Modify: `apps/expo/components/feed/FeedTabBar.tsx`
- Modify: `apps/expo/components/feed/FeedEmptyState.tsx`

- [ ] **Step 1: Add 'app' to FeedType in feed.ts**

In `apps/expo/lib/types/feed.ts`, change line 13:
```typescript
// Before:
export type FeedType = 'main' | 'rathaus';

// After:
export type FeedType = 'main' | 'rathaus' | 'app';
```

- [ ] **Step 2: Add App tab to FeedTabBar**

In `apps/expo/components/feed/FeedTabBar.tsx`, change the TABS array (lines 11–14):
```typescript
const TABS: { key: FeedType; label: string }[] = [
  { key: 'main', label: 'Für Dich' },
  { key: 'rathaus', label: 'Stadt' },
  { key: 'app', label: 'App' },
];
```

- [ ] **Step 3: Add empty state for 'app' tab**

In `apps/expo/components/feed/FeedEmptyState.tsx`, add a new block after the rathaus block (before the main feed fallback at line 62). The full `FeedEmptyState` component body becomes:

```tsx
export default function FeedEmptyState({ feedType, isCitizen, onCompose }: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  if (feedType === 'rathaus' && !isCitizen) {
    return (
      <View style={styles.container}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
          <CommunityIcon width={32} height={32} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Nur für verifizierte Bürger
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Verifiziere dich als Bürger von Röbel, um in der Stadt mitzureden.
        </Text>
        <Pressable
          onPress={() => router.push('/verification/request-citizen' as any)}
          style={[styles.button, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Verifizierung starten</Text>
        </Pressable>
      </View>
    );
  }

  if (feedType === 'rathaus') {
    return (
      <View style={styles.container}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
          <CommunityIcon width={32} height={32} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Noch keine Diskussionen</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Starte die erste Diskussion in der Stadt!
        </Text>
        <Pressable onPress={onCompose} style={[styles.button, { backgroundColor: colors.primary }]}>
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Beitrag erstellen</Text>
        </Pressable>
      </View>
    );
  }

  if (feedType === 'app') {
    return (
      <View style={styles.container}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
          <CommentIcon width={32} height={32} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Noch keine App-Diskussionen</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Teile Ideen oder Feedback zur App!
        </Text>
        <Pressable onPress={onCompose} style={[styles.button, { backgroundColor: colors.primary }]}>
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Beitrag erstellen</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
        <CommentIcon width={32} height={32} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Noch keine Beiträge</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Sei der Erste, der etwas teilt!
      </Text>
      <Pressable onPress={onCompose} style={[styles.button, { backgroundColor: colors.primary }]}>
        <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Beitrag erstellen</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Start the Expo dev server and verify three tabs render without errors**

```bash
cd apps/expo && pnpm start
```

Open iOS simulator — confirm "Für Dich", "Stadt", "App" tabs all appear and switching between them loads posts (or empty state).

- [ ] **Step 5: Commit**

```bash
git add apps/expo/lib/types/feed.ts apps/expo/components/feed/FeedTabBar.tsx apps/expo/components/feed/FeedEmptyState.tsx
git commit -m "feat(expo): add 'app' FeedType, App tab to FeedTabBar, empty state"
```

---

## Task 2: Add fetchThisWeekEvents to supabase-posts.ts

**Files:**
- Modify: `apps/expo/lib/supabase-posts.ts`

- [ ] **Step 1: Add fetchThisWeekEvents at the bottom of supabase-posts.ts**

Append this function after the existing `fetchUpcomingEventsForFeed` block:

```typescript
// ─── This Week's Events for Story Bar ───────────────────────

/**
 * Fetch approved events from today through end of this week (Sunday),
 * with account data joined for the story bar avatar.
 */
export async function fetchThisWeekEvents(): Promise<any[]> {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // End of this ISO week: next Sunday (day 0) or this Sunday
  const endOfWeek = new Date(today);
  const daysUntilSunday = (7 - today.getDay()) % 7 || 7;
  endOfWeek.setDate(today.getDate() + daysUntilSunday);
  const endOfWeekStr = endOfWeek.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('events')
    .select('*, account:accounts(id, name, avatar_url)')
    .eq('status', 'approved')
    .gte('date', todayStr)
    .lte('date', endOfWeekStr)
    .order('date', { ascending: true })
    .limit(10);

  if (error) {
    console.error('Error fetching this week events:', error);
    return [];
  }

  return data ?? [];
}
```

- [ ] **Step 2: Verify TypeScript compiles (no errors)**

```bash
cd apps/expo && npx tsc --noEmit
```

Expected: no errors on the new function.

- [ ] **Step 3: Commit**

```bash
git add apps/expo/lib/supabase-posts.ts
git commit -m "feat(expo): add fetchThisWeekEvents for story bar"
```

---

## Task 3: Create PostBar component

**Files:**
- Create: `apps/expo/components/feed/PostBar.tsx`

- [ ] **Step 1: Create PostBar.tsx**

```tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  avatarUrl: string | null;
  onPress: () => void;
};

export default function PostBar({ avatarUrl, onPress }: Props) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.container,
        { backgroundColor: colors.background, borderBottomColor: colors.border },
      ]}
    >
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: colors.surfaceSecondary }]}>
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <Ionicons name="person" size={18} color={colors.textTertiary} />
        )}
      </View>

      {/* Placeholder text */}
      <Text style={[styles.placeholder, { color: colors.textTertiary }]}>
        Teile etwas mit Röbel
      </Text>

      {/* Image icon */}
      <Ionicons name="image-outline" size={22} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  placeholder: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
});
```

- [ ] **Step 2: Verify the file has no TypeScript errors**

```bash
cd apps/expo && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/expo/components/feed/PostBar.tsx
git commit -m "feat(expo): add PostBar component"
```

---

## Task 4: Create EventStoryViewer component

**Files:**
- Create: `apps/expo/components/feed/EventStoryViewer.tsx`

- [ ] **Step 1: Create EventStoryViewer.tsx**

```tsx
import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  PanResponder,
  useWindowDimensions,
  StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { EventRecord } from '@/lib/types';

type Props = {
  events: EventRecord[];
  initialIndex: number;
  onClose: () => void;
  onNavigateToEvent: (id: string) => void;
};

function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export default function EventStoryViewer({
  events,
  initialIndex,
  onClose,
  onNavigateToEvent,
}: Props) {
  const { width, height } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const event = events[currentIndex];

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8,
      onPanResponderRelease: (_, g) => {
        // Swipe up at least 60px → go to event detail
        if (g.dy < -60) {
          onNavigateToEvent(events[currentIndex].id);
        }
      },
    })
  ).current;

  const handleTap = useCallback(
    (side: 'left' | 'right') => {
      if (side === 'left') {
        setCurrentIndex((i) => Math.max(0, i - 1));
      } else {
        if (currentIndex < events.length - 1) {
          setCurrentIndex((i) => i + 1);
        } else {
          onClose();
        }
      }
    },
    [currentIndex, events.length, onClose]
  );

  if (!event) return null;

  const orgName = event.account?.name ?? event.organizer_name;
  const orgAvatar = (event.account as any)?.avatar_url ?? null;

  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar hidden />
      <View style={[styles.container, { width, height }]} {...panResponder.panHandlers}>

        {/* Background image */}
        {event.image_url ? (
          <Image
            source={{ uri: event.image_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.imageFallback]} />
        )}

        {/* Left / right tap zones — must be above image but below header */}
        <View style={styles.tapRow} pointerEvents="box-none">
          <Pressable style={styles.tapZone} onPress={() => handleTap('left')} />
          <Pressable style={styles.tapZone} onPress={() => handleTap('right')} />
        </View>

        {/* Progress bars */}
        <View style={styles.progressRow}>
          {events.map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressBar,
                {
                  backgroundColor:
                    i < currentIndex
                      ? '#ffffff'
                      : i === currentIndex
                      ? '#ffffff'
                      : 'rgba(255,255,255,0.35)',
                  opacity: i > currentIndex ? 0.5 : 1,
                },
              ]}
            />
          ))}
        </View>

        {/* Header: org avatar + name + close */}
        <View style={styles.header}>
          <View style={styles.orgAvatarWrap}>
            {orgAvatar ? (
              <Image
                source={{ uri: orgAvatar }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            ) : (
              <Text style={styles.orgAvatarLetter}>
                {orgName.charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <View style={styles.orgInfo}>
            <Text style={styles.orgName} numberOfLines={1}>
              {orgName}
            </Text>
            <Text style={styles.eventDate}>{formatEventDate(event.date)}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={16} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#ffffff" />
          </Pressable>
        </View>

        {/* Bottom gradient */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.93)']}
          locations={[0, 0.45, 1]}
          style={styles.bottomGradient}
          pointerEvents="none"
        />

        {/* Bottom content */}
        <View style={styles.bottomContent} pointerEvents="box-none">
          <Text style={styles.eventTitle} numberOfLines={2}>
            {event.title}
          </Text>
          {event.location ? (
            <Text style={styles.eventMeta} numberOfLines={1}>
              📍 {event.location}
            </Text>
          ) : null}
          <Pressable
            style={styles.ctaBtn}
            onPress={() => onNavigateToEvent(event.id)}
            pointerEvents="auto"
          >
            <Ionicons name="chevron-up" size={18} color="#ffffff" />
            <Text style={styles.ctaText}>Mehr erfahren</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  imageFallback: {
    backgroundColor: '#1a2a4a',
  },
  tapRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    top: 120, // below header
    bottom: 200, // above CTA area
  },
  tapZone: {
    flex: 1,
  },
  progressRow: {
    position: 'absolute',
    top: 52,
    left: 12,
    right: 12,
    flexDirection: 'row',
    gap: 4,
  },
  progressBar: {
    flex: 1,
    height: 2,
    borderRadius: 1,
  },
  header: {
    position: 'absolute',
    top: 64,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orgAvatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: '#ffffff',
    backgroundColor: '#194383',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  orgAvatarLetter: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  orgInfo: {
    flex: 1,
  },
  orgName: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  eventDate: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 260,
  },
  bottomContent: {
    position: 'absolute',
    bottom: 48,
    left: 20,
    right: 20,
  },
  eventTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    lineHeight: 28,
    marginBottom: 6,
  },
  eventMeta: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginBottom: 20,
  },
  ctaBtn: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: 2,
  },
  ctaText: {
    color: '#ffffff',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/expo && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/expo/components/feed/EventStoryViewer.tsx
git commit -m "feat(expo): add EventStoryViewer full-screen story modal"
```

---

## Task 5: Create EventStoryBar component

**Files:**
- Create: `apps/expo/components/feed/EventStoryBar.tsx`

- [ ] **Step 1: Create EventStoryBar.tsx**

```tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fetchThisWeekEvents } from '@/lib/supabase-posts';
import type { EventRecord } from '@/lib/types';
import EventStoryViewer from './EventStoryViewer';

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function EventStoryBar() {
  const { colors } = useTheme();
  const router = useRouter();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  useEffect(() => {
    fetchThisWeekEvents().then((data) => setEvents(data as EventRecord[]));
  }, []);

  return (
    <View style={[styles.wrapper, { borderBottomColor: colors.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Create event card — always first */}
        <Pressable
          onPress={() => router.push('/submit-event' as any)}
          style={[
            styles.card,
            styles.createCard,
            { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
          ]}
        >
          <View style={[styles.plusCircle, { backgroundColor: colors.primary }]}>
            <Text style={[styles.plusText, { color: colors.background }]}>+</Text>
          </View>
          <Text style={[styles.createLabel, { color: colors.textSecondary }]}>
            {'Veranstaltung\nerstellen'}
          </Text>
        </Pressable>

        {/* Event story cards */}
        {events.map((event, index) => {
          const orgName = (event.account as any)?.name ?? event.organizer_name;
          const orgAvatar = (event.account as any)?.avatar_url ?? null;

          return (
            <Pressable
              key={event.id}
              onPress={() => setViewerIndex(index)}
              style={styles.card}
            >
              {/* Background image */}
              {event.image_url ? (
                <Image
                  source={{ uri: event.image_url }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.cardImageFallback]} />
              )}

              {/* Org avatar — top left */}
              <View style={styles.storyOrgRow}>
                <View style={styles.storyOrgAvatar}>
                  {orgAvatar ? (
                    <Image
                      source={{ uri: orgAvatar }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                    />
                  ) : (
                    <Text style={styles.storyOrgLetter}>
                      {orgName.charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
              </View>

              {/* Bottom gradient + title */}
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.82)']}
                style={styles.cardGradient}
              >
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {event.title}
                </Text>
                <Text style={styles.cardDate}>{formatShortDate(event.date)}</Text>
              </LinearGradient>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Full-screen story viewer */}
      {viewerIndex !== null && (
        <EventStoryViewer
          events={events}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onNavigateToEvent={(id) => {
            setViewerIndex(null);
            router.push(`/event/${id}` as any);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scroll: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  card: {
    width: 90,
    height: 140,
    borderRadius: 14,
    overflow: 'hidden',
    flexShrink: 0,
  },
  createCard: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 10,
  },
  plusCircle: {
    position: 'absolute',
    top: 28,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusText: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    lineHeight: 28,
  },
  createLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 15,
  },
  cardImageFallback: {
    backgroundColor: '#1a2a4a',
  },
  storyOrgRow: {
    position: 'absolute',
    top: 6,
    left: 6,
  },
  storyOrgAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#ffffff',
    backgroundColor: '#194383',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyOrgLetter: {
    color: '#ffffff',
    fontSize: 9,
    fontFamily: 'Inter-SemiBold',
  },
  cardGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 6,
    paddingTop: 16,
    justifyContent: 'flex-end',
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 13,
  },
  cardDate: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 9,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/expo && npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/expo/components/feed/EventStoryBar.tsx
git commit -m "feat(expo): add EventStoryBar horizontal story scroll"
```

---

## Task 6: Wire PostBar + EventStoryBar into FeedHome

**Files:**
- Modify: `apps/expo/components/feed/FeedHome.tsx`

- [ ] **Step 1: Add imports for PostBar and EventStoryBar at the top of FeedHome.tsx**

Add after the existing imports (around line 48, before the `MailIcon` import):
```tsx
import PostBar from './PostBar';
import EventStoryBar from './EventStoryBar';
```

- [ ] **Step 2: Update handleCompose to pass feedType param**

Replace the existing `handleCompose` function (lines 130–133):
```tsx
const handleCompose = () => {
  if (!walletAddress) return;
  router.push({ pathname: '/create', params: { feedType: activeTab } } as any);
};
```

- [ ] **Step 3: Update listHeader to include PostBar and EventStoryBar**

Replace the `const listHeader = (...)` block (lines 265–296) with:
```tsx
const listHeader = (
  <View style={[styles.headerWrapper, { backgroundColor: colors.background, marginHorizontal: -8, marginBottom: 8 }]}>
    {/* App header row */}
    <View style={styles.header}>
      <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Röbel</Text>
      <View style={styles.headerActions}>
        <Pressable
          style={[styles.headerIconBtn, { backgroundColor: colors.surfaceSecondary }]}
          accessibilityLabel="Nachrichten"
          onPress={() => router.push('/messages' as any)}
        >
          <MailIcon width={20} height={20} color={colors.textPrimary} />
        </Pressable>
        <Pressable
          style={[styles.headerIconBtn, { backgroundColor: colors.surfaceSecondary }]}
          accessibilityLabel="Benachrichtigungen"
          onPress={() => router.push('/notifications' as any)}
        >
          <NotificationIcon width={20} height={20} color={colors.textPrimary} />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>

    {/* Post bar — tap to compose */}
    <PostBar
      avatarUrl={user?.profile_picture_url ?? null}
      onPress={handleCompose}
    />

    {/* Tab bar */}
    <FeedTabBar activeTab={activeTab} onTabChange={setActiveTab} />

    {/* Context bar */}
    <ContextBar />

    {/* Event story bar — Für dich tab only */}
    {activeTab === 'main' && <EventStoryBar />}
  </View>
);
```

- [ ] **Step 4: Run the app and verify**

```bash
cd apps/expo && pnpm start
```

Confirm in iOS simulator:
- Post bar appears below the "Röbel" header, above the tabs
- Tapping it opens `/create`
- Event story bar appears below the context bar on "Für dich" tab only
- Switching to "Stadt" or "App" hides the story bar

- [ ] **Step 5: Commit**

```bash
git add apps/expo/components/feed/FeedHome.tsx
git commit -m "feat(expo): wire PostBar and EventStoryBar into FeedHome header"
```

---

## Task 7: Handle feedType param in /create screen

**Files:**
- Modify: `apps/expo/app/create/index.tsx`

- [ ] **Step 1: Add feedType to the useLocalSearchParams destructure**

In `app/create/index.tsx`, the existing `useLocalSearchParams` call (around line 54) already has a long list of typed params. Add `feedType` to it:

```tsx
const params = useLocalSearchParams<{
  feedType?: string;
  linkedEventId?: string;
  linkedEventTitle?: string;
  linkedEventDate?: string;
  linkedEventTime?: string;
  linkedEventLocation?: string;
  linkedEventImageUrl?: string;
  linkedEventCategory?: string;
  linkedListingId?: string;
  linkedListingTitle?: string;
  linkedListingPrice?: string;
  linkedListingPriceType?: string;
  linkedListingCategory?: string;
  linkedListingCondition?: string;
  linkedListingMediaUrls?: string;
  linkedListingNeighborhood?: string;
}>();
```

- [ ] **Step 2: Add useEffect to set feedType from params**

Add this `useEffect` after the existing `useEffect` blocks (after the keyboard effects, around line 118). Import `FeedType` from `@/lib/types/feed` at the top of the file (it already imports `PostCategory` — add `FeedType` to the same import):

```tsx
// At top, modify existing import line:
import type { PostCategory, FeedType } from '@/lib/types/feed';

// After the keyboard useEffects:
useEffect(() => {
  if (!params.feedType) return;
  const allowed: FeedType[] = ['main', 'rathaus', 'app'];
  if (allowed.includes(params.feedType as FeedType)) {
    draft.setFeedType(params.feedType as FeedType);
  }
}, [params.feedType]);
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd apps/expo && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual test — post to App feed**

1. Switch to the "App" tab in the feed
2. Tap the post bar → `/create` opens
3. Write a test post and publish it
4. Return to feed → switch to "App" tab → confirm the post appears there only (not in "Für dich" or "Stadt")

- [ ] **Step 5: Commit and push**

```bash
git add apps/expo/app/create/index.tsx
git commit -m "feat(expo): pass feedType param to /create so posts land in correct tab"
git push
```

---

## Verification Checklist

- [ ] Three tabs visible: "Für Dich", "Stadt", "App"
- [ ] Post bar visible on all tabs; tapping opens `/create`
- [ ] Post created from "App" tab has `feed_type = 'app'` in DB and appears only in App tab
- [ ] Event story bar visible only on "Für Dich" tab
- [ ] "Veranstaltung erstellen" card navigates to `/submit-event`
- [ ] Event story cards show this week's approved events
- [ ] Tapping an event card opens `EventStoryViewer` full-screen
- [ ] Progress bars show all events; left/right tap navigates between them
- [ ] Swipe up → closes viewer and navigates to `/event/[id]`
- [ ] "Mehr erfahren" button → same navigation to `/event/[id]`
- [ ] Close button (✕) dismisses viewer without navigation
- [ ] No regression on "Stadt" or "Für Dich" existing behaviour
