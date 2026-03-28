import { supabase } from './supabase';
import type { NewsArticle } from './types';

/**
 * Fetch recent published news articles for feed integration
 */
export async function fetchRecentNews(limit: number = 5): Promise<NewsArticle[]> {
  const { data, error } = await supabase
    .from('news_articles')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching news:', error);
    return [];
  }

  return data as NewsArticle[];
}
