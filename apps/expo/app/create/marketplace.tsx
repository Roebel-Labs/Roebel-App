import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useAccount } from '@/context/AccountContext';
import { useSnackbar } from '@/context/SnackbarContext';
import { supabase } from '@/lib/supabase';
import { createMarketplaceListing } from '@/lib/supabase-marketplace';
import { useCreatePost } from '@/context/CreatePostContext';

import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

const MAX_IMAGES = 5;

const CATEGORIES = [
  { key: 'moebel', label: 'Möbel' },
  { key: 'elektronik', label: 'Elektronik' },
  { key: 'kleidung', label: 'Kleidung' },
  { key: 'fahrzeuge', label: 'Fahrzeuge' },
  { key: 'sport', label: 'Sport' },
  { key: 'garten', label: 'Garten' },
  { key: 'haushalt', label: 'Haushalt' },
  { key: 'spielzeug', label: 'Spielzeug' },
  { key: 'buecher', label: 'Bücher' },
  { key: 'dienstleistungen', label: 'Dienstleistungen' },
  { key: 'immobilien', label: 'Immobilien' },
  { key: 'sonstiges', label: 'Sonstiges' },
];

const CONDITIONS = [
  { key: 'neu', label: 'Neu' },
  { key: 'wie_neu', label: 'Wie neu' },
  { key: 'gut', label: 'Gut' },
  { key: 'akzeptabel', label: 'Akzeptabel' },
];

const PRICE_TYPES = [
  { key: 'fixed', label: 'Festpreis' },
  { key: 'negotiable', label: 'VB' },
  { key: 'free', label: 'Zu verschenken' },
];

type ConditionKey = 'neu' | 'wie_neu' | 'gut' | 'akzeptabel';
type PriceTypeKey = 'fixed' | 'negotiable' | 'free';

export default function CreateMarketplaceScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useUser();
  const { activeAccount } = useAccount();
  const { showSnackbar } = useSnackbar();
  const draft = useCreatePost();
  const walletAddress = user?.wallet_address;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [priceType, setPriceType] = useState<PriceTypeKey>('fixed');
  const [category, setCategory] = useState('sonstiges');
  const [condition, setCondition] = useState<ConditionKey>('gut');
  const [location, setLocation] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && !isSubmitting;

  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - images.length,
      quality: 0.8,
    });

    if (!result.canceled && result.assets) {
      const newUrls: string[] = [];
      for (const asset of result.assets) {
        try {
          const uploaded = await uploadImage(asset.uri);
          if (uploaded) newUrls.push(uploaded);
        } catch (err) {
          console.error('Error uploading image:', err);
        }
      }
      setImages((prev) => [...prev, ...newUrls].slice(0, MAX_IMAGES));
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const fileName = `listing-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const filePath = `marketplace/${walletAddress}/${fileName}`;

      const { error } = await supabase.storage.from('post-media').upload(filePath, blob, {
        contentType: 'image/jpeg',
      });

      if (error) {
        console.error('Upload error:', error);
        return null;
      }

      const { data } = supabase.storage.from('post-media').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (err) {
      console.error('Upload failed:', err);
      return null;
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!canSubmit || !walletAddress) return;
    setIsSubmitting(true);

    try {
      const listing = await createMarketplaceListing({
        seller_wallet_address: walletAddress,
        account_id: activeAccount?.id,
        title: title.trim(),
        description: description.trim(),
        price: priceType === 'free' ? 0 : parseFloat(price) || 0,
        price_type: priceType,
        category,
        condition,
        neighborhood: location.trim() || undefined,
        media_urls: images.length > 0 ? images : undefined,
      });

      if (listing) {
        // Pre-fill the create post context with the linked marketplace listing
        draft.setLinkedMarketplace(listing.id, {
          id: listing.id,
          title: listing.title,
          price: listing.price,
          price_type: listing.price_type,
          category: listing.category,
          condition: listing.condition,
          media_urls: listing.media_urls,
          neighborhood: listing.neighborhood,
        });
        showSnackbar({ message: 'Anzeige erstellt! Teile sie jetzt im Feed.' });
        // Navigate back to the compose screen (which is the parent /create/index)
        router.back();
      } else {
        showSnackbar({ message: 'Anzeige erstellt!' });
        router.back();
      }
    } catch {
      showSnackbar({ message: 'Fehler beim Erstellen der Anzeige' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Neue Anzeige</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {/* Title */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>Titel *</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surfaceSecondary }]}
              placeholder="Was bietest du an?"
              placeholderTextColor={colors.textTertiary}
              value={title}
              onChangeText={setTitle}
              maxLength={200}
            />
          </View>

          {/* Description */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>Beschreibung *</Text>
            <TextInput
              style={[styles.input, styles.textArea, { color: colors.textPrimary, backgroundColor: colors.surfaceSecondary }]}
              placeholder="Beschreibe deinen Artikel..."
              placeholderTextColor={colors.textTertiary}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Images */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>
              Fotos ({images.length}/{MAX_IMAGES})
            </Text>
            <View style={styles.imageRow}>
              {images.map((uri, i) => (
                <View key={i} style={styles.imageThumb}>
                  <Image source={{ uri }} style={styles.thumbImage} contentFit="cover" />
                  <Pressable
                    style={[styles.removeImage, { backgroundColor: colors.error }]}
                    onPress={() => removeImage(i)}
                  >
                    <Ionicons name="close" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
              {images.length < MAX_IMAGES && (
                <Pressable
                  style={[styles.addImage, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                  onPress={pickImages}
                >
                  <Ionicons name="camera-outline" size={24} color={colors.textTertiary} />
                </Pressable>
              )}
            </View>
          </View>

          {/* Price type */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>Preistyp</Text>
            <View style={styles.chipRow}>
              {PRICE_TYPES.map((pt) => (
                <Pressable
                  key={pt.key}
                  onPress={() => setPriceType(pt.key as PriceTypeKey)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: priceType === pt.key ? colors.primary : colors.surfaceSecondary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: priceType === pt.key ? colors.onPrimary : colors.textPrimary },
                    ]}
                  >
                    {pt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Price (hidden when free) */}
          {priceType !== 'free' && (
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>Preis (€)</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surfaceSecondary }]}
                placeholder="0.00"
                placeholderTextColor={colors.textTertiary}
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
              />
            </View>
          )}

          {/* Category */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>Kategorie</Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat.key}
                  onPress={() => setCategory(cat.key)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: category === cat.key ? colors.primary : colors.surfaceSecondary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: category === cat.key ? colors.onPrimary : colors.textPrimary },
                    ]}
                  >
                    {cat.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Condition */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>Zustand</Text>
            <View style={styles.chipRow}>
              {CONDITIONS.map((c) => (
                <Pressable
                  key={c.key}
                  onPress={() => setCondition(c.key as ConditionKey)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: condition === c.key ? colors.primary : colors.surfaceSecondary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: condition === c.key ? colors.onPrimary : colors.textPrimary },
                    ]}
                  >
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Location */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>Standort</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surfaceSecondary }]}
              placeholder="z.B. Röbel Zentrum"
              placeholderTextColor={colors.textTertiary}
              value={location}
              onChangeText={setLocation}
            />
          </View>

          {/* Submit */}
          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={[
              styles.submitButton,
              { backgroundColor: canSubmit ? colors.primary : colors.disabled },
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={[styles.submitText, { color: canSubmit ? colors.onPrimary : colors.disabledText }]}>
                Anzeige erstellen
              </Text>
            )}
          </Pressable>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
  },
  form: {
    padding: 16,
    gap: 20,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  input: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  imageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  imageThumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  removeImage: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addImage: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  submitButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
});
