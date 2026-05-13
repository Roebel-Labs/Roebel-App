import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useCreateDealWizard } from '@/context/CreateDealWizardContext';
import { createDeal } from '@/lib/supabase-deals';
import WizardFooter from '@/components/WizardFooter';
import StoryProgress from '@/components/StoryProgress';

const DEAL_TYPE_LABELS: Record<string, { emoji: string; label: string }> = {
  discount: { emoji: '🏷️', label: 'Rabatt' },
  special: { emoji: '⭐', label: 'Spezial' },
  event: { emoji: '🎉', label: 'Event' },
  new_product: { emoji: '🆕', label: 'Neues Produkt' },
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Entwurf',
  active: 'Sofort aktiv',
};

export default function CreateDealReviewScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, dispatch } = useCreateDealWizard();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const typeInfo = state.dealType ? DEAL_TYPE_LABELS[state.dealType] : null;

  const handleSubmit = async () => {
    if (!state.businessId || !state.title.trim() || !state.dealType) return;
    setIsSubmitting(true);
    dispatch({ type: 'SET_SUBMITTING', payload: true });
    try {
      const deal = await createDeal({
        business_id: state.businessId,
        title: state.title.trim(),
        deal_type: state.dealType,
        description: state.description.trim() || undefined,
        deal_value: state.dealValue.trim() || undefined,
        image_url: state.imageUrl || undefined,
        start_date: state.startDate || undefined,
        end_date: state.endDate || undefined,
        status: state.status,
      });
      dispatch({ type: 'SET_NEW_DEAL_ID', payload: deal.id });
      router.replace('/create-deal/success');
    } catch (error: any) {
      Alert.alert('Fehler', error?.message || 'Angebot konnte nicht erstellt werden.');
    } finally {
      setIsSubmitting(false);
      dispatch({ type: 'SET_SUBMITTING', payload: false });
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <StoryProgress step={5} totalSteps={5} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Alles richtig?</Text>

        {/* Art */}
        <SectionCard title="Art" onEdit={() => router.push('/create-deal/type')} colors={colors}>
          <View style={styles.typeRow}>
            <Text style={styles.typeEmoji}>{typeInfo?.emoji}</Text>
            <Text style={[styles.typeLabel, { color: colors.textPrimary }]}>{typeInfo?.label}</Text>
          </View>
        </SectionCard>

        {/* Details */}
        <SectionCard title="Details" onEdit={() => router.push('/create-deal/details')} colors={colors}>
          <Text style={[styles.infoName, { color: colors.textPrimary }]}>{state.title || '—'}</Text>
          {state.dealValue ? (
            <Text style={[styles.infoDescription, { color: colors.textSecondary }]}>
              Wert: {state.dealValue}
            </Text>
          ) : null}
          {state.description ? (
            <Text style={[styles.infoDescription, { color: colors.textSecondary }]} numberOfLines={3}>
              {state.description}
            </Text>
          ) : null}
        </SectionCard>

        {/* Bild */}
        <SectionCard title="Bild" onEdit={() => router.push('/create-deal/image')} colors={colors}>
          {state.imageUrl ? (
            <Image
              source={{ uri: state.imageUrl }}
              style={styles.photoThumb}
              contentFit="cover"
            />
          ) : (
            <Text style={[styles.infoDescription, { color: colors.textTertiary }]}>Kein Bild</Text>
          )}
        </SectionCard>

        {/* Zeitraum */}
        <SectionCard title="Zeitraum" onEdit={() => router.push('/create-deal/schedule')} colors={colors}>
          <Text style={[styles.infoName, { color: state.startDate || state.endDate ? colors.textPrimary : colors.textTertiary }]}>
            {state.startDate || 'Kein Start'} – {state.endDate || 'Kein Ende'}
          </Text>
          <Text style={[styles.infoDescription, { color: colors.textSecondary }]}>
            {STATUS_LABELS[state.status] || state.status}
          </Text>
        </SectionCard>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <WizardFooter
        onBack={() => router.back()}
        onNext={handleSubmit}
        nextLabel="Angebot erstellen"
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
  title: { fontSize: 26, fontFamily: 'Inter-Bold', marginBottom: 24 },
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
  photoThumb: { width: 80, height: 80, borderRadius: 8 },
  bottomSpacer: { height: 96 },
});
