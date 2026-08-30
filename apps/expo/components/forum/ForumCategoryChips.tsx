import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { useUser } from '@/context/UserContext';
import { fetchForumCategories } from '@/lib/supabase-forum';

type Props = {
  /** Highlighted category slug; 'alle' highlights the all-threads chip. */
  activeSlug?: string;
};

/**
 * Horizontal category rail for the Umfragen page and the forum list screens.
 * Chips navigate to the (filtered) thread list; the trailing CTA opens the
 * composer (citizens only — the button self-hides otherwise).
 */
export default function ForumCategoryChips({ activeSlug }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const { isCitizen } = useUser();

  const { data: categories = [] } = useQuery({
    queryKey: ['forum', 'categories'],
    queryFn: fetchForumCategories,
    staleTime: 5 * 60_000,
  });

  const chip = (slug: string, name: string) => {
    const active = activeSlug === slug;
    return (
      <Pressable
        key={slug}
        onPress={() =>
          router.push((slug === 'alle' ? '/forum' : `/forum/${slug}`) as any)
        }
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={[
          styles.chip,
          {
            backgroundColor: active ? colors.primary : colors.surface,
            borderColor: active ? colors.primary : colors.border,
          },
        ]}
      >
        <Text
          style={[
            styles.chipText,
            { color: active ? colors.primaryForeground : colors.textPrimary },
          ]}
        >
          {name}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.row}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {chip('alle', 'Alle')}
        {categories.map((c) => chip(c.slug, c.name))}
        {isCitizen && (
          <Pressable
            onPress={() => router.push('/forum/new' as any)}
            accessibilityRole="button"
            accessibilityLabel="Neues Forumsthema erstellen"
            style={[styles.chip, styles.newChip, { borderColor: colors.primary }]}
          >
            <Text style={[styles.chipText, { color: colors.primary }]}>+ Neues Thema</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 8,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  newChip: {
    borderStyle: 'dashed',
  },
  chipText: {
    fontSize: 13,
    fontFamily: fontFamily.medium,
  },
});
