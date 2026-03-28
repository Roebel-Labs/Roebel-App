import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { RestaurantRecord } from '@/lib/types';
import RestaurantCard from './RestaurantCard';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

type Props = {
  restaurants: RestaurantRecord[];
};

export default function RestaurantSection({ restaurants }: Props) {
  const router = useRouter();
  const { colors } = useTheme();

  if (restaurants.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Gastronomie</Text>

        <Pressable
          style={[styles.showAllButton, { backgroundColor: colors.surfaceSecondary }]}
          onPress={() => router.push('/restaurant' as any)}
          accessibilityRole="button"
          accessibilityLabel="Alle Speisekarten anzeigen"
        >
          <Text style={[styles.showAllText, { color: colors.textPrimary }]}>Alle anzeigen</Text>
        </Pressable>
      </View>
      <FlatList
        horizontal
        data={restaurants}
        renderItem={({ item }) => <RestaurantCard restaurant={item} compact />}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Inter-Medium',
  },
  showAllButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  showAllText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  listContent: {
    paddingHorizontal: 16,
  },
});
