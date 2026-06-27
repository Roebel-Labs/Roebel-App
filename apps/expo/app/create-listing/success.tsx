import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import CheckIcon from '@/assets/icons/check.svg';
import { useTheme } from '@/context/ThemeContext';
import { useCreateListingWizard } from '@/context/CreateListingWizardContext';

export default function CreateListingSuccessScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state } = useCreateListingWizard();

  const handleShareInFeed = () => {
    router.replace({
      pathname: '/create',
      params: {
        linkedListingId: state.newListingId,
        linkedListingTitle: state.title,
        linkedListingPrice: state.priceType === 'free' ? '0' : state.price,
        linkedListingPriceType: state.priceType,
        linkedListingCategory: state.category,
        linkedListingCondition: state.condition,
        linkedListingMediaUrls: JSON.stringify(state.mediaUrls),
        linkedListingNeighborhood: state.neighborhood,
      },
    });
  };

  const handleGoToMarketplace = () => {
    router.replace('/marketplace');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.container}>
        <View style={[styles.iconWrapper, { backgroundColor: colors.successBackground }]}>
          <CheckIcon width={32} height={32} color={colors.success} />
        </View>

        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Deine Anzeige ist live!
        </Text>

        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Deine Anzeige ist jetzt im Marktplatz sichtbar. Teile sie im Feed, damit noch mehr Nachbarn sie sehen.
        </Text>

        <Pressable
          onPress={handleShareInFeed}
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Im Feed teilen</Text>
        </Pressable>

        <Pressable
          onPress={handleGoToMarketplace}
          style={[styles.secondaryButton, { borderColor: colors.border }]}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>Zum Marktplatz</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
  },
  primaryButton: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 40,
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 14,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  secondaryButton: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
});
