import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Alert, ActivityIndicator, Image, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useActiveWallet, useDisconnect } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { useRewards } from '@/context/RewardsContext';
import { useCirclesProfileSync } from '@/hooks/useCirclesProfileSync';
import { supabase } from '@/lib/supabase';
import { Events, track } from '@/lib/analytics';
import {
  equipRewardByType,
  fetchRewardsCatalogueByType,
} from '@/lib/supabase-rewards';
import type { LootboxReward } from '@/lib/supabase-rewards';
import LogoutDrawer from '@/components/LogoutDrawer';
import BottomDrawer from '@/components/BottomDrawer';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';
import FrameCarousel from '@/components/rewards/FrameCarousel';
import BannerSelectionGrid from '@/components/rewards/BannerSelectionGrid';
import TierBadge from '@/components/RoleBadge';

export default function EditProfileScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user, updateProfile } = useUser();
  const { userRewards, refresh: refreshRewards } = useRewards();
  const wallet = useActiveWallet();
  const { disconnect } = useDisconnect();
  const circles = useCirclesProfileSync();

  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [profilePicture, setProfilePicture] = useState(user?.profile_picture_url || '');
  const [neighborhood, setNeighborhood] = useState(user?.neighborhood || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showLogoutDrawer, setShowLogoutDrawer] = useState(false);
  const [circlesError, setCirclesError] = useState<{ visible: boolean; message?: string }>({ visible: false });

  const [frameCatalogue, setFrameCatalogue] = useState<LootboxReward[]>([]);
  const [bannerCatalogue, setBannerCatalogue] = useState<LootboxReward[]>([]);

  // Derive currently-equipped ids straight from the RewardsContext inventory.
  const equippedFrameId =
    userRewards.find((r) => r.reward?.type === 'profile_frame' && r.is_equipped)?.id ?? null;
  const equippedBannerId =
    userRewards.find((r) => r.reward?.type === 'profile_banner' && r.is_equipped)?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [frames, banners] = await Promise.all([
        fetchRewardsCatalogueByType('profile_frame'),
        fetchRewardsCatalogueByType('profile_banner'),
      ]);
      if (cancelled) return;
      setFrameCatalogue(frames);
      setBannerCatalogue(banners);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = () => {
    if (wallet) {
      disconnect(wallet);
      setShowLogoutDrawer(false);
      router.replace('/profile' as any);
    }
  };

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
      const usernameChanged = (username || '') !== (user?.username || '');
      await updateProfile({
        username: username || undefined,
        bio: bio || undefined,
        profile_picture_url: profilePicture || undefined,
        neighborhood: neighborhood || undefined,
      });
      track(Events.PROFILE_UPDATED, {
        changed_username: !!username,
        changed_bio: !!bio,
        changed_profile_picture: !!profilePicture,
        changed_neighborhood: !!neighborhood,
      });
      // Keep the public Circles profile in sync if the citizen opted in (best-effort:
      // never block the profile save on a Circles network hiccup).
      if (circles.published) {
        try {
          await circles.publish({
            name: username || user?.display_name || 'Röbel-Bürger:in',
            description: bio || undefined,
            imageUrl: profilePicture || undefined,
          });
        } catch (e) {
          console.warn('[circles] profile resync failed:', e);
        }
      }
      // The username drives the /user/[username] route param. If it changed, the
      // previous screen's route no longer resolves, so land on the renamed profile.
      if (usernameChanged && username) {
        router.replace(`/user/${username}` as any);
      } else {
        router.back();
      }
    } catch (error: any) {
      console.error('Error saving profile:', error);
      Alert.alert('Fehler', error?.message || 'Profil konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleCircles = (next: boolean) => {
    if (circles.busy) return;
    if (next) {
      Alert.alert(
        'Öffentlich im Circles-Netzwerk',
        'Dein Name und dein Profilbild werden öffentlich und dauerhaft im Circles-Netzwerk gespeichert (IPFS + Blockchain). Sie sind dann mit deiner Wallet und deinen Zahlungen verknüpft und in Apps wie Metri sichtbar.\n\nMöchtest du fortfahren?',
        [
          { text: 'Abbrechen', style: 'cancel' },
          {
            text: 'Veröffentlichen',
            onPress: async () => {
              try {
                await circles.publish({
                  name: username || user?.display_name || 'Röbel-Bürger:in',
                  description: bio || undefined,
                  imageUrl: profilePicture || undefined,
                });
              } catch (e: any) {
                setCirclesError({ visible: true, message: e?.message });
              }
            },
          },
        ],
      );
    } else {
      Alert.alert(
        'Aus Circles-Netzwerk entfernen',
        'Dein Name und Foto werden aus deinem Circles-Profil entfernt — in anderen Apps erscheinst du dann wieder nur als Adresse. (Bereits kopierte Daten können im Netzwerk fortbestehen.)',
        [
          { text: 'Abbrechen', style: 'cancel' },
          {
            text: 'Entfernen',
            style: 'destructive',
            onPress: async () => {
              try {
                await circles.unpublish();
              } catch (e: any) {
                setCirclesError({ visible: true, message: e?.message });
              }
            },
          },
        ],
      );
    }
  };

  const handleEquipFrame = async (userRewardId: string | null) => {
    if (!user?.wallet_address) return;
    await equipRewardByType(user.wallet_address, 'profile_frame', userRewardId);
    await refreshRewards();
  };

  const handleEquipBanner = async (userRewardId: string | null) => {
    if (!user?.wallet_address) return;
    await equipRewardByType(user.wallet_address, 'profile_banner', userRewardId);
    await refreshRewards();
  };

  const handleLockedTap = () => {
    Alert.alert(
      'Noch gesperrt',
      'Öffne Truhen in der Schatzkammer, um diese Belohnung freizuschalten.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Zur Schatzkammer', onPress: () => router.push('/rewards' as any) },
      ]
    );
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

      <KeyboardAwareScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        extraScrollHeight={100}
        extraHeight={150}
      >
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
          <View style={styles.statusBadge}>
            <TierBadge
              tier={user?.tier ?? 'guest'}
              size="medium"
              preferredRole={user?.preferred_role}
              isVerifiedCitizen={user?.is_verified_citizen}
            />
          </View>
        </View>

        {/* Frame carousel (horizontal swipe) */}
        <View style={styles.fieldSection}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>PROFIL-RAHMEN</Text>
        </View>
        <FrameCarousel
          catalogue={frameCatalogue}
          userRewards={userRewards}
          avatarUri={profilePicture || null}
          equippedUserRewardId={equippedFrameId}
          onSelect={handleEquipFrame}
          onLockedTap={handleLockedTap}
        />

        {/* Banner grid */}
        <View style={styles.fieldSection}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>COVER-BANNER</Text>
        </View>
        <BannerSelectionGrid
          catalogue={bannerCatalogue}
          userRewards={userRewards}
          equippedUserRewardId={equippedBannerId}
          onSelect={handleEquipBanner}
          onLockedTap={handleLockedTap}
        />

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

        {/* Neighborhood */}
        <View style={styles.fieldSection}>
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>ORTSTEIL</Text>
          <View style={[styles.inputContainer, { backgroundColor: colors.surface }]}>
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              value={neighborhood}
              onChangeText={setNeighborhood}
              placeholder="z. B. Altstadt"
              placeholderTextColor={colors.textTertiary}
              maxLength={60}
            />
          </View>
        </View>

        {/* Circles-Netzwerk Sichtbarkeit — für alle sichtbar */}
        <View style={styles.fieldSection}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>CIRCLES-NETZWERK</Text>
            <View style={[styles.circlesCard, { backgroundColor: colors.surface }]}>
              <View style={styles.circlesRow}>
                <View style={styles.circlesTextWrap}>
                  <Text style={[styles.circlesTitle, { color: colors.textPrimary }]}>
                    In anderen Circles-Apps anzeigen
                  </Text>
                  <Text style={[styles.circlesDesc, { color: colors.textSecondary }]}>
                    Zeigt deinen Namen & dein Foto in Apps wie Metri – statt nur deiner Adresse.
                  </Text>
                </View>
                {circles.busy ? (
                  <ActivityIndicator color={colors.primary} style={{ width: 51 }} />
                ) : (
                  <Switch
                    value={circles.published === true}
                    onValueChange={handleToggleCircles}
                    disabled={circles.published === null}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor={colors.onPrimary}
                    ios_backgroundColor={colors.border}
                  />
                )}
              </View>
              <Text style={[styles.circlesNote, { color: colors.textTertiary }]}>
                Öffentlich & dauerhaft. Du kannst es jederzeit wieder ausschalten.
              </Text>
            </View>
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

        {/* Logout Button */}
        <Pressable
          style={[styles.logoutButton, { borderColor: colors.border }]}
          onPress={() => setShowLogoutDrawer(true)}
        >
          <Text style={[styles.logoutButtonText, { color: colors.error }]}>Abmelden</Text>
        </Pressable>

        <View style={styles.bottomPadding} />
      </KeyboardAwareScrollView>

      <LogoutDrawer
        visible={showLogoutDrawer}
        onClose={() => setShowLogoutDrawer(false)}
        onLogout={handleLogout}
      />

      <BottomDrawer visible={circlesError.visible} onClose={() => setCirclesError({ visible: false })}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28, gap: 10 }}>
          <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 18, color: colors.textPrimary }}>
            Veröffentlichen hat nicht geklappt
          </Text>
          <Text style={{ fontFamily: 'Inter-Regular', fontSize: 14, lineHeight: 20, color: colors.textSecondary }}>
            Das kann verschiedene Gründe haben — probiere bitte Folgendes:
          </Text>
          <View style={{ gap: 8, marginTop: 2 }}>
            <Text style={{ fontFamily: 'Inter-Regular', fontSize: 14, lineHeight: 20, color: colors.textSecondary }}>
              • Dein Konto ist evtl. noch nicht bereit. Warte einen Moment und versuche es erneut.
            </Text>
            <Text style={{ fontFamily: 'Inter-Regular', fontSize: 14, lineHeight: 20, color: colors.textSecondary }}>
              • Du musst zuerst bei Röbel Münzen mitmachen (ein registrierter Circles-Avatar), bevor dein Profil sichtbar werden kann.
            </Text>
            <Text style={{ fontFamily: 'Inter-Regular', fontSize: 14, lineHeight: 20, color: colors.textSecondary }}>
              • Setze einen Namen und ein Profilbild, bevor du veröffentlichst.
            </Text>
            <Text style={{ fontFamily: 'Inter-Regular', fontSize: 14, lineHeight: 20, color: colors.textSecondary }}>
              • Bei einer Netzwerkstörung: in ein paar Minuten erneut versuchen.
            </Text>
          </View>
          {!!circlesError.message && (
            <Text style={{ fontFamily: 'Inter-Regular', fontSize: 12, color: colors.textTertiary, marginTop: 4 }} numberOfLines={3}>
              Details: {circlesError.message}
            </Text>
          )}
          <Pressable
            style={({ pressed }) => ({
              marginTop: 8, height: 50, borderRadius: 14, backgroundColor: colors.primary,
              alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1,
            })}
            onPress={() => { setCirclesError({ visible: false }); router.push('/rewards' as any); }}
            accessibilityRole="button"
          >
            <Text style={{ fontFamily: 'Inter-SemiBold', fontSize: 15, color: colors.onPrimary }}>Zu Röbel Münzen</Text>
          </Pressable>
          <Pressable
            style={{ height: 44, alignItems: 'center', justifyContent: 'center' }}
            onPress={() => setCirclesError({ visible: false })}
            accessibilityRole="button"
          >
            <Text style={{ fontFamily: 'Inter-Medium', fontSize: 14, color: colors.textSecondary }}>Verstanden</Text>
          </Pressable>
        </View>
      </BottomDrawer>
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
    fontFamily: 'MonaSansSemiCondensed-Medium',
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
    paddingBottom: 16,
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
  statusBadge: {
    marginTop: 10,
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
  circlesCard: {
    borderRadius: 12,
    padding: 16,
  },
  circlesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  circlesTextWrap: {
    flex: 1,
  },
  circlesTitle: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  circlesDesc: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  circlesNote: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 12,
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
    fontFamily: 'MonaSansSemiCondensed-Bold',
    color: '#ffffff',
  },
  logoutButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
  },
  logoutButtonText: {
    fontSize: 15,
    fontFamily: 'MonaSansSemiCondensed-Bold',
  },
  bottomPadding: {
    height: 40,
  },
});
