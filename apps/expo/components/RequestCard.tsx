/**
 * Request Card Component
 *
 * Displays a verification request in a list
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { readContract } from 'thirdweb';
import { RequestStatus } from '@/lib/verification-types';
import { useTheme } from '@/context/ThemeContext';
import { citizenNFTContract, attesterNFTContract } from '@/constants/verification-contracts';

interface RequestCardProps {
  requestId: number;
  nftType: 'citizen' | 'attester';
  targetAddress: string;
  status: string;
  attesterSignatures: number;
  citizenSignatures: number;
  createdAt: string;
  reason?: string;
}

export default function RequestCard({
  requestId,
  nftType,
  targetAddress,
  status,
  attesterSignatures,
  citizenSignatures,
  createdAt,
  reason,
}: RequestCardProps) {
  const router = useRouter();
  const { colors } = useTheme();

  // v2: read the per-request required approval thresholds (percentage bands) so
  // the card shows the real X/Y instead of a hardcoded 1/1 (citizen) or 2 (attester).
  const [required, setRequired] = useState({
    attesters: nftType === 'citizen' ? 2 : 3,
    citizens: 1,
  });
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (nftType === 'citizen') {
          const [a, c] = await Promise.all([
            readContract({ contract: citizenNFTContract, method: 'function requiredAttesterApprovalsFor(uint256) view returns (uint256)', params: [BigInt(requestId)] }),
            readContract({ contract: citizenNFTContract, method: 'function requiredCitizenApprovalsFor(uint256) view returns (uint256)', params: [BigInt(requestId)] }),
          ]);
          if (active) setRequired({ attesters: Number(a), citizens: Number(c) });
        } else {
          const a = await readContract({ contract: attesterNFTContract, method: 'function requiredApprovalsFor(uint256) view returns (uint256)', params: [BigInt(requestId)] });
          if (active) setRequired((r) => ({ ...r, attesters: Number(a) }));
        }
      } catch {
        // keep sensible defaults on read failure
      }
    })();
    return () => { active = false; };
  }, [requestId, nftType]);

  const shortenAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'pending':
        return <View style={[styles.badge, styles.pendingBadge]}><Text style={[styles.badgeText, { color: colors.textPrimary }]}>Ausstehend</Text></View>;
      case 'approved':
        return <View style={[styles.badge, styles.approvedBadge]}><Text style={[styles.badgeText, { color: colors.textPrimary }]}>Genehmigt</Text></View>;
      case 'rejected':
        return <View style={[styles.badge, styles.rejectedBadge]}><Text style={[styles.badgeText, { color: colors.textPrimary }]}>Abgelehnt</Text></View>;
      case 'executed':
        return <View style={[styles.badge, styles.executedBadge]}><Text style={[styles.badgeText, { color: colors.textPrimary }]}>Ausgeführt</Text></View>;
      default:
        return null;
    }
  };

  const getProgress = () => {
    if (nftType === 'citizen') {
      return `${attesterSignatures}/${required.attesters} Bescheiniger, ${citizenSignatures}/${required.citizens} Bürger`;
    } else {
      return `${attesterSignatures}/${required.attesters} Bescheiniger`;
    }
  };

  const handlePress = () => {
    router.push(`/verification/request/${requestId}?type=${nftType}` as any);
  };

  return (
    <Pressable style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]} onPress={handlePress}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.requestId, { color: colors.textPrimary }]}>#{requestId}</Text>
          <Text style={[styles.nftType, { color: colors.textSecondary, backgroundColor: colors.surfaceSecondary }]}>{nftType === 'citizen' ? 'Bürger' : 'Bescheiniger'}</Text>
        </View>
        {getStatusBadge()}
      </View>

      <View style={styles.content}>
        <Text style={[styles.address, { color: colors.textPrimary }]}>{shortenAddress(targetAddress)}</Text>
        {reason && <Text style={[styles.reason, { color: colors.textSecondary }]} numberOfLines={2}>{reason}</Text>}
      </View>

      {status === 'pending' && (
        <View style={[styles.progress, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.progressText, { color: colors.primary }]}>{getProgress()}</Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={[styles.date, { color: colors.textTertiary }]}>
          {new Date(createdAt).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </Text>
        <Text style={[styles.arrow, { color: colors.textSecondary }]}>→</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  requestId: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  nftType: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pendingBadge: {
    backgroundColor: '#FFF3E0',
  },
  approvedBadge: {
    backgroundColor: '#E8F5E9',
  },
  rejectedBadge: {
    backgroundColor: '#FFEBEE',
  },
  executedBadge: {
    backgroundColor: '#E3F2FD',
  },
  badgeText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
  content: {
    marginBottom: 12,
  },
  address: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    marginBottom: 4,
  },
  reason: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
  },
  progress: {
    borderRadius: 6,
    padding: 8,
    marginBottom: 12,
  },
  progressText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  arrow: {
    fontSize: 18,
  },
});
