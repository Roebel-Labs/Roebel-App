import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SearchIcon } from './Icons';
import AnimatedSearchPlaceholder from './AnimatedSearchPlaceholder';
import { supabase } from '@/lib/supabase';
import {
  EventRecord,
  NewsArticle,
  RestaurantRecord,
  BusinessRecord,
  BusinessDealWithBusiness,
  MarketplaceListingRecord,
  MovieRecord,
} from '@/lib/types';
import EventCard from './EventCard';
import NewsCard from './NewsCard';
import RestaurantCard from './RestaurantCard';
import BusinessCardCompact from './BusinessCardCompact';
import BusinessDealCard from './BusinessDealCard';
import MarketplaceCard from './MarketplaceCard';
import MovieCard from './MovieCard';
import AccountSearchRow from './messages/AccountSearchRow';
import { searchAccounts, type AccountSearchResult } from '@/lib/supabase-account-search';
import AppSectionTile from './AppSectionTile';
import { useRouter } from 'expo-router';
import { logSearch } from '@/lib/firebase';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  visible: boolean;
  onClose: () => void;
  /**
   * Called instead of onClose when the user leaves the modal by tapping a result
   * or section tile (vs. cancelling). Lets the host (Explore) remember to reopen
   * the search page when the user navigates back. Preserves the typed query.
   */
  onNavigate?: () => void;
};

type SearchResults = {
  events: EventRecord[];
  news: NewsArticle[];
  people: AccountSearchResult[];
  orgs: AccountSearchResult[];
  restaurants: RestaurantRecord[];
  businesses: BusinessRecord[];
  deals: BusinessDealWithBusiness[];
  marketplace: MarketplaceListingRecord[];
  movies: MovieRecord[];
};

const EMPTY_RESULTS: SearchResults = {
  events: [],
  news: [],
  people: [],
  orgs: [],
  restaurants: [],
  businesses: [],
  deals: [],
  marketplace: [],
  movies: [],
};

const RESULT_SECTIONS: { key: keyof SearchResults; label: string }[] = [
  { key: 'people', label: 'Personen' },
  { key: 'orgs', label: 'Organisationen' },
  { key: 'events', label: 'Veranstaltungen' },
  { key: 'news', label: 'Neuigkeiten' },
  { key: 'restaurants', label: 'Gastronomie' },
  { key: 'businesses', label: 'Unternehmen' },
  { key: 'deals', label: 'Angebote' },
  { key: 'marketplace', label: 'Marktplatz' },
  { key: 'movies', label: 'Kino' },
];

const APP_SECTIONS: { title: string; items: { label: string; route: string; image: any }[] }[] = [
  {
    title: 'Freizeit',
    items: [
      { label: 'Veranstaltungen', route: '/events', image: require('@/assets/illustration/collections/events.png') },
      { label: 'Kino', route: '/movies', image: require('@/assets/illustration/collections/kino.png') },
      { label: 'Gastronomie', route: '/restaurant', image: require('@/assets/illustration/collections/gastronomie.png') },
      { label: 'Neuigkeiten', route: '/news', image: require('@/assets/illustration/collections/neuigkeiten.png') },
      { label: 'Sternfahrten', route: '/tours', image: require('@/assets/illustration/collections/sternfahrt.png') },
      { label: 'Wildtiere', route: '/wildlife', image: require('@/assets/illustration/collections/wildtriere.png') },
    ],
  },
  {
    title: 'Mobilität',
    items: [
      { label: 'Bürger Bus', route: '/transit', image: require('@/assets/illustration/collections/buergerbus.png') },
      { label: 'Linie 12', route: '/transit/line/12', image: require('@/assets/illustration/collections/linie12.png') },
    ],
  },
  {
    title: 'Stadt',
    items: [
      { label: 'Bürgerumfragen', route: '/proposal', image: require('@/assets/illustration/collections/buergerumfragen.png') },
      { label: 'Unternehmen', route: '/businesses', image: require('@/assets/illustration/collections/unternehmen.png') },
    ],
  },
  {
    title: 'Shopping',
    items: [
      { label: 'Marktplatz', route: '/marketplace', image: require('@/assets/illustration/collections/marktplatz.png') },
      { label: 'Angebote', route: '/deals', image: require('@/assets/illustration/collections/angebote.png') },
    ],
  },
];

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export default function SearchModal({ visible, onClose, onNavigate }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const debouncedQuery = useDebounced(searchQuery, 300);

  useEffect(() => {
    if (debouncedQuery.trim()) {
      performSearch(debouncedQuery);
    } else {
      setSearchResults(EMPTY_RESULTS);
      setIsSearching(false);
    }
  }, [debouncedQuery]);

  const performSearch = async (query: string) => {
    setIsSearching(true);
    try {
      const like = `%${query.trim()}%`;

      const [
        eventsRes,
        newsRes,
        restaurantsRes,
        businessesRes,
        accountsRes,
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
        searchAccounts(query, 'all', null),
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

      const accounts = accountsRes as AccountSearchResult[];
      const people = accounts.filter((a) => a.accountType === 'personal').slice(0, 5);
      const orgs = accounts.filter((a) => a.accountType === 'organisation').slice(0, 5);

      const results: SearchResults = {
        events: (eventsRes.data as EventRecord[]) || [],
        news: (newsRes.data as NewsArticle[]) || [],
        people,
        orgs,
        restaurants: (restaurantsRes.data as RestaurantRecord[]) || [],
        businesses: (businessesRes.data as BusinessRecord[]) || [],
        deals: (dealsRes.data as BusinessDealWithBusiness[]) || [],
        marketplace: (marketplaceRes.data as MarketplaceListingRecord[]) || [],
        movies: (moviesRes.data as MovieRecord[]) || [],
      };

      setSearchResults(results);

      const totalCount = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);
      logSearch(query, totalCount);
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

  const handleClose = () => {
    clearSearch();
    onClose();
  };

  // Dismiss the modal because the user is navigating to a result/subpage.
  // Keeps the query intact so the search page can be restored on back.
  const dismissForNavigation = onNavigate ?? handleClose;

  const handleSectionPress = (route: string) => {
    dismissForNavigation();
    router.push(route as any);
  };

  const totalResults = Object.values(searchResults).reduce((sum, arr) => sum + arr.length, 0);
  const showResults = searchQuery.trim() !== '';

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
              <Pressable key={event.id} onPress={dismissForNavigation}>
                <EventCard event={event} />
              </Pressable>
            ))}
          {key === 'news' &&
            (items as NewsArticle[]).map((article) => (
              <Pressable key={article.id} onPress={dismissForNavigation}>
                <NewsCard article={article} horizontal />
              </Pressable>
            ))}
          {key === 'restaurants' &&
            (items as RestaurantRecord[]).map((restaurant) => (
              <Pressable key={restaurant.id} onPress={dismissForNavigation}>
                <RestaurantCard restaurant={restaurant} compact />
              </Pressable>
            ))}
          {key === 'businesses' &&
            (items as BusinessRecord[]).map((business) => (
              <Pressable key={business.id} onPress={dismissForNavigation}>
                <BusinessCardCompact business={business} compact={false} />
              </Pressable>
            ))}
          {(key === 'people' || key === 'orgs') &&
            (items as AccountSearchResult[]).map((acc, i) => (
              <AccountSearchRow
                key={acc.id}
                result={acc}
                index={i}
                onPress={() => {
                  dismissForNavigation();
                  if (acc.accountType === 'organisation') {
                    router.push({ pathname: '/account/[id]' as any, params: { id: acc.id } });
                  } else if (acc.username) {
                    router.push({ pathname: '/user/[username]', params: { username: acc.username } });
                  }
                }}
              />
            ))}
          {key === 'deals' &&
            (items as BusinessDealWithBusiness[]).map((deal) => (
              <Pressable key={deal.id} onPress={dismissForNavigation}>
                <BusinessDealCard deal={deal} compact={false} />
              </Pressable>
            ))}
          {key === 'marketplace' &&
            (items as MarketplaceListingRecord[]).map((listing) => (
              <Pressable key={listing.id} onPress={dismissForNavigation}>
                <MarketplaceCard listing={listing} compact={false} />
              </Pressable>
            ))}
          {key === 'movies' &&
            (items as MovieRecord[]).map((movie) => (
              <Pressable key={movie.id} onPress={dismissForNavigation}>
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
      onShow={() => {
        if (Platform.OS === 'ios') {
          inputRef.current?.focus();
        } else {
          setTimeout(() => inputRef.current?.focus(), 50);
        }
      }}
    >
      <SafeAreaView
        edges={['top']}
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.searchContainer, { backgroundColor: colors.surfaceSecondary }]}>
            <SearchIcon size={20} color={colors.textTertiary} />
            <View style={styles.inputWrapper}>
              <TextInput
                ref={inputRef}
                style={[styles.searchInput, { color: colors.textPrimary }]}
                placeholder=""
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
              />
              {searchQuery.length === 0 && (
                <View style={styles.placeholderOverlay} pointerEvents="none">
                  <AnimatedSearchPlaceholder fontSize={14} />
                </View>
              )}
            </View>
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
          {!showResults && (
            <View style={styles.sectionsWrapper}>
              {APP_SECTIONS.map((section) => (
                <View key={section.title} style={styles.appSection}>
                  <Text style={[styles.appSectionTitle, { color: colors.textPrimary }]}>
                    {section.title}
                  </Text>
                  <View style={styles.appSectionGrid}>
                    {section.items.map((item) => (
                      <View key={item.route} style={styles.appSectionCell}>
                        <AppSectionTile
                          label={item.label}
                          image={item.image}
                          onPress={() => handleSectionPress(item.route)}
                        />
                      </View>
                    ))}
                    {section.items.length % 2 === 1 && (
                      <View style={styles.appSectionCell} />
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
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
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  inputWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
  searchInput: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    padding: 0,
  },
  placeholderOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
  },
  clearButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    lineHeight: 16,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  cancelText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    marginBottom: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  noResults: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  noResultsText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  noResultsSubtext: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  resultsContainer: {
    gap: 8,
  },
  resultSection: {
    marginBottom: 16,
  },
  resultSectionTitle: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  resultSectionContent: {
    gap: 8,
  },
  sectionsWrapper: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  appSection: {
    marginBottom: 24,
  },
  appSectionTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Medium',
    marginBottom: 12,
  },
  appSectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  appSectionCell: {
    width: '48%',
  },
});
