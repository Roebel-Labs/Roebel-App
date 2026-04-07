import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useActiveAccount } from 'thirdweb/react';
import { createBusiness } from '@/lib/supabase-businesses';
import type { BusinessCategory } from '@/lib/types';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import CheckIcon from '@/assets/icons/check.svg';

const CATEGORIES: { value: BusinessCategory; label: string }[] = [
  { value: 'gastronomie', label: 'Gastronomie' },
  { value: 'einzelhandel', label: 'Einzelhandel' },
  { value: 'handwerk', label: 'Handwerk' },
  { value: 'dienstleistung', label: 'Dienstleistung' },
  { value: 'gesundheit', label: 'Gesundheit' },
  { value: 'bildung', label: 'Bildung' },
  { value: 'kultur', label: 'Kultur' },
  { value: 'sport', label: 'Sport' },
  { value: 'tourismus', label: 'Tourismus' },
  { value: 'immobilien', label: 'Immobilien' },
  { value: 'sonstiges', label: 'Sonstiges' },
];

export default function BusinessRegisterScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useUser();
  const account = useActiveAccount();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<BusinessCategory>('sonstiges');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const selectedCategoryLabel = CATEGORIES.find(c => c.value === category)?.label || 'Sonstiges';

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Fehler', 'Bitte geben Sie einen Unternehmensnamen ein.');
      return;
    }

    if (!account?.address) {
      Alert.alert('Fehler', 'Kein Wallet verbunden.');
      return;
    }

    setSaving(true);
    try {
      await createBusiness({
        owner_wallet_address: account.address,
        name: name.trim(),
        category,
        description: description.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        website_url: website.trim() || undefined,
        address: address.trim() || undefined,
      });
      setSuccess(true);
    } catch (error: any) {
      console.error('Error registering business:', error);
      Alert.alert('Fehler', error?.message || 'Registrierung fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.successContainer}>
          <View style={[styles.successIcon, { backgroundColor: '#D1FAE5' }]}>
            <CheckIcon width={32} height={32} color="#065F46" />
          </View>
          <Text style={[styles.successTitle, { color: colors.textPrimary }]}>Antrag eingereicht</Text>
          <Text style={[styles.successText, { color: colors.textSecondary }]}>
            Ihr Unternehmensprofil wird von der Verwaltung geprüft. Sie werden benachrichtigt, sobald es freigeschaltet ist.
          </Text>
          <Pressable style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Zurück zum Profil</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Unternehmen registrieren</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAwareScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" enableOnAndroid={true} enableAutomaticScroll={true} extraScrollHeight={100} extraHeight={150}>
        {/* Name */}
        <View style={styles.fieldSection}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>NAME *</Text>
          <View style={[styles.inputContainer, { backgroundColor: colors.surface }]}>
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              value={name}
              onChangeText={setName}
              placeholder="Unternehmensname"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
        </View>

        {/* Category */}
        <View style={styles.fieldSection}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>KATEGORIE</Text>
          <Pressable
            style={[styles.inputContainer, styles.pickerButton, { backgroundColor: colors.surface }]}
            onPress={() => setShowCategoryPicker(!showCategoryPicker)}
          >
            <Text style={[styles.input, { color: colors.textPrimary }]}>{selectedCategoryLabel}</Text>
          </Pressable>
          {showCategoryPicker && (
            <View style={[styles.pickerDropdown, { backgroundColor: colors.surface }]}>
              {CATEGORIES.map(cat => (
                <Pressable
                  key={cat.value}
                  style={[styles.pickerItem, category === cat.value && { backgroundColor: colors.borderSecondary }]}
                  onPress={() => { setCategory(cat.value); setShowCategoryPicker(false); }}
                >
                  <Text style={[styles.pickerItemText, { color: colors.textPrimary }]}>{cat.label}</Text>
                  {category === cat.value && <CheckIcon width={16} height={16} color={colors.primary} />}
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Description */}
        <View style={styles.fieldSection}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>BESCHREIBUNG</Text>
          <View style={[styles.inputContainer, { backgroundColor: colors.surface }]}>
            <TextInput
              style={[styles.input, styles.textArea, { color: colors.textPrimary }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Beschreiben Sie Ihr Unternehmen"
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* Contact Info */}
        <View style={styles.fieldSection}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>KONTAKT</Text>
          <View style={[styles.inputContainer, { backgroundColor: colors.surface }]}>
            <TextInput
              style={[styles.input, { color: colors.textPrimary }, styles.inputBorder, { borderBottomColor: colors.borderSecondary }]}
              value={phone}
              onChangeText={setPhone}
              placeholder="Telefon"
              placeholderTextColor={colors.textTertiary}
              keyboardType="phone-pad"
            />
            <TextInput
              style={[styles.input, { color: colors.textPrimary }, styles.inputBorder, { borderBottomColor: colors.borderSecondary }]}
              value={email}
              onChangeText={setEmail}
              placeholder="E-Mail"
              placeholderTextColor={colors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              value={website}
              onChangeText={setWebsite}
              placeholder="Website"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* Address */}
        <View style={styles.fieldSection}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>ADRESSE</Text>
          <View style={[styles.inputContainer, { backgroundColor: colors.surface }]}>
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              value={address}
              onChangeText={setAddress}
              placeholder="Straße, Hausnummer, PLZ Ort"
              placeholderTextColor={colors.textTertiary}
            />
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
            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Antrag einreichen</Text>
          )}
        </Pressable>

        <View style={styles.bottomPadding} />
      </KeyboardAwareScrollView>
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
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Medium',
    marginBottom: 12,
  },
  successText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  bottomPadding: {
    height: 40,
  },
});
