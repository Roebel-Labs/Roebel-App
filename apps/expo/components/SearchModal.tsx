import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SearchIcon } from './Icons';
import { supabase } from '@/lib/supabase';
import {
  EventRecord,
  NewsArticle,
  RestaurantRecord,
  BusinessRecord,
  BusinessDealWithBusiness,
  MarketplaceListingRecord,
  MovieRecord,
  UserRecord,
} from '@/lib/types';
import EventCard from './EventCard';
import NewsCard from './NewsCard';
import RestaurantCard from './RestaurantCard';
import BusinessCardCompact from './BusinessCardCompact';
import BusinessDealCard from './BusinessDealCard';
import MarketplaceCard from './MarketplaceCard';
import MovieCard from './MovieCard';
import UserSearchCard from './UserSearchCard';
import CategoryCard from './CategoryCard';
import { useRouter } from 'expo-router';
import { EVENT_CATEGORIES, EventCategory } from '@/lib/categories';
import { logSearch } from '@/lib/firebase';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  visible: boolean;
  onClose: () => void;
};

type SearchResults = {
  events: EventRecord[];
  news: NewsArticle[];
  restaurants: RestaurantRecord[];
  businesses: BusinessRecord[];
  users: UserRecord[];
  deals: BusinessDealWithBusiness[];
  marketplace: MarketplaceListingRecord[];
  movies: MovieRecord[];
};

const EMPTY_RESULTS: SearchResults = {
  events: [],
  news: [],
  restaurants: [],
  businesses: [],
  users: [],
  deals: [],
  marketplace: [],
  movies: [],
};

const RESULT_SECTIONS: { key: keyof SearchResults; label: string }[] = [
  { key: 'events', label: 'Veranstaltungen' },
  { key: 'news', label: 'Neuigkeiten' },
  { key: 'restaurants', label: 'Gastronomie' },
  { key: 'businesses', label: 'Unternehmen' },
  { key: 'users', label: 'Personen' },
  { key: 'deals', label: 'Angebote' },
  { key: 'marketplace', label: 'Marktplatz' },
  { key: 'movies', label: 'Kino' },
];

const QUICK_LINKS: { label: string; route: string }[] = [
  { label: 'Gastronomie', route: '/restaurant' },
  { label: 'Kino', route: '/movies' },
  { label: 'Unternehmen', route: '/businesses' },
  { label: 'Angebote', route: '/deals' },
  { label: 'Marktplatz', route: '/marketplace' },
];

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export default function SearchModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [isSearching, setIsSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const debouncedQuery = useDebounced(searchQuery, 300);

  useEffect(() => {
    if (visible) {
      loadRecentSearches();
    }
  }, [visible]);

  useEffect(() => {
    if (debouncedQuery.trim()) {
      performSearch(debouncedQuery);
    } else {
      setSearchResults(EMPTY_RESULTS);
      setIsSearching(false);
    }
  }, [debouncedQuery]);

  const loadRecentSearches = async () => {
    // In-memory recent searches
  };

  const performSearch = async (query: string) => {
    setIsSearching(true);
    try {
      const like = `%${query.trim()}%`;

      const [
        eventsRes,
        newsRes,
        restaurantsRes,
        businessesRes,
        usersRes,
        dealsRes,
        marketplaceRes,
        moviesRes,
      ] = await Promise.all([
        supabase
          .from('events')
          .select('*')
          .eq('status', 'approved')
          .or(`title.ilike.${like},description.ilike.${like},location.ilike.${like},organizer_name.ilike.${like}`)
          .order('date', { ascending: true })
          .limit(5),
        supabase
          .from('news_articles')
          .select('*')
          .eq('status', 'published')
          .or(`title.ilike.${like},excerpt.ilike.${like},author_name.ilike.${like}`)
          .order('published_at', { ascending: false })
          .limit(5),
        supabase
          .from('restaurants')
          .select('*')
          .eq('status', 'published')
          .or(`name.ilike.${like},description.ilike.${like},address.ilike.${like}`)
          .order('name', { ascending: true })
          .limit(5),
        supabase
          .from('businesses')
          .select('*')
          .eq('status', 'approved')
          .or(`name.ilike.${like},description.ilike.${like},address.ilike.${like}`)
          .order('name', { ascending: true })
          .limit(5),
        supabase
          .from('users')
          .select('*')
          .not('username', 'is', null)
          .or(`username.ilike.${like},bio.ilike.${like},neighborhood.ilike.${like}`)
          .limit(5),
        supabase
          .from('business_deals')
          .select('*, business:businesses(id, name, slug, logo_url, category)')
          .eq('status', 'active')
          .eq('is_active', true)
          .or(`title.ilike.${like},description.ilike.${like}`)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('marketplace_listings')
          .select('*')
          .eq('status', 'active')
          .or(`title.ilike.${like},description.ilike.${like},neighborhood.ilike.${like}`)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('movies')
          .select('*')
          .eq('status', 'published')
          .or(`title.ilike.${like},description.ilike.${like}`)
          .order('date', { ascending: true })
          .limit(5),
      ]);

      const results: SearchResults = {
        events: (eventsRes.data as EventRecord[]) || [],
        news: (newsRes.data as NewsArticle[]) || [],
        restaurants: (restaurantsRes.data as RestaurantRecord[]) || [],
        businesses: (businessesRes.data as BusinessRecord[]) || [],
        users: (usersRes.data as UserRecord[]) || [],
        deals: (dealsRes.data as BusinessDealWithBusiness[]) || [],
        marketplace: (marketplaceRes.data as MarketplaceListingRecord[]) || [],
        movies: (moviesRes.data as MovieRecord[]) || [],
      };

      setSearchResults(results);

      const totalCount = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);
      logSearch(query, totalCount);

      if (!recentSearches.includes(query)) {
        setRecentSearches((prev) => [query, ...prev.slice(0, 4)]);
      }
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults(EMPTY_RESULTS);
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(EMPTY_RESULTS);
    setIsSearching(false);
  };

  const handleRecentSearchPress = (query: string) => {
    setSearchQuery(query);
  };

  const handleClose = () => {
    clearSearch();
    onClose();
  };

  const handleCategoryPress = (category: EventCategory) => {
    handleClose();
    router.push(`/category/${category}` as any);
  };

  const handleQuickLink = (route: string) => {
    handleClose();
    router.push(route as any);
  };

  const totalResults = Object.values(searchResults).reduce((sum, arr) => sum + arr.length, 0);
  const showResults = searchQuery.trim() !== '';
  const showRecentSearches = !showResults && recentSearches.length > 0;

  const renderResultSection = (key: keyof SearchResults, label: string) => {
    const items = searchResults[key];
    if (items.length === 0) return null;

    return (
      <View key={key} style={styles.resultSection}>
        <Text style={[styles.resultSectionTitle, { color: colors.textSecondary }]}>
          {label} ({items.length})
        </Text>
        <View style={styles.resultSectionContent}>
          {key === 'events' &&
            (items as EventRecord[]).map((event) => (
              <Pressable key={event.id} onPress={handleClose}>
                <EventCard event={event} />
              </Pressable>
            ))}
          {key === 'news' &&
            (items as NewsArticle[]).map((article) => (
              <Pressable key={article.id} onPress={handleClose}>
                <NewsCard article={article} horizontal />
              </Pressable>
            ))}
          {key === 'restaurants' &&
            (items as RestaurantRecord[]).map((restaurant) => (
              <Pressable key={restaurant.id} onPress={handleClose}>
                <RestaurantCard restaurant={restaurant} compact />
              </Pressable>
            ))}
          {key === 'businesses' &&
            (items as BusinessRecord[]).map((business) => (
              <Pressable key={business.id} onPress={handleClose}>
                <BusinessCardCompact business={business} compact={false} />
              </Pressable>
            ))}
          {key === 'users' &&
            (items as UserRecord[]).map((user) => (
              <UserSearchCard key={user.id} user={user} onPress={handleClose} />
            ))}
          {key === 'deals' &&
            (items as BusinessDealWithBusiness[]).map((deal) => (
              <Pressable key={deal.id} onPress={handleClose}>
                <BusinessDealCard deal={deal} compact={false} />
              </Pressable>
            ))}
          {key === 'marketplace' &&
            (items as MarketplaceListingRecord[]).map((listing) => (
              <Pressable key={listing.id} onPress={handleClose}>
                <MarketplaceCard listing={listing} compact={false} />
              </Pressable>
            ))}
          {key === 'movies' &&
            (items as MovieRecord[]).map((movie) => (
              <Pressable key={movie.id} onPress={handleClose}>
                <MovieCard movie={movie} compact />
              </Pressable>
            ))}
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.surface }]}>
          <View style={[styles.searchContainer, { backgroundColor: colors.surface }]}>
            <SearchIcon size={20} color={colors.textTertiary} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="In Röbel suchen..."
              placeholderTextColor={colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={clearSearch} style={[styles.clearButton, { backgroundColor: colors.textTertiary }]}>
                <Text style={[styles.clearText, { color: colors.textInverted }]}>×</Text>
              </Pressable>
            )}
          </View>
          <Pressable onPress={handleClose} style={styles.cancelButton}>
            <Text style={[styles.cancelText, { color: colors.textPrimary }]}>Abbrechen</Text>
          </Pressable>
        </View>

        {/* Content */}
        <ScrollView style={styles.content} keyboardDismissMode="on-drag">
          {/* Recent Searches */}
          {showRecentSearches && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Letzte Suchen</Text>
              {recentSearches.map((query, index) => (
                <Pressable
                  key={index}
                  style={styles.recentItem}
                  onPress={() => handleRecentSearchPress(query)}
                >
                  <SearchIcon size={20} color={colors.textTertiary} />
                  <Text style={[styles.recentText, { color: colors.textPrimary }]}>{query}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Loading State */}
          {isSearching && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.tabIconActive} />
              <Text style={[styles.loadingText, { color: colors.textTertiary }]}>Suche läuft...</Text>
            </View>
          )}

          {/* Search Results — grouped by type */}
          {showResults && !isSearching && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                {totalResults} {totalResults === 1 ? 'Ergebnis' : 'Ergebnisse'} für "{searchQuery}"
              </Text>
              {totalResults === 0 ? (
                <View style={styles.noResults}>
                  <Text style={[styles.noResultsText, { color: colors.textPrimary }]}>
                    Keine Ergebnisse gefunden
                  </Text>
                  <Text style={[styles.noResultsSubtext, { color: colors.textTertiary }]}>
                    Versuche es mit anderen Suchbegriffen
                  </Text>
                </View>
              ) : (
                <View style={styles.resultsContainer}>
                  {RESULT_SECTIONS.map(({ key, label }) => renderResultSection(key, label))}
                </View>
              )}
            </View>
          )}

          {/* Suggestions — shown when no query */}
          {!showResults && !showRecentSearches && (
            <View style={styles.section}>
              {/* Quick Links to content sections */}
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Entdecken</Text>
              <View style={styles.quickLinksRow}>
                {QUICK_LINKS.map((link) => (
                  <Pressable
                    key={link.route}
                    style={[styles.quickLinkChip, { backgroundColor: colors.surfaceSecondary }]}
                    onPress={() => handleQuickLink(link.route)}
                  >
                    <Text style={[styles.quickLinkText, { color: colors.textPrimary }]}>{link.label}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Event Categories */}
              <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 24 }]}>
                Veranstaltungs-Kategorien
              </Text>
              <View style={styles.categoriesGrid}>
                {EVENT_CATEGORIES.map((category) => (
                  <CategoryCard
                    key={category}
                    category={category}
                    onPress={() => handleCategoryPress(category)}
                  />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 60,
    borderBottomWidth: 1,
    gap: 12,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter',
  },
  clearButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearText: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  cancelText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    marginBottom: 16,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 12,
  },
  recentText: {
    fontSize: 16,
    fontFamily: 'Inter',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter',
  },
  noResults: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  noResultsText: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
  },
  noResultsSubtext: {
    fontSize: 14,
    fontFamily: 'Inter',
  },
  resultsContainer: {
    gap: 8,
  },
  resultSection: {
    marginBottom: 16,
  },
  resultSectionTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  resultSectionContent: {
    gap: 8,
  },
  quickLinksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickLinkChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  quickLinkText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
});
