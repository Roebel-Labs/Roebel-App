import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import ForumThreadList from '@/components/forum/ForumThreadList';
import { fetchForumCategories } from '@/lib/supabase-forum';

export default function ForumCategoryScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const { data: categories = [] } = useQuery({
    queryKey: ['forum', 'categories'],
    queryFn: fetchForumCategories,
    staleTime: 5 * 60_000,
  });
  const name = categories.find((c) => c.slug === category)?.name ?? 'Diskussionen';
  return <ForumThreadList categorySlug={category} title={name} />;
}
