import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { supabase } from '@/lib/supabase';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

export default function EditProfileScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user, updateProfile } = useUser();

  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [profilePicture, setProfilePicture] = useState(user?.profile_picture_url || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const ext = asset.uri.split('.').pop() || 'jpg';
      const fileName = `profile-pictures/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(fileName, decode(base64), { contentType, cacheControl: '3600' });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('images').getPublicUrl(fileName);
      setProfilePicture(urlData.publicUrl);
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert('Fehler', 'Bild konnte nicht hochgeladen werden.');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (username && (username.length < 3 || username.length > 30)) {
      Alert.alert('Fehler', 'Benutzername muss zwischen 3 und 30 Zeichen lang sein.');
      return;
    }
    if (username && !/^[a-zA-Z0-9_]+$/.test(username)) {
      Alert.alert('Fehler', 'Benutzername darf nur Buchstaben, Zahlen und Unterstriche enthalten.');
      return;
    }

    setSaving(true);
    try {
      await updateProfile({
        username: username || undefined,
        bio: bio || undefined,
        profile_picture_url: profilePicture || undefined,
      });
      router.back();
    } catch (error: any) {
      console.error('Error saving profile:', error);
      Alert.alert('Fehler', error?.message || 'Profil konnte nicht gespeichert werden.');
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
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Profil bearbeiten</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Picture */}
        <View style={styles.avatarSection}>
          <Pressable onPress={handlePickImage} disabled={uploading}>
            {profilePicture ? (
              <Image source={{ uri: profilePicture }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.cardPlaceholder }]} />
            )}
            {uploading && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color="#ffffff" />
              </View>
            )}
          </Pressable>
          <Pressable onPress={handlePickImage} disabled={uploading}>
            <Text style={[styles.changePhotoText, { color: colors.primary }]}>Foto ändern</Text>
          </Pressable>
        </View>

        {/* Username */}
        <View style={styles.fieldSection}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>BENUTZERNAME</Text>
          <View style={[styles.inputContainer, { backgroundColor: colors.surface }]}>
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              value={username}
              onChangeText={setUsername}
              placeholder="Benutzername eingeben"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={30}
            />
          </View>
          <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>
            3-30 Zeichen. Buchstaben, Zahlen und Unterstriche.
          </Text>
        </View>

        {/* Bio */}
        <View style={styles.fieldSection}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>ÜBER MICH</Text>
          <View style={[styles.inputContainer, { backgroundColor: colors.surface }]}>
            <TextInput
              style={[styles.input, styles.textArea, { color: colors.textPrimary }]}
              value={bio}
              onChangeText={setBio}
              placeholder="Erzählen Sie etwas über sich"
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={4}
              maxLength={500}
              textAlignVertical="top"
            />
          </View>
          <Text style={[styles.fieldHint, { color: colors.textTertiary }]}>
            {bio.length}/500 Zeichen
          </Text>
        </View>

        {/* Save Button */}
        <Pressable
          style={[styles.saveButton, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={[styles.saveButtonText, { color: colors.onPrimary }]}>Speichern</Text>
          )}
        </Pressable>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

// Base64 decode helper for Supabase upload
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
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
  avatarSection: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 24,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 48,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  changePhotoText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    marginTop: 12,
  },
  fieldSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
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
  textArea: {
    minHeight: 100,
  },
  fieldHint: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 6,
  },
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
