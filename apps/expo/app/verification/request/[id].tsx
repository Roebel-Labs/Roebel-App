/**
 * Request Sign Screen
 *
 * Dark backdrop with a bottom sheet that lets a Bürger or Bescheiniger
 * approve or reject another user's pending verification request.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useActiveAccount } from 'thirdweb/react';
import { useVerificationContext } from '@/context/VerificationContext';
import { useRequestDetails, useApproveRequest, useRejectRequest } from '@/hooks/useVerification';
import { RequestStatus } from '@/lib/verification-types';
import { useTheme } from '@/context/ThemeContext';
import SignRequestSheet from '@/components/SignRequestSheet';
import ErrorDrawer from '@/components/ErrorDrawer';
import SuccessDrawer from '@/components/SuccessDrawer';
import MeckyNotFound from '@/components/MeckyNotFound';

type Role = 'attester' | 'citizen';

export default function RequestSignScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams();
  const account = useActiveAccount();
  const { hasCitizenNFT, hasAttesterNFT, hasAnyNFT } = useVerificationContext();

  const requestId = parseInt(params.id as string, 10);
  const nftType = (params.type as 'citizen' | 'attester') || 'citizen';

  const { request, isLoading, fetchRequest } = useRequestDetails(requestId, nftType);
  const { approveRequest, isLoading: isApproving } = useApproveRequest();
  const { rejectRequest, isLoading: isRejecting } = useRejectRequest();

  const [selectedRole, setSelectedRole] = useState<Role>(() => (hasAttesterNFT ? 'attester' : 'citizen'));
  const [errorDrawer, setErrorDrawer] = useState({ visible: false, message: '' });
  const [successDrawer, setSuccessDrawer] = useState({
    visible: false,
    message: '',
    action: null as (() => void) | null,
  });

  useEffect(() => {
    fetchRequest();
  }, [requestId, nftType]);

  // Resync default role once NFT flags resolve asynchronously
  useEffect(() => {
    if (hasAttesterNFT && !hasCitizenNFT && selectedRole !== 'attester') {
      setSelectedRole('attester');
    } else if (hasCitizenNFT && !hasAttesterNFT && selectedRole !== 'citizen') {
      setSelectedRole('citizen');
    }
  }, [hasAttesterNFT, hasCitizenNFT]);

  const isOwner = account?.address?.toLowerCase() === request?.requester.toLowerCase();
  const isDualHolder = hasCitizenNFT && hasAttesterNFT;

  const closeScreen = () => router.back();

  const handleApprove = async () => {
    if (!hasAnyNFT) {
      setErrorDrawer({
        visible: true,
        message: 'Sie benötigen ein Bürger- oder Bescheiniger-NFT, um Anträge zu genehmigen.',
      });
      return;
    }

    const signAsAttester = isDualHolder ? selectedRole === 'attester' : hasAttesterNFT;

    try {
      await approveRequest(requestId, signAsAttester, nftType);
      setSuccessDrawer({
        visible: true,
        message: 'Sie haben den Antrag erfolgreich genehmigt.',
        action: closeScreen,
      });
    } catch (error) {
      console.error('Failed to approve:', error);
      setErrorDrawer({
        visible: true,
        message: error instanceof Error ? error.message : 'Die Genehmigung ist fehlgeschlagen.',
      });
    }
  };

  const handleReject = async () => {
    if (!hasAnyNFT) {
      setErrorDrawer({
        visible: true,
        message: 'Sie benötigen ein Bürger- oder Bescheiniger-NFT, um Anträge abzulehnen.',
      });
      return;
    }

    try {
      await rejectRequest(requestId, nftType);
      setSuccessDrawer({
        visible: true,
        message: 'Sie haben den Antrag abgelehnt.',
        action: closeScreen,
      });
    } catch (error) {
      console.error('Failed to reject:', error);
      setErrorDrawer({
        visible: true,
        message: error instanceof Error ? error.message : 'Die Ablehnung ist fehlgeschlagen.',
      });
    }
  };

  const renderFallback = (message: string) => (
    <View style={styles.fallbackCard}>
      <Text style={styles.fallbackText}>{message}</Text>
      <Pressable style={styles.fallbackButton} onPress={closeScreen} accessibilityRole="button">
        <Text style={styles.fallbackButtonText}>Schließen</Text>
      </Pressable>
    </View>
  );

  const renderBody = () => {
    if (isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      );
    }

    if (!request) {
      return (
        <View style={styles.centered}>
          <MeckyNotFound title="Antrag nicht gefunden" />
        </View>
      );
    }

    if (isOwner) {
      return renderFallback('Sie können Ihren eigenen Antrag nicht unterschreiben.');
    }

    if (request.status !== RequestStatus.Pending) {
      return renderFallback('Dieser Antrag wurde bereits genehmigt oder abgelehnt.');
    }

    if (!hasAnyNFT) {
      return renderFallback('Sie benötigen ein Bürger- oder Bescheiniger-Pass, um Anträge zu unterzeichnen.');
    }

    return (
      <SignRequestSheet
        visible
        onClose={closeScreen}
        hasCitizenNFT={hasCitizenNFT}
        hasAttesterNFT={hasAttesterNFT}
        selectedRole={selectedRole}
        onSelectRole={setSelectedRole}
        onApprove={handleApprove}
        onReject={handleReject}
        isApproving={isApproving}
        isRejecting={isRejecting}
      />
    );
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <Pressable
          onPress={closeScreen}
          hitSlop={12}
          style={styles.topClose}
          accessibilityRole="button"
          accessibilityLabel="Schließen"
        >
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </Pressable>
      </SafeAreaView>

      {renderBody()}

      <ErrorDrawer
        visible={errorDrawer.visible}
        message={errorDrawer.message}
        onDismiss={() => setErrorDrawer({ visible: false, message: '' })}
      />

      <SuccessDrawer
        visible={successDrawer.visible}
        message={successDrawer.message}
        primaryButtonText="OK"
        onPrimaryAction={() => {
          const action = successDrawer.action;
          setSuccessDrawer({ visible: false, message: '', action: null });
          if (action) action();
        }}
        onDismiss={() => {
          const action = successDrawer.action;
          setSuccessDrawer({ visible: false, message: '', action: null });
          if (action) action();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  safeArea: {
    paddingHorizontal: 16,
  },
  topClose: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  fallbackCard: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 16,
  },
  fallbackText: {
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    color: '#1F2937',
    textAlign: 'center',
    lineHeight: 21,
  },
  fallbackButton: {
    backgroundColor: '#194383',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  fallbackButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Inter-Medium',
    fontSize: 15,
  },
});
