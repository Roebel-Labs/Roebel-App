import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  FlatList,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import { useRequireAuth } from '@/context/AuthGateContext';
import { useAccountSearch } from '@/hooks/useAccountSearch';
import {
  findOrCreateConversation,
  sendMessage,
  fetchPersonalAccountIdByWallet,
} from '@/lib/supabase-messages';
import type {
  AccountSearchResult,
  AccountSearchScope,
} from '@/lib/supabase-account-search';

import SearchSegmentedTabs from '@/components/messages/SearchSegmentedTabs';
import AccountSearchRow from '@/components/messages/AccountSearchRow';
import AccountRowSkeleton from '@/components/messages/AccountRowSkeleton';
import { SearchIcon } from '@/components/Icons';

import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

const SCOPE_OPTIONS: { key: AccountSearchScope; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'personal', label: 'Personen' },
  { key: 'organisation', label: 'Organisationen' },
];

export default function NewConversationScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();
  const requireAuth = useRequireAuth();

  const {
    address: prefillAddress,
    listingId,
    listingTitle,
    listingPrice,
    listingPriceType,
    listingImage,
    listingCondition,
  } = useLocalSearchParams<{
    address?: string;
    listingId?: string;
    listingTitle?: string;
    listingPrice?: string;
    listingPriceType?: string;
    listingImage?: string;
    listingCondition?: string;
  }>();

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<AccountSearchScope>('all');
  const [isOpening, setIsOpening] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const autoTriggered = useRef(false);

  const { results, isLoading, hasQuery } = useAccountSearch(
    query,
    scope,
    activeAccount?.id ?? null
  );

  const openConversation = async (peerAccountId: string) => {
    if (!activeAccount?.id) {
      requireAuth(() => {});
      return;
    }
    if (isOpening) return;
    setIsOpening(peerAccountId);
    setErrorMessage(null);
    Keyboard.dismiss();
    try {
      const convo = await findOrCreateConversation(activeAccount.id, peerAccountId);
      if (!convo) {
        setErrorMessage('Konversation konnte nicht gestartet werden. Bitte versuche es erneut.');
        return;
      }

      // Marketplace inquiry auto-send (deep-link path)
      if (listingId && listingTitle) {
        const inquiryPayload = JSON.stringify({
          type: 'listing_inquiry',
          listingId,
          title: listingTitle,
          price: Number(listingPrice) || 0,
          priceType: listingPriceType || 'fixed',
          imageUrl: listingImage || undefined,
          condition: listingCondition || undefined,
        });
        await sendMessage(convo.id, activeAccount.id, inquiryPayload);
      }

      router.replace(`/messages/${convo.id}` as any);
    } catch (err) {
      console.error('Failed to start conversation:', err);
      setErrorMessage('Konversation konnte nicht gestartet werden. Bitte versuche es erneut.');
    } finally {
      setIsOpening(null);
    }
  };

  // Marketplace deep-link prefill: resolve wallet → personal account, then
  // open the conversation immediately. Falls back to manual search if the
  // peer has no personal account yet.
  useEffect(() => {
    if (autoTriggered.current) return;
    if (!prefillAddress || !activeAccount?.id) return;
    autoTriggered.current = true;

    (async () => {
      const peerId = await fetchPersonalAccountIdByWallet(prefillAddress);
      if (!peerId) {
        setErrorMessage('Verkäufer konnte nicht gefunden werden.');
        return;
      }
      if (peerId === activeAccount?.id) {
        setErrorMessage('Das ist deine eigene Anzeige – du kannst dir nicht selbst schreiben.');
        return;
      }
      openConversation(peerId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillAddress, activeAccount?.id]);

  const renderItem = ({ item, index }: { item: AccountSearchResult; index: number }) => (
    <AccountSearchRow
      result={item}
      index={index}
      onPress={() => openConversation(item.id)}
    />
  );

  const showInitialHint = !hasQuery && results.length === 0;
  const showSkeletons = hasQuery && isLoading && results.length === 0;
  const showEmpty = hasQuery && !isLoading && results.length === 0;

  const skeletonRows = useMemo(() => Array.from({ length: 6 }), []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={8}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Neue Nachricht
        </Text>
        <View style={styles.iconButton} />
      </View>

      <View style={styles.searchSection}>
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: colors.surface,
              borderColor: colors.borderSecondary,
            },
          ]}
        >
          <SearchIcon size={18} color={colors.textTertiary} />
          <TextInput
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              if (errorMessage) setErrorMessage(null);
            }}
            placeholder="Personen oder Organisationen suchen"
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, { color: colors.textPrimary }]}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8} style={styles.clearButton}>
              <Text style={[styles.clearText, { color: colors.textSecondary }]}>✕</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.tabs}>
          <SearchSegmentedTabs
            value={scope}
            options={SCOPE_OPTIONS}
            onChange={setScope}
          />
        </View>
      </View>

      {errorMessage && (
        <View style={[styles.errorBanner, { backgroundColor: colors.errorBackground }]}>
          <Text style={[styles.errorText, { color: colors.error }]}>
            {errorMessage}
          </Text>
        </View>
      )}

      {showInitialHint && (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            Mit jemandem chatten
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Suche nach einem Namen, Nutzernamen oder einer Organisation.
          </Text>
        </View>
      )}

      {showSkeletons && (
        <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(120)}>
          {skeletonRows.map((_, i) => (
            <AccountRowSkeleton key={i} />
          ))}
        </Animated.View>
      )}

      {showEmpty && (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            Keine Ergebnisse
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Für „{query.trim()}“ haben wir nichts gefunden.
          </Text>
        </View>
      )}

      {results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    padding: 0,
  },
  clearButton: {
    paddingHorizontal: 4,
  },
  clearText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  tabs: {
    marginTop: 2,
  },
  listContent: {
    paddingBottom: 24,
  },
  emptyState: {
    paddingHorizontal: 32,
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  errorText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
});
