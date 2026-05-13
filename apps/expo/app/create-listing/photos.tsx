import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useCreateListingWizard } from '@/context/CreateListingWizardContext';
import { useUser } from '@/context/UserContext';
import { uploadMediaFile } from '@/lib/upload-media';
import WizardFooter from '@/components/WizardFooter';
import StoryProgress from '@/components/StoryProgress';

const MAX_IMAGES = 5;

export default function PhotosScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, dispatch } = useCreateListingWizard();
  const { user } = useUser();

  const [uploading, setUploading] = useState(false);

  const walletAddress = user?.wallet_address ?? '';

  const pickAndUpload = async () => {
    if (state.mediaUrls.length >= MAX_IMAGES) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - state.mediaUrls.length,
      quality: 0.8,
    });

    if (result.canceled || !result.assets) return;

    setUploading(true);
    for (const asset of result.assets) {
      const url = await uploadMediaFile(
        asset.uri,
        walletAddress,
        'image',
        'marketplace',
      );
      if (url) {
        dispatch({ type: 'ADD_PHOTO', payload: url });
      }
    }
    setUploading(false);
  };

  const handleRemove = (index: number) => {
    dispatch({ type: 'REMOVE_PHOTO', payload: index });
  };

  const handleNext = () => {
    router.push('/create-listing/location');
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <StoryProgress step={4} totalSteps={6} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Zeig, was du anbietest</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Bis zu 5 Fotos. Das erste wird als Titelbild verwendet.
        </Text>

        {/* Image grid */}
        <View style={styles.grid}>
          {state.mediaUrls.map((uri, index) => (
            <View key={uri} style={styles.thumbnailWrapper}>
              <Image source={{ uri }} style={styles.thumbnail} contentFit="cover" />
              <Pressable
                onPress={() => handleRemove(index)}
                style={[styles.deleteButton, { backgroundColor: colors.error }]}
              >
                <Ionicons name="close" size={12} color="#fff" />
              </Pressable>
            </View>
          ))}

          {/* Upload in progress slot */}
          {uploading && (
            <View style={[styles.thumbnail, styles.uploadingSlot, { backgroundColor: colors.surface }]}>
              <ActivityIndicator color={colors.primary} />
            </View>
          )}

          {/* Add button */}
          {state.mediaUrls.length < MAX_IMAGES && !uploading && (
            <Pressable
              onPress={pickAndUpload}
              style={[styles.addButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              <Ionicons name="camera-outline" size={28} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>
      </ScrollView>

      <WizardFooter
        onBack={() => router.back()}
        onNext={handleNext}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollView: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  thumbnailWrapper: {
    position: 'relative',
  },
  thumbnail: {
    width: 100,
    height: 100,
    borderRadius: 12,
  },
  deleteButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadingSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
