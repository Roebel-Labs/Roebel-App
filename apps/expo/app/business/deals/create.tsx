import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { fetchBusinessesByOwner } from '@/lib/supabase-businesses';
import { createDeal } from '@/lib/supabase-deals';
import type { BusinessRecord, DealType, DealStatus } from '@/lib/types';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import CheckIcon from '@/assets/icons/check.svg';

const DEAL_TYPES: { value: DealType; label: string }[] = [
  { value: 'discount', label: 'Rabatt' },
  { value: 'special', label: 'Spezial' },
  { value: 'event', label: 'Event' },
  { value: 'new_product', label: 'Neues Produkt' },
];

export default function CreateDealScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useUser();
  const [userBusiness, setUserBusiness] = useState<BusinessRecord | null>(null);

  React.useEffect(() => {
    if (user?.wallet_address) {
      fetchBusinessesByOwner(user.wallet_address).then(businesses => {
        setUserBusiness(businesses.find(b => b.status === 'approved') || businesses[0] || null);
      });
    }
  }, [user?.wallet_address]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dealType, setDealType] = useState<DealType>('discount');
  const [dealValue, setDealValue] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<DealStatus>('draft');
  const [saving, setSaving] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);

  const selectedTypeLabel = DEAL_TYPES.find(t => t.value === dealType)?.label || 'Rabatt';

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Fehler', 'Bitte geben Sie einen Titel ein.');
      return;
    }
    if (!userBusiness) {
      Alert.alert('Fehler', 'Kein Unternehmen gefunden.');
      return;
    }

    setSaving(true);
    try {
      await createDeal({
        business_id: userBusiness.id,
        title: title.trim(),
        deal_type: dealType,
        description: description.trim() || undefined,
        deal_value: dealValue.trim() || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        status,
      });
      router.back();
    } catch (error: any) {
      console.error('Error creating deal:', error);
      Alert.alert('Fehler', error?.message || 'Angebot konnte nicht erstellt werden.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Angebot erstellen</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Title */}
        <View style={styles.fieldSection}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>TITEL *</Text>
          <View style={[styles.inputContainer, { backgroundColor: colors.surface }]}>
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              value={title}
              onChangeText={setTitle}
              placeholder="z.B. 20% Rabatt auf alles"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
        </View>

        {/* Deal Type */}
        <View style={styles.fieldSection}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>ART</Text>
          <Pressable
            style={[styles.inputContainer, styles.pickerButton, { backgroundColor: colors.surface }]}
            onPress={() => setShowTypePicker(!showTypePicker)}
          >
            <Text style={[styles.input, { color: colors.textPrimary }]}>{selectedTypeLabel}</Text>
          </Pressable>
          {showTypePicker && (
            <View style={[styles.pickerDropdown, { backgroundColor: colors.surface }]}>
              {DEAL_TYPES.map(type => (
                <Pressable
                  key={type.value}
                  style={[styles.pickerItem, dealType === type.value && { backgroundColor: colors.borderSecondary }]}
                  onPress={() => { setDealType(type.value); setShowTypePicker(false); }}
                >
                  <Text style={[styles.pickerItemText, { color: colors.textPrimary }]}>{type.label}</Text>
                  {dealType === type.value && <CheckIcon width={16} height={16} color={colors.primary} />}
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Deal Value */}
        <View style={styles.fieldSection}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>WERT</Text>
          <View style={[styles.inputContainer, { backgroundColor: colors.surface }]}>
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              value={dealValue}
              onChangeText={setDealValue}
              placeholder="z.B. 20%, 2-für-1, Gratis Dessert"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
        </View>

        {/* Description */}
        <View style={styles.fieldSection}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>BESCHREIBUNG</Text>
          <View style={[styles.inputContainer, { backgroundColor: colors.surface }]}>
            <TextInput
              style={[styles.input, styles.textArea, { color: colors.textPrimary }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Details zum Angebot"
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* Dates */}
        <View style={styles.fieldSection}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>ZEITRAUM</Text>
          <View style={[styles.inputContainer, { backgroundColor: colors.surface }]}>
            <TextInput
              style={[styles.input, { color: colors.textPrimary }, styles.inputBorder, { borderBottomColor: colors.borderSecondary }]}
              value={startDate}
              onChangeText={setStartDate}
              placeholder="Startdatum (YYYY-MM-DD)"
              placeholderTextColor={colors.textTertiary}
            />
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              value={endDate}
              onChangeText={setEndDate}
              placeholder="Enddatum (YYYY-MM-DD)"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
        </View>

        {/* Status Toggle */}
        <View style={styles.fieldSection}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>STATUS</Text>
          <View style={styles.statusRow}>
            <Pressable
              style={[styles.statusButton, status === 'draft' && [styles.statusButtonActive, { backgroundColor: colors.primary }]]}
              onPress={() => setStatus('draft')}
            >
              <Text style={[styles.statusButtonText, { color: colors.textSecondary }, status === 'draft' && { color: colors.onPrimary }]}>Entwurf</Text>
            </Pressable>
            <Pressable
              style={[styles.statusButton, status === 'active' && [styles.statusButtonActive, { backgroundColor: colors.primary }]]}
              onPress={() => setStatus('active')}
            >
              <Text style={[styles.statusButtonText, { color: colors.textSecondary }, status === 'active' && { color: colors.onPrimary }]}>Aktiv</Text>
            </Pressable>
          </View>
        </View>

        {/* Submit */}
        <Pressable
          style={[styles.primaryButton, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Angebot erstellen</Text>
          )}
        </Pressable>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  fieldSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  input: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  inputBorder: {
    borderBottomWidth: 1,
  },
  textArea: {
    minHeight: 100,
  },
  pickerButton: {
    justifyContent: 'center',
  },
  pickerDropdown: {
    borderRadius: 12,
    marginTop: 8,
    overflow: 'hidden',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pickerItemText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statusButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statusButtonActive: {
    borderWidth: 0,
  },
  statusButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 32,
  },
  primaryButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
  bottomPadding: {
    height: 40,
  },
});
