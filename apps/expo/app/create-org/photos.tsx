import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useCreateOrgWizard } from '@/context/CreateOrgWizardContext';
import { supabase } from '@/lib/supabase';

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
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>
        <Text className="text-sm font-inter-medium text-text-secondary mb-2">SCHRITT 5</Text>
        <Text className="text-2xl font-inter-bold text-text-primary mb-2">Fotos hinzufügen</Text>
        <Text className="text-sm font-inter-regular text-text-secondary mb-8">
          Ein gutes Profilbild und Cover machen den Unterschied.
        </Text>

        {/* Logo */}
        <Text className="text-xs font-inter-medium text-text-secondary mb-3 uppercase tracking-wider">Logo</Text>
        <Pressable onPress={() => pickAndUpload('logo')} className="items-center mb-8">
          {uploadingLogo ? (
            <View className="w-28 h-28 rounded-full bg-surface items-center justify-center">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : logoUrl ? (
            <Image source={{ uri: logoUrl }} className="w-28 h-28 rounded-full" contentFit="cover" />
          ) : (
            <View className="w-28 h-28 rounded-full bg-surface items-center justify-center border-2 border-dashed border-border">
              <Text className="text-3xl">📷</Text>
              <Text className="text-xs font-inter-regular text-text-tertiary mt-1">Logo wählen</Text>
            </View>
          )}
        </Pressable>

        {/* Cover */}
        <Text className="text-xs font-inter-medium text-text-secondary mb-3 uppercase tracking-wider">Titelbild</Text>
        <Pressable onPress={() => pickAndUpload('cover')} className="mb-8">
          {uploadingCover ? (
            <View className="w-full h-44 rounded-2xl bg-surface items-center justify-center">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : coverUrl ? (
            <Image source={{ uri: coverUrl }} className="w-full h-44 rounded-2xl" contentFit="cover" />
          ) : (
            <View className="w-full h-44 rounded-2xl bg-surface items-center justify-center border-2 border-dashed border-border">
              <Text className="text-3xl">🖼️</Text>
              <Text className="text-sm font-inter-regular text-text-tertiary mt-2">Titelbild wählen</Text>
            </View>
          )}
        </Pressable>
      </ScrollView>

      <View className="flex-row justify-between px-6 pb-6 pt-3">
        <Pressable onPress={() => router.back()} className="py-4 px-6">
          <Text className="text-base font-inter-medium text-text-secondary">Zurück</Text>
        </Pressable>
        <Pressable onPress={handleNext} className="bg-primary rounded-xl py-4 px-8">
          <Text className="text-on-primary text-base font-inter-medium">Weiter</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
