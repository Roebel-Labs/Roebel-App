import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/context/ThemeContext';
import { fetchOrgAccountsBySubType } from '@/lib/supabase-accounts';
import { fetchAccountVoteSummaries } from '@/lib/supabase-ratings';
import OrgAccountCard from '@/components/OrgAccountCard';
import type { Account, AccountVoteSummary } from '@/lib/types';

type OrgAccountsSection = {
  accounts: Account[];
  summaries: Record<string, AccountVoteSummary>;
};

async function fetchOrgAccountsSection(): Promise<OrgAccountsSection> {
  const data = await fetchOrgAccountsBySubType('unternehmen');
  const summaries = await fetchAccountVoteSummaries(data.map((a) => a.id));
  const accounts = [...data].sort((a, b) => {
    const ua = summaries[a.id]?.up_count ?? 0;
    const ub = summaries[b.id]?.up_count ?? 0;
    if (ub !== ua) return ub - ua;
    return a.name.localeCompare(b.name);
  });
  return { accounts, summaries };
}

/**
 * Horizontal row of org accounts (sub_type 'unternehmen') shown under the
 * "In der Nähe" section, ordered by most thumbs-up first.
 */
export default function NearbyOrgAccountsSection() {
  const { colors } = useTheme();

  const { data } = useQuery({
    queryKey: ['explore', 'org-accounts'],
    queryFn: fetchOrgAccountsSection,
    meta: { persist: true },
  });
  const accounts = data?.accounts ?? [];
  const summaries = data?.summaries ?? {};

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
        renderItem={({ item }) => (
          <OrgAccountCard account={item} upCount={summaries[item.id]?.up_count ?? 0} />
        )}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

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
