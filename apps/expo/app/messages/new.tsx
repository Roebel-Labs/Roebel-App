import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useTheme } from '@/context/ThemeContext';
import { findOrCreateConversation, sendMessage } from '@/lib/supabase-messages';

import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export default function NewConversationScreen() {
  const router = useRouter();
  const {
    address: prefillAddress,
    listingId,
    listingTitle,
    listingPrice,
    listingPriceType,
    listingImage,
    listingCondition,
  } = useLocalSearchParams<{
    address?: string;
    listingId?: string;
    listingTitle?: string;
    listingPrice?: string;
    listingPriceType?: string;
    listingImage?: string;
    listingCondition?: string;
  }>();
  const { colors } = useTheme();
  const account = useActiveAccount();
  const [address, setAddress] = useState(prefillAddress || '');
  const [isChecking, setIsChecking] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const autoTriggered = useRef(false);

  const handleStartConversation = useCallback(async () => {
    if (!account?.address) return;

    const trimmedAddress = address.trim();
    setErrorMessage('');

    if (!isValidAddress(trimmedAddress)) {
      setErrorMessage('Bitte geben Sie eine gültige Ethereum-Adresse ein (0x...)');
      return;
    }

    if (trimmedAddress.toLowerCase() === account.address.toLowerCase()) {
      setErrorMessage('Sie können keine Nachricht an sich selbst senden');
      return;
    }

    setIsChecking(true);
    try {
      const convo = await findOrCreateConversation(account.address, trimmedAddress);
      if (!convo) {
        setErrorMessage('Unterhaltung konnte nicht erstellt werden. Bitte versuchen Sie es erneut.');
        return;
      }

      // Auto-send listing inquiry if coming from marketplace
      if (listingId && listingTitle) {
        const inquiryPayload = JSON.stringify({
          type: 'listing_inquiry',
          listingId,
          title: listingTitle,
          price: Number(listingPrice) || 0,
          priceType: listingPriceType || 'fixed',
          imageUrl: listingImage || undefined,
          condition: listingCondition || undefined,
        });
        await sendMessage(convo.id, account.address, inquiryPayload);
      }

      router.replace(`/messages/${convo.id}` as any);
    } catch (err) {
      console.error('Failed to start conversation:', err);
      setErrorMessage('Unterhaltung konnte nicht erstellt werden. Bitte versuchen Sie es erneut.');
    } finally {
      setIsChecking(false);
    }
  }, [account?.address, address, router, listingId, listingTitle, listingPrice, listingPriceType, listingImage, listingCondition]);

  // Auto-trigger when prefilled from marketplace "Verkäufer kontaktieren"
  useEffect(() => {
    if (prefillAddress && isValidAddress(prefillAddress) && account?.address && !autoTriggered.current) {
      autoTriggered.current = true;
      handleStartConversation();
    }
  }, [account?.address, prefillAddress, handleStartConversation]);

  const canSubmit = address.trim().length > 0 && !isChecking;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Neue Nachricht</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={[styles.label, { color: colors.textPrimary }]}>Empfänger</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.borderSecondary }]}
          value={address}
          onChangeText={(text) => {
            setAddress(text);
            setErrorMessage('');
          }}
          placeholder="0x... Wallet-Adresse eingeben"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={!prefillAddress}
        />

        {errorMessage ? (
          <Text style={[styles.error, { color: colors.error }]}>{errorMessage}</Text>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary },
            pressed && styles.buttonPressed,
            !canSubmit && { backgroundColor: colors.disabled },
          ]}
          onPress={handleStartConversation}
          disabled={!canSubmit}
        >
          {isChecking ? (
            <View style={styles.buttonContent}>
              <ActivityIndicator size="small" color={colors.onPrimary} />
              <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Wird erstellt...</Text>
            </View>
          ) : (
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Nachricht senden</Text>
          )}
        </Pressable>
      </View>
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
  headerRight: {
    width: 40,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    marginTop: 8,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    borderWidth: 1,
  },
  error: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  button: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
