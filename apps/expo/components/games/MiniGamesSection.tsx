import React from 'react';
import { View, Text, StyleSheet, Pressable, Image, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';

const GAMES = [
  { id: 'mecky-jump', title: 'Mecky Jump', route: '/games/mecky-jump', image: require('@/assets/games/mecky/mecky_main.png') },
  { id: 'mecky-portal', title: 'Mecky Portal', route: '/games/mecky-portal', image: require('@/assets/games/mecky/mecky_main.png') },
  { id: 'speedrun', title: 'Mecky Speedrun', route: '/games/speedrun', image: require('@/assets/games/mecky/mecky_main.png') },
];

export default function MiniGamesSection() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Mini-Spiele</Text>
      </View>
      <FlatList
        horizontal
        data={GAMES}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.gameItem, pressed && styles.pressed]}
            onPress={() => router.push(item.route as any)}
          >
            <Image
              source={item.image}
              style={[styles.gameImage, { backgroundColor: colors.cardPlaceholder }]}
              resizeMode="cover"
            />
            <Text style={[styles.gameTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.title}
            </Text>
          </Pressable>
        )}
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
  sectionTitle: {
    fontSize: 22,
    fontFamily: 'MonaSansSemiCondensed-Medium',
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  gameItem: {
    alignItems: 'center',
    width: 120,
  },
  pressed: {
    opacity: 0.7,
  },
  gameImage: {
    width: 120,
    height: 120,
    borderRadius: 16,
  },
  gameTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    marginTop: 8,
    textAlign: 'center',
  },
});
