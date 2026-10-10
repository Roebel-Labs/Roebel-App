import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import type { FollowSuggestion } from '@/lib/supabase-follows';
import { filterSuggestions } from '@/lib/follow-selection';

type Props = {
  suggestions: FollowSuggestion[];
  unticked: Set<string>;
  onToggle: (id: string) => void;
  onAll: () => void;
  onNone: () => void;
  header?: React.ReactElement;
};

const SUB_TYPE_LABEL: Record<string, string> = {
  verein: 'Verein',
  restaurant: 'Gastronomie',
  unternehmen: 'Unternehmen',
  personal: 'Person',
};

function secondaryLine(s: FollowSuggestion): string {
  const kind = (s.sub_type && SUB_TYPE_LABEL[s.sub_type]) || (s.account_type === 'personal' ? 'Person' : 'Organisation');
  return `${kind} · ${s.followers} Follower`;
}

export default function FollowList({ suggestions, unticked, onToggle, onAll, onNone, header }: Props) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const data = useMemo(() => filterSuggestions(suggestions, query), [suggestions, query]);

  return (
    <FlatList
      data={data}
      keyExtractor={(s) => s.account_id}
      initialNumToRender={20}
      windowSize={7}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View>
          {header}
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Suchen"
            placeholderTextColor={colors.textTertiary}
            style={[styles.search, { color: colors.textPrimary, backgroundColor: colors.surface, borderColor: colors.border }]}
            autoCorrect={false}
            accessibilityLabel="Konten suchen"
          />
          <View style={styles.bulkRow}>
            <Pressable onPress={onAll} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.bulk, { color: colors.primary }]}>Allen folgen</Text>
            </Pressable>
            <Pressable onPress={onNone} hitSlop={8} accessibilityRole="button">
              <Text style={[styles.bulk, { color: colors.primary }]}>Keinem folgen</Text>
            </Pressable>
          </View>
        </View>
      }
      renderItem={({ item }) => {
        const ticked = !unticked.has(item.account_id);
        return (
          <Pressable
            onPress={() => onToggle(item.account_id)}
            style={styles.row}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: ticked }}
            accessibilityLabel={item.name}
          >
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.initials, { color: colors.textSecondary }]}>{item.name.trim().charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.text}>
              <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
              <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>{secondaryLine(item)}</Text>
            </View>
            <Ionicons
              name={ticked ? 'checkmark-circle' : 'ellipse-outline'}
              size={26}
              color={ticked ? colors.primary : colors.border}
            />
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  search: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    marginBottom: 12,
  },
  bulkRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  bulk: { fontSize: 14, fontFamily: 'Inter-Medium' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  initials: { fontSize: 16, fontFamily: 'Inter-SemiBold' },
  text: { flex: 1 },
  name: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  sub: { fontSize: 13, fontFamily: 'Inter-Regular', marginTop: 1 },
});
