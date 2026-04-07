import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Dimensions,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '@/context/ThemeContext';
import { fetchBusinessBySlug, updateBusiness } from '@/lib/supabase-businesses';
import { supabase } from '@/lib/supabase';
import type { BusinessRecord, BusinessCategory, OpeningHours } from '@/lib/types';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import CheckIcon from '@/assets/icons/check.svg';

const SCREEN_WIDTH = Dimensions.get('window').width;

type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

const DAY_LABELS: { key: DayOfWeek; label: string }[] = [
  { key: 'monday', label: 'Montag' },
  { key: 'tuesday', label: 'Dienstag' },
  { key: 'wednesday', label: 'Mittwoch' },
  { key: 'thursday', label: 'Donnerstag' },
  { key: 'friday', label: 'Freitag' },
  { key: 'saturday', label: 'Samstag' },
  { key: 'sunday', label: 'Sonntag' },
];

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

type OpeningHoursState = Record<DayOfWeek, { open: string; close: string; closed: boolean }>;

const DEFAULT_HOURS: OpeningHoursState = {
  monday: { open: '09:00', close: '17:00', closed: false },
  tuesday: { open: '09:00', close: '17:00', closed: false },
  wednesday: { open: '09:00', close: '17:00', closed: false },
  thursday: { open: '09:00', close: '17:00', closed: false },
  friday: { open: '09:00', close: '17:00', closed: false },
  saturday: { open: '09:00', close: '13:00', closed: true },
  sunday: { open: '', close: '', closed: true },
};

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export default function BusinessEditScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors } = useTheme();

  const [business, setBusiness] = useState<BusinessRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState<BusinessCategory>('sonstiges');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [hours, setHours] = useState<OpeningHoursState>(DEFAULT_HOURS);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const data = await fetchBusinessBySlug(slug);
        if (data) {
          setBusiness(data);
          setName(data.name);
          setCategory(data.category);
          setDescription(data.description || '');
          setPhone(data.phone || '');
          setEmail(data.email || '');
          setWebsite(data.website_url || '');
          setAddress(data.address || '');
          setCoverImageUrl(data.cover_image_url || '');
          setLogoUrl(data.logo_url || '');
          if (data.opening_hours) {
            const oh = data.opening_hours as OpeningHours;
            const state: OpeningHoursState = { ...DEFAULT_HOURS };
            for (const day of DAY_LABELS) {
              const d = oh[day.key];
              if (d) {
                state[day.key] = { open: d.open || '', close: d.close || '', closed: !!d.closed };
              }
            }
            setHours(state);
          }
        }
      } catch (error) {
        console.error('Error loading business:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const uploadImage = async (
    aspect: [number, number],
    folder: string,
    setUrl: (url: string) => void,
    setUploading: (v: boolean) => void,
  ) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const ext = asset.uri.split('.').pop() || 'jpg';
      const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(fileName, decode(base64), { contentType, cacheControl: '3600' });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('images').getPublicUrl(fileName);
      setUrl(urlData.publicUrl);
    } catch (error) {
      console.error('Image upload error:', error);
      Alert.alert('Fehler', 'Bild konnte nicht hochgeladen werden.');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!business) return;
    if (!name.trim()) {
      Alert.alert('Fehler', 'Bitte geben Sie einen Unternehmensnamen ein.');
      return;
    }

    setSaving(true);
    try {
      const openingHours: OpeningHours = {};
      for (const day of DAY_LABELS) {
        const h = hours[day.key];
        openingHours[day.key] = { open: h.open, close: h.close, closed: h.closed };
      }

      await updateBusiness(business.id, {
        name: name.trim(),
        category,
        description: description.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        website_url: website.trim() || null,
        address: address.trim() || null,
        cover_image_url: coverImageUrl || null,
        logo_url: logoUrl || null,
        opening_hours: openingHours,
      });
      router.back();
    } catch (error: any) {
      console.error('Error saving business:', error);
      Alert.alert('Fehler', error?.message || 'Änderungen konnten nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  const updateHour = (day: DayOfWeek, field: 'open' | 'close', value: string) => {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  const toggleDayClosed = (day: DayOfWeek) => {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], closed: !prev[day].closed } }));
  };

  const selectedCategoryLabel = CATEGORIES.find((c) => c.value === category)?.label || 'Sonstiges';

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Bearbeiten</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!business) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Bearbeiten</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Unternehmen nicht gefunden</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Bearbeiten</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAwareScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" enableOnAndroid={true} enableAutomaticScroll={true} extraScrollHeight={100} extraHeight={150}>
        {/* Cover Image */}
        <View style={styles.coverSection}>
          <Pressable onPress={() => uploadImage([16, 9], 'business-covers', setCoverImageUrl, setUploadingCover)} disabled={uploadingCover}>
            {coverImageUrl ? (
              <Image source={{ uri: coverImageUrl }} style={styles.coverPreview} contentFit="cover" accessibilityIgnoresInvertColors />
            ) : (
              <View style={[styles.coverPlaceholder, { backgroundColor: colors.surface }]}>
                <Text style={[styles.placeholderText, { color: colors.textTertiary }]}>Titelbild hinzufügen</Text>
              </View>
            )}
            {uploadingCover && (
              <View style={styles.imageOverlay}>
                <ActivityIndicator color="#ffffff" />
              </View>
            )}
          </Pressable>
          <Pressable onPress={() => uploadImage([16, 9], 'business-covers', setCoverImageUrl, setUploadingCover)} disabled={uploadingCover}>
            <Text style={[styles.changeLink, { color: colors.primary }]}>Titelbild ändern</Text>
          </Pressable>
        </View>

        {/* Logo */}
        <View style={styles.logoSection}>
          <Pressable onPress={() => uploadImage([1, 1], 'business-logos', setLogoUrl, setUploadingLogo)} disabled={uploadingLogo}>
            {logoUrl ? (
              <Image source={{ uri: logoUrl }} style={styles.logoPreview} contentFit="cover" accessibilityIgnoresInvertColors />
            ) : (
              <View style={[styles.logoPlaceholder, { backgroundColor: colors.surface }]}>
                <Text style={[styles.logoPlaceholderText, { color: colors.textTertiary }]}>Logo</Text>
              </View>
            )}
            {uploadingLogo && (
              <View style={styles.logoOverlay}>
                <ActivityIndicator color="#ffffff" />
              </View>
            )}
          </Pressable>
          <Pressable onPress={() => uploadImage([1, 1], 'business-logos', setLogoUrl, setUploadingLogo)} disabled={uploadingLogo}>
            <Text style={[styles.changeLink, { color: colors.primary }]}>Logo ändern</Text>
          </Pressable>
        </View>

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
              {CATEGORIES.map((cat) => (
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

        {/* Contact */}
        <View style={styles.fieldSection}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>KONTAKT</Text>
          <View style={[styles.inputContainer, { backgroundColor: colors.surface }]}>
            <TextInput
              style={[styles.input, styles.inputBorder, { color: colors.textPrimary, borderBottomColor: colors.borderSecondary }]}
              value={phone}
              onChangeText={setPhone}
              placeholder="Telefon"
              placeholderTextColor={colors.textTertiary}
              keyboardType="phone-pad"
            />
            <TextInput
              style={[styles.input, styles.inputBorder, { color: colors.textPrimary, borderBottomColor: colors.borderSecondary }]}
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

        {/* Opening Hours */}
        <View style={styles.fieldSection}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>ÖFFNUNGSZEITEN</Text>
          <View style={[styles.hoursContainer, { backgroundColor: colors.surface }]}>
            {DAY_LABELS.map(({ key, label }, index) => (
              <View
                key={key}
                style={[
                  styles.hoursRow,
                  index < DAY_LABELS.length - 1 && styles.hoursRowBorder,
                  index < DAY_LABELS.length - 1 && { borderBottomColor: colors.borderSecondary },
                ]}
              >
                <View style={styles.hoursLeft}>
                  <Text style={[styles.dayLabel, { color: colors.textPrimary }]}>{label}</Text>
                  <Switch
                    value={!hours[key].closed}
                    onValueChange={() => toggleDayClosed(key)}
                    trackColor={{ false: colors.borderSecondary, true: `${colors.primary}60` }}
                    thumbColor={!hours[key].closed ? colors.primary : colors.textTertiary}
                    style={styles.daySwitch}
                  />
                </View>
                {!hours[key].closed ? (
                  <View style={styles.hoursRight}>
                    <TextInput
                      style={[styles.timeInput, { color: colors.textPrimary, backgroundColor: colors.background }]}
                      value={hours[key].open}
                      onChangeText={(v) => updateHour(key, 'open', v)}
                      placeholder="09:00"
                      placeholderTextColor={colors.textTertiary}
                      maxLength={5}
                    />
                    <Text style={[styles.timeSeparator, { color: colors.textTertiary }]}>–</Text>
                    <TextInput
                      style={[styles.timeInput, { color: colors.textPrimary, backgroundColor: colors.background }]}
                      value={hours[key].close}
                      onChangeText={(v) => updateHour(key, 'close', v)}
                      placeholder="17:00"
                      placeholderTextColor={colors.textTertiary}
                      maxLength={5}
                    />
                  </View>
                ) : (
                  <Text style={[styles.closedText, { color: colors.textTertiary }]}>Geschlossen</Text>
                )}
              </View>
            ))}
          </View>
        </View>

        {/* Save */}
        <Pressable
          style={[styles.saveButton, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.saveButtonText}>Speichern</Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter',
  },
  // Cover
  coverSection: {
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 16,
  },
  coverPreview: {
    width: SCREEN_WIDTH - 32,
    height: Math.round((SCREEN_WIDTH - 32) * 9 / 16),
    borderRadius: 12,
  },
  coverPlaceholder: {
    width: SCREEN_WIDTH - 32,
    height: Math.round((SCREEN_WIDTH - 32) * 9 / 16),
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  changeLink: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    marginTop: 10,
  },
  // Logo
  logoSection: {
    alignItems: 'center',
    paddingTop: 20,
  },
  logoPreview: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  logoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoPlaceholderText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  logoOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Fields
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
  // Opening Hours
  hoursContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  hoursRowBorder: {
    borderBottomWidth: 1,
  },
  hoursLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dayLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    width: 80,
  },
  daySwitch: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
  },
  hoursRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeInput: {
    width: 60,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  timeSeparator: {
    fontSize: 14,
  },
  closedText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  // Save
  saveButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 32,
  },
  saveButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
  bottomPadding: {
    height: 40,
  },
});
