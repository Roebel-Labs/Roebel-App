import React, { memo } from 'react';
import { StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import FeedSpecialMenuSection from '@/components/feed/FeedSpecialMenuSection';
import { fetchActiveSpecialMenus } from '@/lib/supabase-restaurants';

export const SPECIAL_MENUS_QUERY_KEY = ['explore', 'special-menus'] as const;

const fetchMenus = () => fetchActiveSpecialMenus(10);

/** Mittagstisch on Erkunden: the feed's dish rail; renders nothing without dishes. */
function SpecialMenuExploreSection() {
  const { data } = useQuery({
    queryKey: SPECIAL_MENUS_QUERY_KEY,
    queryFn: fetchMenus,
    meta: { persist: true },
  });
  if (!data || data.length === 0) return null;
  return <FeedSpecialMenuSection menus={data} gutter={16} containerStyle={styles.container} />;
}

const styles = StyleSheet.create({
  // Same rhythm as the other Erkunden rails.
  container: {
    paddingVertical: 0,
    marginTop: 24,
    marginBottom: 8,
  },
});

export default memo(SpecialMenuExploreSection);
