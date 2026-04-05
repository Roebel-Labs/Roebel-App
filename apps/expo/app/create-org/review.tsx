import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { useCreateOrgWizard } from '@/context/CreateOrgWizardContext';
import { useAccount } from '@/context/AccountContext';
import { createBusiness } from '@/lib/supabase-businesses';
import { createRestaurant } from '@/lib/supabase-restaurants';
import type { OrgType } from '@/lib/types';

const ORG_TYPE_LABELS: Record<string, { emoji: string; label: string }> = {
  restaurant: { emoji: '🍽️', label: 'Restaurant' },
  unternehmen: { emoji: '🏪', label: 'Unternehmen' },
  verein: { emoji: '🤝', label: 'Verein' },
  partei: { emoji: '🏛️', label: 'Partei' },
  fraktion: { emoji: '⚖️', label: 'Fraktion' },
};

const CATEGORY_LABELS: Record<string, string> = {
  gastronomie: 'Gastronomie', einzelhandel: 'Einzelhandel', handwerk: 'Handwerk',
  dienstleistung: 'Dienstleistung', gesundheit: 'Gesundheit', bildung: 'Bildung',
  kultur: 'Kultur', sport: 'Sport', tourismus: 'Tourismus', immobilien: 'Immobilien',
  sonstiges: 'Sonstiges',
};

export default function CreateOrgReviewScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, dispatch } = useCreateOrgWizard();
  const { createOrgAccount } = useAccount();
  const account = useActiveAccount();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const orgInfo = state.orgType ? ORG_TYPE_LABELS[state.orgType] : null;

  const handleSubmit = async () => {
    if (!account?.address || !state.orgType || !state.name.trim()) {
      Alert.alert('Fehler', 'Bitte fülle alle Pflichtfelder aus.');
      return;
    }

    setIsSubmitting(true);
    dispatch({ type: 'SET_SUBMITTING', payload: true });

    try {
      // 1. Map orgType to AccountType (restaurant → unternehmen)
      const accountType: OrgType = state.orgType === 'restaurant' ? 'unternehmen' : state.orgType as OrgType;

      // 2. Create account
      const orgAccount = await createOrgAccount(accountType, state.name.trim());

      // 3. Create business record
      await createBusiness({
        owner_wallet_address: account.address,
        name: state.name.trim(),
        category: state.category || 'sonstiges',
        description: state.description.trim() || undefined,
        phone: state.phone.trim() || undefined,
        email: state.email.trim() || undefined,
        website_url: state.website.trim() || undefined,
        address: state.formattedAddress || state.address.trim() || undefined,
        logo_url: state.logoUrl || undefined,
        cover_image_url: state.coverImageUrl || undefined,
      });

      // 4. For restaurants: also create restaurant record
      if (state.orgType === 'restaurant') {
        await createRestaurant({
          name: state.name.trim(),
          account_id: orgAccount.id,
          description: state.description.trim() || null,
          logo_url: state.logoUrl || null,
          cover_image_url: state.coverImageUrl || null,
          address: state.formattedAddress || state.address.trim() || null,
          phone: state.phone.trim() || null,
          website_url: state.website.trim() || null,
          opening_hours: state.openingHours,
          latitude: state.latitude,
          longitude: state.longitude,
        });
      }

      // 5. Navigate to success
      router.replace('/create-org/success');
    } catch (error: any) {
      console.error('Org creation error:', error);
      Alert.alert('Fehler', error?.message || 'Organisation konnte nicht erstellt werden.');
    } finally {
      setIsSubmitting(false);
      dispatch({ type: 'SET_SUBMITTING', payload: false });
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
        <Text className="text-sm font-inter-medium text-text-secondary mb-2">SCHRITT 6</Text>
        <Text className="text-2xl font-inter-bold text-text-primary mb-2">Überprüfen & Einreichen</Text>
        <Text className="text-sm font-inter-regular text-text-secondary mb-8">
          Prüfe deine Angaben bevor du den Antrag einreichst.
        </Text>

        {/* Type */}
        <SectionCard
          title="Typ"
          onEdit={() => router.push('/create-org/type')}
        >
          <View className="flex-row items-center gap-3">
            <Text className="text-2xl">{orgInfo?.emoji}</Text>
            <Text className="text-base font-inter-medium text-text-primary">{orgInfo?.label}</Text>
          </View>
        </SectionCard>

        {/* Info */}
        <SectionCard title="Informationen" onEdit={() => router.push('/create-org/info')}>
          <Text className="text-base font-inter-medium text-text-primary">{state.name || '—'}</Text>
          {state.description ? (
            <Text className="text-sm font-inter-regular text-text-secondary mt-1">{state.description}</Text>
          ) : null}
          {state.category ? (
            <Text className="text-xs font-inter-regular text-text-tertiary mt-2">
              Kategorie: {CATEGORY_LABELS[state.category] || state.category}
            </Text>
          ) : null}
        </SectionCard>

        {/* Location */}
        <SectionCard title="Adresse" onEdit={() => router.push('/create-org/location')}>
          <Text className="text-sm font-inter-regular text-text-primary">
            {state.formattedAddress || state.address || 'Keine Adresse angegeben'}
          </Text>
        </SectionCard>

        {/* Contact */}
        <SectionCard title="Kontakt" onEdit={() => router.push('/create-org/contact')}>
          {state.phone ? <Text className="text-sm font-inter-regular text-text-primary">Tel: {state.phone}</Text> : null}
          {state.email ? <Text className="text-sm font-inter-regular text-text-primary">E-Mail: {state.email}</Text> : null}
          {state.website ? <Text className="text-sm font-inter-regular text-text-primary">Web: {state.website}</Text> : null}
          {!state.phone && !state.email && !state.website && (
            <Text className="text-sm font-inter-regular text-text-tertiary">Keine Kontaktdaten</Text>
          )}
          {state.openingHours && (
            <Text className="text-xs font-inter-regular text-text-tertiary mt-2">Öffnungszeiten angegeben</Text>
          )}
        </SectionCard>

        {/* Photos */}
        <SectionCard title="Fotos" onEdit={() => router.push('/create-org/photos')}>
          <View className="flex-row gap-4">
            {state.logoUrl ? (
              <Image source={{ uri: state.logoUrl }} className="w-16 h-16 rounded-full" contentFit="cover" />
            ) : (
              <View className="w-16 h-16 rounded-full bg-border items-center justify-center">
                <Text className="text-xs font-inter-regular text-text-tertiary">Logo</Text>
              </View>
            )}
            {state.coverImageUrl ? (
              <Image source={{ uri: state.coverImageUrl }} className="flex-1 h-16 rounded-xl" contentFit="cover" />
            ) : (
              <View className="flex-1 h-16 rounded-xl bg-border items-center justify-center">
                <Text className="text-xs font-inter-regular text-text-tertiary">Titelbild</Text>
              </View>
            )}
          </View>
        </SectionCard>

        <View className="h-24" />
      </ScrollView>

      <View className="flex-row justify-between px-6 pb-6 pt-3">
        <Pressable onPress={() => router.back()} className="py-4 px-6">
          <Text className="text-base font-inter-medium text-text-secondary">Zurück</Text>
        </Pressable>
        <Pressable
          onPress={handleSubmit}
          disabled={isSubmitting}
          className={`bg-primary rounded-xl py-4 px-6 ${isSubmitting ? 'opacity-60' : ''}`}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text className="text-on-primary text-base font-inter-medium">Antrag einreichen</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function SectionCard({ title, children, onEdit }: { title: string; children: React.ReactNode; onEdit: () => void }) {
  return (
    <View className="bg-surface rounded-2xl p-4 mb-3">
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-xs font-inter-medium text-text-secondary uppercase tracking-wider">{title}</Text>
        <Pressable onPress={onEdit}>
          <Text className="text-sm font-inter-medium text-primary">Bearbeiten</Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}
