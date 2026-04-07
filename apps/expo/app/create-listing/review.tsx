import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { useCreateListingWizard } from '@/context/CreateListingWizardContext';
import { createMarketplaceListing, createOrgListing } from '@/lib/supabase-marketplace';
import WizardFooter from '@/components/WizardFooter';

const LISTING_TYPE_LABELS: Record<string, { emoji: string; label: string }> = {
  product: { emoji: '📦', label: 'Produkt' },
  service: { emoji: '🛠️', label: 'Dienstleistung' },
};

const CATEGORY_LABELS: Record<string, string> = {
  moebel: 'Möbel',
  elektronik: 'Elektronik',
  kleidung: 'Kleidung',
  fahrzeuge: 'Fahrzeuge',
  sport: 'Sport',
  garten: 'Garten',
  haushalt: 'Haushalt',
  spielzeug: 'Spielzeug',
  buecher: 'Bücher',
  dienstleistungen: 'Dienstleistungen',
  immobilien: 'Immobilien',
  sonstiges: 'Sonstiges',
};

const PRICE_TYPE_LABELS: Record<string, string> = {
  fixed: 'Festpreis',
  negotiable: 'VB',
  free: 'Zu verschenken',
};

const CONDITION_LABELS: Record<string, string> = {
  neu: 'Neu',
  wie_neu: 'Wie neu',
  gut: 'Gut',
  akzeptabel: 'Akzeptabel',
};

export default function CreateListingReviewScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, dispatch } = useCreateListingWizard();
  const account = useActiveAccount();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const typeInfo = state.listingType ? LISTING_TYPE_LABELS[state.listingType] : null;

  const handleSubmit = async () => {
    const walletAddress = account?.address;
    if (!walletAddress || !state.listingType || !state.title.trim()) return;

    setIsSubmitting(true);
    dispatch({ type: 'SET_SUBMITTING', payload: true });

    try {
      const listingData = {
        title: state.title.trim(),
        description: state.description.trim(),
        price: state.priceType === 'free' ? 0 : parseFloat(state.price) || 0,
        price_type: state.priceType,
        category: state.category || 'sonstiges',
        condition: state.listingType === 'service' ? null : state.condition,
        neighborhood: state.neighborhood.trim() || undefined,
        media_urls: state.mediaUrls.length > 0 ? state.mediaUrls : undefined,
        listing_type: state.listingType,
      };

      let listing;
      if (state.accountId) {
        listing = await createOrgListing(state.accountId, walletAddress, listingData as any);
      } else {
        listing = await createMarketplaceListing({
          seller_wallet_address: walletAddress,
          ...listingData,
        });
      }

      if (listing) {
        dispatch({ type: 'SET_NEW_LISTING_ID', payload: listing.id });
      }
      router.replace('/create-listing/success');
    } catch (error: any) {
      Alert.alert('Fehler', error?.message || 'Anzeige konnte nicht erstellt werden.');
    } finally {
      setIsSubmitting(false);
      dispatch({ type: 'SET_SUBMITTING', payload: false });
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>SCHRITT 6</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Alles richtig?</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Prüfe deine Angaben bevor du die Anzeige erstellst.
        </Text>

        {/* Typ */}
        <SectionCard title="Typ" onEdit={() => router.push('/create-listing/type')} colors={colors}>
          <View style={styles.typeRow}>
            <Text style={styles.typeEmoji}>{typeInfo?.emoji}</Text>
            <Text style={[styles.typeLabel, { color: colors.textPrimary }]}>{typeInfo?.label}</Text>
          </View>
          {state.category ? (
            <Text style={[styles.infoCategory, { color: colors.textTertiary }]}>
              {CATEGORY_LABELS[state.category] || state.category}
            </Text>
          ) : null}
        </SectionCard>

        {/* Details */}
        <SectionCard title="Details" onEdit={() => router.push('/create-listing/details')} colors={colors}>
          <Text style={[styles.infoName, { color: colors.textPrimary }]}>{state.title || '—'}</Text>
          {state.description ? (
            <Text style={[styles.infoDescription, { color: colors.textSecondary }]} numberOfLines={3}>
              {state.description}
            </Text>
          ) : null}
        </SectionCard>

        {/* Preis */}
        <SectionCard title="Preis" onEdit={() => router.push('/create-listing/pricing')} colors={colors}>
          <Text style={[styles.infoName, { color: colors.textPrimary }]}>
            {PRICE_TYPE_LABELS[state.priceType] || state.priceType}
          </Text>
          {state.priceType !== 'free' && state.price ? (
            <Text style={[styles.infoDescription, { color: colors.textSecondary }]}>
              {state.price} €
            </Text>
          ) : null}
          {state.listingType === 'product' && state.condition ? (
            <Text style={[styles.infoCategory, { color: colors.textTertiary }]}>
              Zustand: {CONDITION_LABELS[state.condition] || state.condition}
            </Text>
          ) : null}
        </SectionCard>

        {/* Fotos */}
        <SectionCard title="Fotos" onEdit={() => router.push('/create-listing/photos')} colors={colors}>
          {state.mediaUrls.length > 0 ? (
            <View style={styles.photosRow}>
              {state.mediaUrls.map((url, index) => (
                <Image
                  key={index}
                  source={{ uri: url }}
                  style={styles.photoThumb}
                  contentFit="cover"
                />
              ))}
            </View>
          ) : (
            <Text style={[styles.infoDescription, { color: colors.textTertiary }]}>Keine Fotos</Text>
          )}
        </SectionCard>

        {/* Standort */}
        <SectionCard title="Standort" onEdit={() => router.push('/create-listing/location')} colors={colors}>
          <Text style={[styles.infoDescription, { color: state.neighborhood.trim() ? colors.textPrimary : colors.textTertiary }]}>
            {state.neighborhood.trim() || 'Kein Standort angegeben'}
          </Text>
        </SectionCard>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <WizardFooter
        step={6}
        totalSteps={6}
        onBack={() => router.back()}
        onNext={handleSubmit}
        nextLabel="Anzeige erstellen"
        nextDisabled={isSubmitting}
        nextContent={isSubmitting ? <ActivityIndicator color={colors.onPrimary} /> : undefined}
      />
    </SafeAreaView>
  );
}

function SectionCard({
  title,
  children,
  onEdit,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  onEdit: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
      <View style={styles.sectionCardHeader}>
        <Text style={[styles.sectionCardTitle, { color: colors.textSecondary }]}>{title}</Text>
        <Pressable onPress={onEdit}>
          <Text style={[styles.sectionCardEdit, { color: colors.primary }]}>Bearbeiten</Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollView: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  stepLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: { fontSize: 26, fontFamily: 'Inter-Bold', marginBottom: 8 },
  subtitle: { fontSize: 15, fontFamily: 'Inter-Regular', marginBottom: 32 },
  sectionCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  sectionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionCardTitle: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionCardEdit: { fontSize: 13, fontFamily: 'Inter-Medium' },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  typeEmoji: { fontSize: 20 },
  typeLabel: { fontSize: 14, fontFamily: 'Inter-Medium' },
  infoName: { fontSize: 14, fontFamily: 'Inter-Medium' },
  infoDescription: { fontSize: 13, fontFamily: 'Inter-Regular', marginTop: 4 },
  infoCategory: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 8 },
  photosRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  photoThumb: { width: 48, height: 48, borderRadius: 8 },
  bottomSpacer: { height: 96 },
});
