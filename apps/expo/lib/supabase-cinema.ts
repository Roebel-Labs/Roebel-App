import { supabase } from './supabase';
import type { MovieRecord } from './types';

/**
 * Fetch upcoming movie screenings for feed integration
 */
export async function fetchUpcomingMovies(limit: number = 6): Promise<MovieRecord[]> {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('movies')
    .select('*')
    .eq('status', 'published')
    .gte('date', today)
    .order('date', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error fetching movies:', error);
    return [];
  }

  return data as MovieRecord[];
}
