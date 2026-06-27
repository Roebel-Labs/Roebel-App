import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fetchOrgAccountsBySubType } from '@/lib/supabase-accounts';
import { fetchAccountVoteSummaries } from '@/lib/supabase-ratings';
import OrgAccountCard from '@/components/OrgAccountCard';
import type { Account, AccountVoteSummary } from '@/lib/types';

/**
 * Horizontal row of org accounts (sub_type 'unternehmen') shown under the
 * "In der Nähe" section, ordered by most thumbs-up first.
 */
export default function NearbyOrgAccountsSection() {
  const { colors } = useTheme();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [summaries, setSummaries] = useState<Record<string, AccountVoteSummary>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchOrgAccountsBySubType('unternehmen');
      if (cancelled) return;
      const sums = await fetchAccountVoteSummaries(data.map((a) => a.id));
      if (cancelled) return;
      const sorted = [...data].sort((a, b) => {
        const ua = sums[a.id]?.up_count ?? 0;
        const ub = sums[b.id]?.up_count ?? 0;
        if (ub !== ua) return ub - ua;
        return a.name.localeCompare(b.name);
      });
      setSummaries(sums);
      setAccounts(sorted);
    })();
    return () => { cancelled = true; };
  }, []);

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
