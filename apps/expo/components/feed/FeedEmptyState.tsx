import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import type { FeedType } from '@/lib/types/feed';

import CommunityIcon from '@/assets/icons/community.svg';
import CommentIcon from '@/assets/icons/comment-02.svg';

type Props = {
  feedType: FeedType;
  isCitizen: boolean;
  onCompose: () => void;
};

export default function FeedEmptyState({ feedType, isCitizen, onCompose }: Props) {
  const { colors } = useTheme();
  const router = useRouter();

  // Rathaus tab, not verified
  if (feedType === 'rathaus' && !isCitizen) {
    return (
      <View style={styles.container}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
          <CommunityIcon width={32} height={32} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Nur für verifizierte Bürger
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Verifiziere dich als Bürger von Röbel, um im Rathaus mitzureden.
        </Text>
        <Pressable
          onPress={() => router.push('/verification/request-citizen' as any)}
          style={[styles.button, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Verifizierung starten</Text>
        </Pressable>
      </View>
    );
  }

  // Rathaus tab, verified but empty
  if (feedType === 'rathaus') {
    return (
      <View style={styles.container}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
          <CommunityIcon width={32} height={32} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Noch keine Diskussionen</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Starte die erste Diskussion im Rathaus!
        </Text>
        <Pressable onPress={onCompose} style={[styles.button, { backgroundColor: colors.primary }]}>
          <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Beitrag erstellen</Text>
        </Pressable>
      </View>
    );
  }

  // Main feed, empty
  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
        <CommentIcon width={32} height={32} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Noch keine Beiträge</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Sei der Erste, der etwas teilt!
      </Text>
      <Pressable onPress={onCompose} style={[styles.button, { backgroundColor: colors.primary }]}>
        <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Beitrag erstellen</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
});
