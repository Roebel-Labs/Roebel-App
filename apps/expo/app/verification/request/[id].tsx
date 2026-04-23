/**
 * Request Details Screen
 *
 * View and approve/reject verification requests
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useActiveAccount } from 'thirdweb/react';
import { useVerificationContext } from '@/context/VerificationContext';
import { useRequestDetails, useApproveRequest, useRejectRequest } from '@/hooks/useVerification';
import { useTheme } from '@/context/ThemeContext';
import RoleSelector from '@/components/RoleSelector';
import { RequestStatus } from '@/lib/verification-types';
import ConfirmationDrawer from '@/components/ConfirmationDrawer';
import ErrorDrawer from '@/components/ErrorDrawer';
import SuccessDrawer from '@/components/SuccessDrawer';

export default function RequestDetailsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams();
  const account = useActiveAccount();
  const { hasCitizenNFT, hasAttesterNFT, hasAnyNFT } = useVerificationContext();

  const requestId = parseInt(params.id as string, 10);
  const nftType = (params.type as 'citizen' | 'attester') || 'citizen';

  const { request, evidence, decryptedData, isLoading, fetchRequest } = useRequestDetails(requestId, nftType);
  const { approveRequest, isLoading: isApproving } = useApproveRequest();
  const { rejectRequest, isLoading: isRejecting } = useRejectRequest();

  const [selectedRole, setSelectedRole] = useState<'attester' | 'citizen'>('citizen');
  const [refreshing, setRefreshing] = useState(false);

  // Drawer states
  const [errorDrawer, setErrorDrawer] = useState({ visible: false, message: '' });
  const [confirmApprovalDrawer, setConfirmApprovalDrawer] = useState(false);
  const [confirmRejectDrawer, setConfirmRejectDrawer] = useState(false);
  const [successDrawer, setSuccessDrawer] = useState({ visible: false, message: '', action: null as (() => void) | null });

  const isOwner = account?.address?.toLowerCase() === request?.requester.toLowerCase();
  const isDualHolder = hasCitizenNFT && hasAttesterNFT;

  useEffect(() => {
    fetchRequest();
  }, [requestId, nftType]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchRequest();
    setRefreshing(false);
  };

  const handleApprove = async () => {
    if (!hasAnyNFT) {
      setErrorDrawer({
        visible: true,
        message: 'Sie benötigen ein Bürger- oder Bescheiniger-NFT, um Anträge zu genehmigen.'
      });
      return;
    }

    setConfirmApprovalDrawer(true);
  };

  const executeApproval = async () => {
    setConfirmApprovalDrawer(false);
    const signAsAttester = isDualHolder ? selectedRole === 'attester' : hasAttesterNFT;

    try {
      await approveRequest(requestId, signAsAttester, nftType);
      setSuccessDrawer({
        visible: true,
        message: 'Sie haben den Antrag erfolgreich genehmigt.',
        action: () => {
          fetchRequest();
          router.back();
        }
      });
    } catch (error) {
      console.error('Failed to approve:', error);
      setErrorDrawer({
        visible: true,
        message: error instanceof Error ? error.message : 'Die Genehmigung ist fehlgeschlagen.'
      });
    }
  };

  const handleReject = async () => {
    if (!hasAnyNFT) {
      setErrorDrawer({
        visible: true,
        message: 'Sie benötigen ein Bürger- oder Bescheiniger-NFT, um Anträge abzulehnen.'
      });
      return;
    }

    setConfirmRejectDrawer(true);
  };

  const executeRejection = async () => {
    setConfirmRejectDrawer(false);

    try {
      await rejectRequest(requestId, nftType);
      setSuccessDrawer({
        visible: true,
        message: 'Sie haben den Antrag abgelehnt.',
        action: () => router.back()
      });
    } catch (error) {
      console.error('Failed to reject:', error);
      setErrorDrawer({
        visible: true,
        message: error instanceof Error ? error.message : 'Die Ablehnung ist fehlgeschlagen.'
      });
    }
  };

  const getStatusBadge = () => {
    if (!request) return null;

    switch (request.status) {
      case RequestStatus.Pending:
        return <View style={[styles.statusBadge, styles.pendingBadge]}><Text style={[styles.statusText, { color: colors.textPrimary }]}>Ausstehend</Text></View>;
      case RequestStatus.Approved:
        return <View style={[styles.statusBadge, { backgroundColor: colors.successBackground }]}><Text style={[styles.statusText, { color: colors.textPrimary }]}>Genehmigt</Text></View>;
      case RequestStatus.Rejected:
        return <View style={[styles.statusBadge, styles.rejectedBadge]}><Text style={[styles.statusText, { color: colors.textPrimary }]}>Abgelehnt</Text></View>;
      case RequestStatus.Executed:
        return <View style={[styles.statusBadge, { backgroundColor: colors.primaryLight }]}><Text style={[styles.statusText, { color: colors.textPrimary }]}>Ausgeführt</Text></View>;
      default:
        return null;
    }
  };

  const shortenAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Lade Antrag...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!request) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.messageContainer}>
          <Text style={[styles.messageTitle, { color: colors.textPrimary }]}>&#x274C; Antrag nicht gefunden</Text>
          <Text style={[styles.messageText, { color: colors.textSecondary }]}>Der angeforderte Antrag existiert nicht.</Text>
          <Pressable style={[styles.button, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
            <Text style={[styles.buttonText, { color: colors.onPrimary }]}>Zurück</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isPending = request.status === RequestStatus.Pending;
  const canApprove = hasAnyNFT && !isOwner && isPending;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.backButton, { color: colors.primary }]}>&#x2190; Zurück</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Antrag #{requestId}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Status */}
        <View style={[styles.statusContainer, { borderBottomColor: colors.border }]}>
          {getStatusBadge()}
          <Text style={[styles.nftTypeText, { color: colors.textSecondary }]}>
            {nftType === 'citizen' ? 'Bürger-Pass' : 'Bescheiniger-Pass'}
          </Text>
        </View>

        {/* Target Address */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Antragsteller</Text>
          <View style={[styles.addressCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.addressText, { color: colors.textPrimary }]}>{shortenAddress(request.target)}</Text>
            {isOwner && <Text style={[styles.youBadge, { color: colors.primary, backgroundColor: colors.primaryLight }]}>Sie</Text>}
          </View>
        </View>

        {/* Signature Progress */}
        {isPending && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Unterschriften-Fortschritt</Text>
            <View style={[styles.progressCard, { backgroundColor: colors.surface }]}>
              <View style={styles.progressItem}>
                <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>Bescheiniger</Text>
                <Text style={[styles.progressValue, { color: colors.primary }]}>
                  {request.attesterSignatures} / {nftType === 'citizen' ? '1' : '2'}
                </Text>
              </View>
              {nftType === 'citizen' && (
                <View style={styles.progressItem}>
                  <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>Bürger</Text>
                  <Text style={[styles.progressValue, { color: colors.primary }]}>
                    {request.citizenSignatures} / 1
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Personal Data (Owner View) */}
        {isOwner && decryptedData && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Ihre Daten (verschlüsselt)</Text>
            <View style={[styles.dataCard, { backgroundColor: colors.successBackground, borderColor: colors.success }]}>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Name:</Text>
                <Text style={styles.dataValue}>{decryptedData.name}</Text>
              </View>
              <View style={styles.dataRow}>
                <Text style={styles.dataLabel}>Adresse:</Text>
                <Text style={styles.dataValue}>{decryptedData.address}</Text>
              </View>
            </View>
            <Text style={styles.dataHint}>
              &#x1F512; Diese Daten sind verschlüsselt. Nur Sie können sie sehen.
            </Text>
          </View>
        )}

        {/* Public Metadata */}
        {evidence?.metadata && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Grund (öffentlich)</Text>
            <View style={[styles.metadataCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.metadataText, { color: colors.textPrimary }]}>{evidence.metadata.reason}</Text>
            </View>
          </View>
        )}

        {/* Role Selector (for dual NFT holders) */}
        {canApprove && isDualHolder && (
          <View style={styles.section}>
            <RoleSelector
              selectedRole={selectedRole}
              onSelectRole={setSelectedRole}
              disabled={isApproving || isRejecting}
            />
          </View>
        )}

        {/* Action Buttons */}
        {canApprove && (
          <View style={styles.actionSection}>
            <Pressable
              style={[styles.approveButton, { backgroundColor: colors.success }, (isApproving || isRejecting) && styles.buttonDisabled]}
              onPress={handleApprove}
              disabled={isApproving || isRejecting}
            >
              {isApproving ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={[styles.approveButtonText, { color: colors.onPrimary }]}>&#x2713; Antrag genehmigen</Text>
              )}
            </Pressable>

            <Pressable
              style={[styles.rejectButton, { backgroundColor: colors.background, borderColor: colors.error }, (isApproving || isRejecting) && styles.buttonDisabled]}
              onPress={handleReject}
              disabled={isApproving || isRejecting}
            >
              {isRejecting ? (
                <ActivityIndicator color={colors.error} />
              ) : (
                <Text style={[styles.rejectButtonText, { color: colors.error }]}>&#x2715; Antrag ablehnen</Text>
              )}
            </Pressable>
          </View>
        )}

        {/* Info for non-approvers */}
        {!canApprove && !isOwner && (
          <View style={[styles.infoBox, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
            <Text style={styles.infoText}>
              {!hasAnyNFT
                ? 'Sie benötigen ein Bürger- oder Bescheiniger-Pass, um Anträge zu genehmigen.'
                : 'Dieser Antrag wurde bereits genehmigt oder abgelehnt.'}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Error Drawer */}
      <ErrorDrawer
        visible={errorDrawer.visible}
        message={errorDrawer.message}
        onDismiss={() => setErrorDrawer({ visible: false, message: '' })}
      />

      {/* Approval Confirmation Drawer */}
      <ConfirmationDrawer
        visible={confirmApprovalDrawer}
        variant="success"
        title="Antrag genehmigen?"
        message={`Möchten Sie diesen Antrag wirklich genehmigen?\n\nSie unterschreiben als: ${
          isDualHolder ? (selectedRole === 'attester' ? 'Bescheiniger' : 'Bürger') : (hasAttesterNFT ? 'Bescheiniger' : 'Bürger')
        }`}
        confirmText="Genehmigen"
        cancelText="Abbrechen"
        onConfirm={executeApproval}
        onCancel={() => setConfirmApprovalDrawer(false)}
        isLoading={isApproving}
      />

      {/* Rejection Confirmation Drawer */}
      <ConfirmationDrawer
        visible={confirmRejectDrawer}
        variant="destructive"
        title="Antrag ablehnen?"
        message="Möchten Sie diesen Antrag wirklich ablehnen?"
        confirmText="Ablehnen"
        cancelText="Abbrechen"
        onConfirm={executeRejection}
        onCancel={() => setConfirmRejectDrawer(false)}
        isLoading={isRejecting}
      />

      {/* Success Drawer */}
      <SuccessDrawer
        visible={successDrawer.visible}
        message={successDrawer.message}
        primaryButtonText="OK"
        onPrimaryAction={() => {
          setSuccessDrawer({ visible: false, message: '', action: null });
          if (successDrawer.action) successDrawer.action();
        }}
        onDismiss={() => {
          setSuccessDrawer({ visible: false, message: '', action: null });
          if (successDrawer.action) successDrawer.action();
        }}
      />
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
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Medium',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginTop: 12,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  pendingBadge: {
    backgroundColor: '#FFFBEB',
  },
  rejectedBadge: {
    backgroundColor: '#FFEBEE',
  },
  statusText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  nftTypeText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    marginBottom: 12,
  },
  addressCard: {
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addressText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  youBadge: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  progressCard: {
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  progressItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  progressValue: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  dataCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dataLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#2E7D32',
  },
  dataValue: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#1B5E20',
    flex: 1,
    textAlign: 'right',
  },
  dataHint: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: '#388E3C',
    marginTop: 8,
  },
  metadataCard: {
    borderRadius: 12,
    padding: 16,
  },
  metadataText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  actionSection: {
    paddingHorizontal: 16,
    marginTop: 32,
    marginBottom: 32,
    gap: 12,
  },
  approveButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  approveButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  rejectButton: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  rejectButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  infoBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 32,
  },
  infoText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#1976D2',
    lineHeight: 20,
    textAlign: 'center',
  },
  messageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  messageTitle: {
    fontSize: 24,
    fontFamily: 'Inter-Medium',
    marginBottom: 12,
  },
  messageText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
});
