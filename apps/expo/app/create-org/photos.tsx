import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useCreateOrgWizard } from '@/context/CreateOrgWizardContext';
import { supabase } from '@/lib/supabase';
import WizardFooter from '@/components/WizardFooter';

async function uploadImage(uri: string, folder: string): Promise<string | null> {
  try {
    const response = await fetch(uri);
    const arrayBuffer = await response.arrayBuffer();
    const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${folder}/${Date.now()}.${fileExt}`;
    const contentType = `image/${fileExt === 'png' ? 'png' : 'jpeg'}`;

    const { error } = await supabase.storage
      .from('images')
      .upload(fileName, arrayBuffer, { contentType, upsert: true });

    if (error) {
      console.error('Upload error:', error);
      return null;
    }

    const { data } = supabase.storage.from('images').getPublicUrl(fileName);
    return data.publicUrl;
  } catch (error) {
    console.error('Upload failed:', error);
    return null;
  }
}

export default function CreateOrgPhotosScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, dispatch } = useCreateOrgWizard();

  const [logoUrl, setLogoUrl] = useState<string | null>(state.logoUrl);
  const [coverUrl, setCoverUrl] = useState<string | null>(state.coverImageUrl);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const pickAndUpload = async (type: 'logo' | 'cover') => {
    const aspect: [number, number] = type === 'logo' ? [1, 1] : [16, 9];
    const setUploading = type === 'logo' ? setUploadingLogo : setUploadingCover;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect,
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]?.uri) return;

    setUploading(true);
    const url = await uploadImage(result.assets[0].uri, type === 'logo' ? 'org-logos' : 'org-covers');
    setUploading(false);

    if (url) {
      if (type === 'logo') setLogoUrl(url);
      else setCoverUrl(url);
    } else {
      Alert.alert('Fehler', 'Bild konnte nicht hochgeladen werden.');
    }
  };

  const handleNext = () => {
    dispatch({ type: 'SET_PHOTOS', payload: { logoUrl, coverImageUrl: coverUrl } });
    router.push('/create-org/review');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>Schritt 5</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Zeigt euch von eurer besten Seite</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Ein gutes Profilbild und Cover machen den Unterschied.
        </Text>

        {/* Logo */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Logo</Text>
        <Pressable onPress={() => pickAndUpload('logo')} style={styles.logoPressable}>
          {uploadingLogo ? (
            <View style={[styles.logoPlaceholder, { backgroundColor: colors.surface }]}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.logoImage} contentFit="cover" />
          ) : (
            <View style={[styles.logoPlaceholder, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={styles.placeholderIcon}>📷</Text>
              <Text style={[styles.placeholderText, { color: colors.textTertiary }]}>Logo wählen</Text>
            </View>
          )}
        </Pressable>

        {/* Cover */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Titelbild</Text>
        <Pressable onPress={() => pickAndUpload('cover')} style={styles.coverPressable}>
          {uploadingCover ? (
            <View style={[styles.coverPlaceholder, { backgroundColor: colors.surface }]}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : coverUrl ? (
            <Image source={{ uri: coverUrl }} style={styles.coverImage} contentFit="cover" />
          ) : (
            <View style={[styles.coverPlaceholder, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={styles.placeholderIcon}>🖼️</Text>
              <Text style={[styles.coverPlaceholderText, { color: colors.textTertiary }]}>Titelbild wählen</Text>
            </View>
          )}
        </Pressable>
      </ScrollView>

      <WizardFooter
        step={5}
        onBack={() => router.back()}
        onNext={handleNext}
      />
    </SafeAreaView>
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
  title: {
    fontSize: 26,
    fontFamily: 'Inter-Bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    marginBottom: 32,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  logoPressable: { alignItems: 'center', marginBottom: 32 },
  logoPlaceholder: {
    width: 112,
    height: 112,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  logoImage: { width: 112, height: 112, borderRadius: 9999 },
  placeholderIcon: { fontSize: 22 },
  placeholderText: { fontSize: 12, fontFamily: 'Inter-Regular', marginTop: 4 },
  coverPressable: { marginBottom: 32 },
  coverPlaceholder: {
    width: '100%',
    height: 176,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  coverImage: { width: '100%', height: 176, borderRadius: 16 },
  coverPlaceholderText: { fontSize: 13, fontFamily: 'Inter-Regular', marginTop: 8 },
});
