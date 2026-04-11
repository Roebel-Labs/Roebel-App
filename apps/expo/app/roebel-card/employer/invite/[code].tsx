// Röbel Card — Invite success screen for a freshly-added employee.
// Shows the invite code + shareable link + copy / share / done buttons.

import React from 'react';
import { View, Text, Pressable, StyleSheet, Alert, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/context/ThemeContext';

export default function EmployeeInviteScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { code } = useLocalSearchParams<{ code: string }>();
  const inviteCode = typeof code === 'string' ? code : '';
  const inviteLink = `https://roebel.app/employee/invite/${inviteCode}`;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(inviteLink);
    Alert.alert('Kopiert', 'Der Einladungslink wurde in die Zwischenablage kopiert.');
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Deine Röbel Card Einladung: ${inviteLink}`,
        url: inviteLink,
      });
    } catch (err) {
      console.error('Share failed:', err);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primary }]}>
          <Text style={styles.iconText}>✓</Text>
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Einladung erstellt</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Teile diesen Link mit deinem Mitarbeiter, damit er die Röbel Card aktivieren kann:
        </Text>

        <View style={[styles.codeBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.codeText, { color: colors.textPrimary }]}>{inviteCode}</Text>
        </View>

        <Text
          style={[styles.linkText, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {inviteLink}
        </Text>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={handleShare}
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>Teilen</Text>
        </Pressable>
        <Pressable
          onPress={handleCopy}
          style={[styles.secondaryButton, { borderColor: colors.border }]}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>
            Link kopieren
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.replace('/roebel-card/employer' as any)}
          style={styles.tertiaryButton}
        >
          <Text style={[styles.tertiaryButtonText, { color: colors.textSecondary }]}>Fertig</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  iconText: {
    fontSize: 40,
    color: '#ffffff',
    fontFamily: 'Inter-Bold',
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 22,
  },
  codeBox: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
    marginTop: 8,
  },
  codeText: {
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    letterSpacing: 2,
  },
  linkText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 8,
  },
  primaryButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  secondaryButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  tertiaryButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  tertiaryButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
