import React, { memo, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { fetchOrgAccountCards } from '@/lib/supabase-accounts';
import { fetchAccountRatingSummaries, fetchAccountVoteSummaries } from '@/lib/supabase-ratings';
import OrgAccountCard from '@/components/OrgAccountCard';
import type { AccountRatingSummary, AccountVoteSummary, OrgAccountCardRecord } from '@/lib/types';
import { RAIL_LIST_PROPS } from './railListProps';

type OrgAccountsSection = {
  accounts: OrgAccountCardRecord[];
  summaries: Record<string, AccountVoteSummary>;
  ratings: Record<string, AccountRatingSummary>;
};

/** Shared with the Erkunden screen so it can warm this query before the section mounts. */
export const ORG_ACCOUNTS_QUERY_KEY = ['explore', 'org-accounts'] as const;

export async function fetchOrgAccountsSection(): Promise<OrgAccountsSection> {
  const data = await fetchOrgAccountCards('unternehmen');
  const ids = data.map((a) => a.id);
  const [summaries, ratings] = await Promise.all([
    fetchAccountVoteSummaries(ids),
    fetchAccountRatingSummaries(ids),
  ]);
  const accounts = [...data].sort((a, b) => {
    const ua = summaries[a.id]?.up_count ?? 0;
    const ub = summaries[b.id]?.up_count ?? 0;
    if (ub !== ua) return ub - ua;
    return a.name.localeCompare(b.name);
  });
  return { accounts, summaries, ratings };
}

const accountKey = (account: OrgAccountCardRecord) => account.id;

/**
 * Horizontal row of org accounts (sub_type 'unternehmen') shown under the
 * "In der Nähe" section, ordered by most thumbs-up first.
 */
function NearbyOrgAccountsSection() {
  const { colors } = useTheme();

  const { data } = useQuery({
    queryKey: ORG_ACCOUNTS_QUERY_KEY,
    queryFn: fetchOrgAccountsSection,
    meta: { persist: true },
  });
  const accounts = data?.accounts ?? [];
  const summaries = data?.summaries;
  // Persisted cache entries from before ratings were added lack this key.
  const ratings = data?.ratings;

  const renderItem = useCallback(
    ({ item }: { item: OrgAccountCardRecord }) => (
      <OrgAccountCard
        account={item}
        upCount={summaries?.[item.id]?.up_count ?? 0}
        ratingSummary={ratings?.[item.id] ?? null}
      />
    ),
    [summaries, ratings]
  );

  if (accounts.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          Unternehmen in der Nähe
        </Text>
      </View>
      <FlatList
        horizontal
        data={accounts}
        renderItem={renderItem}
        keyExtractor={accountKey}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        {...RAIL_LIST_PROPS}
      />
    </View>
  );
}

export default memo(NearbyOrgAccountsSection);

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    marginBottom: 8,
  },
  header: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: 'MonaSansSemiCondensed-Medium',
  },
  listContent: {
    paddingHorizontal: 16,
  },
});
