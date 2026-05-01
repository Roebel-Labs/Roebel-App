import React from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { getBaseScanTxUrl, getBaseScanAddressUrl } from '@/lib/blockscout';

type Props = {
  transactionHash?: string | null;
  governorAddress: string;
};

export default function ProposalOnchainLinks({ transactionHash, governorAddress }: Props) {
  const { colors } = useTheme();

  const openTx = () => {
    if (transactionHash) Linking.openURL(getBaseScanTxUrl(transactionHash));
  };

  const openContract = () => {
    Linking.openURL(getBaseScanAddressUrl(governorAddress));
  };

  return (
    <View style={styles.row}>
      {transactionHash ? (
        <Pressable
          onPress={openTx}
          style={[styles.pill, { borderColor: colors.border }]}
          accessibilityRole="link"
          accessibilityLabel="Transaktion auf BaseScan öffnen"
        >
          <Ionicons name="link-outline" size={14} color={colors.textPrimary} />
          <Text style={[styles.pillText, { color: colors.textPrimary }]}>Transaktion</Text>
          <Ionicons name="open-outline" size={13} color={colors.textTertiary} />
        </Pressable>
      ) : null}

      <Pressable
        onPress={openContract}
        style={[styles.pill, { borderColor: colors.border }]}
        accessibilityRole="link"
        accessibilityLabel="Governor-Vertrag auf BaseScan öffnen"
      >
        <Ionicons name="document-text-outline" size={14} color={colors.textPrimary} />
        <Text style={[styles.pillText, { color: colors.textPrimary }]}>Governor-Vertrag</Text>
        <Ionicons name="open-outline" size={13} color={colors.textTertiary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    marginTop: 12,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
});
