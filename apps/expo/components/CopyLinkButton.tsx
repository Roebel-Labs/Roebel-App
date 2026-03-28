/**
 * Copy Link Button Component
 *
 * Button to copy verification request deep link to clipboard
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Snackbar from './Snackbar';
import { useTheme } from '@/context/ThemeContext';

interface CopyLinkButtonProps {
  requestId: number;
  nftType: 'citizen' | 'attester';
}

export default function CopyLinkButton({ requestId, nftType }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);
  const [showSnackbar, setShowSnackbar] = useState(false);
  const { colors } = useTheme();

  const handleCopy = async () => {
    const url = `https://www.roebel.app/verifizierung/nachweis/${requestId}?contract=${nftType}`;

    await Clipboard.setStringAsync(url);
    setCopied(true);
    setShowSnackbar(true);

    // Reset after 2 seconds
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    <>
      <Pressable
        style={[styles.button, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
        onPress={handleCopy}
        android_ripple={{ color: colors.border }}
      >
        <Text style={styles.icon}>{copied ? '✓' : '🔗'}</Text>
        <Text style={[styles.text, { color: colors.textPrimary }]}>{copied ? 'Kopiert!' : 'Link kopieren'}</Text>
      </Pressable>

      <Snackbar
        visible={showSnackbar}
        message="Link in Zwischenablage kopiert"
        onDismiss={() => setShowSnackbar(false)}
        duration={2000}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 10,
    marginTop: 12,
  },
  icon: {
    fontSize: 18,
  },
  text: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
});
