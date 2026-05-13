import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useCreateDealWizard } from '@/context/CreateDealWizardContext';
import { useUser } from '@/context/UserContext';
import { uploadMediaFile } from '@/lib/upload-media';
import WizardFooter from '@/components/WizardFooter';
import StoryProgress from '@/components/StoryProgress';

export default function CreateDealImageScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, dispatch } = useCreateDealWizard();
  const { user } = useUser();

  const [uploading, setUploading] = useState(false);

  const walletAddress = user?.wallet_address ?? '';

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [16, 9],
    });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    const url = await uploadMediaFile(result.assets[0].uri, walletAddress, 'image', 'deals');
    if (url) dispatch({ type: 'SET_IMAGE', payload: url });
    setUploading(false);
  };

  const handleRemove = () => {
    dispatch({ type: 'SET_IMAGE', payload: null });
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <StoryProgress step={3} totalSteps={5} />
        <Text style={[styles.heading, { color: colors.textPrimary }]}>
          Füge ein Bild hinzu
        </Text>
        <Text style={[styles.subheading, { color: colors.textSecondary }]}>
          Optional: Ein Bild macht dein Angebot attraktiver.
        </Text>

        {state.imageUrl ? (
          <View style={styles.previewWrapper}>
            <Image
              source={{ uri: state.imageUrl }}
              style={styles.preview}
              contentFit="cover"
            />
            <Pressable
              onPress={handleRemove}
              style={[styles.deleteButton, { backgroundColor: colors.error }]}
            >
              <Ionicons name="close" size={16} color="#fff" />
            </Pressable>
          </View>
        ) : uploading ? (
          <View style={[styles.placeholder, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : (
          <Pressable
            onPress={pickImage}
            style={[styles.placeholder, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Ionicons name="camera-outline" size={32} color={colors.textTertiary} />
            <Text style={[styles.placeholderText, { color: colors.textTertiary }]}>
              Bild auswählen
            </Text>
          </Pressable>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <WizardFooter
        onBack={() => router.back()}
        onNext={() => router.push('/create-deal/schedule')}
        nextDisabled={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollView: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  heading: {
    fontSize: 26,
    fontFamily: 'Inter-Bold',
    marginBottom: 8,
  },
  subheading: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    marginBottom: 32,
  },
  placeholder: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  placeholderText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  previewWrapper: {
    position: 'relative',
    width: '100%',
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  deleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomSpacer: {
    height: 24,
  },
});
