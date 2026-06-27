// PRESERVED FOR LATER — This thirdweb wallet screen was unlinked from the
// profile UI on 2026-04-11 as part of the Röbel Card (voucher) redesign.
// The file is kept on disk (still auto-registered by expo-router) so a
// future session can restore the wallet experience without rewriting.
// Do not delete. See docs/superpowers/plans/2026-04-11-roebel-card-foundations.md
// (and /Users/maxbrych/.claude/plans/parsed-humming-goblet.md) for context.

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';

import { useActiveAccount, useWalletBalance, useReadContract } from 'thirdweb/react';
import { prepareTransaction, sendTransaction, toWei } from 'thirdweb';
import { transfer } from 'thirdweb/extensions/erc20';
import { balanceOf } from 'thirdweb/extensions/erc721';
import { client, chain, usdcContract, citizenNFTContract, attesterNFTContract } from '@/constants/thirdweb';

import { useTheme } from '@/context/ThemeContext';
import { useSnackbar } from '@/context/SnackbarContext';
import BottomDrawer from '@/components/BottomDrawer';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TokenRow({
  name,
  symbol,
  balance,
  isLoading,
  colors,
}: {
  name: string;
  symbol: string;
  balance: string;
  isLoading: boolean;
  colors: any;
}) {
  return (
    <View style={[styles.tokenRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.tokenIcon, { backgroundColor: colors.primaryLight }]}>
        <Text style={[styles.tokenIconText, { color: colors.primary }]}>
          {symbol.charAt(0)}
        </Text>
      </View>
      <View style={styles.tokenInfo}>
        <Text style={[styles.tokenName, { color: colors.textPrimary }]}>{name}</Text>
        <Text style={[styles.tokenSymbol, { color: colors.textSecondary }]}>{symbol}</Text>
      </View>
      <View style={styles.tokenBalance}>
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.textSecondary} />
        ) : (
          <Text style={[styles.tokenBalanceText, { color: colors.textPrimary }]}>
            {parseFloat(balance).toFixed(balance.includes('.') ? Math.min(balance.split('.')[1]?.length || 2, 6) : 2)} {symbol}
          </Text>
        )}
      </View>
    </View>
  );
}

function CollectibleRow({
  name,
  count,
  colors,
}: {
  name: string;
  count: number;
  colors: any;
}) {
  const owned = count > 0;
  return (
    <View style={[styles.tokenRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.tokenIcon, { backgroundColor: owned ? colors.successBackground || '#dcfce7' : colors.surface }]}>
        <Text style={[styles.tokenIconText, { color: owned ? colors.success : colors.textSecondary }]}>
          {owned ? '✓' : '–'}
        </Text>
      </View>
      <View style={styles.tokenInfo}>
        <Text style={[styles.tokenName, { color: colors.textPrimary }]}>{name}</Text>
        <Text style={[styles.tokenSymbol, { color: colors.textSecondary }]}>
          {owned ? `${count} im Besitz` : 'Nicht vorhanden'}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function WalletScreenContent() {
  const router = useRouter();
  const account = useActiveAccount();
  const { colors } = useTheme();
  const { showSnackbar } = useSnackbar();

  const [activeTab, setActiveTab] = useState<'tokens' | 'collectibles'>('tokens');
  const [sendVisible, setSendVisible] = useState(false);
  const [receiveVisible, setReceiveVisible] = useState(false);

  // Send form state
  const [sendToken, setSendToken] = useState<'ETH' | 'USDC'>('ETH');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [isSending, setIsSending] = useState(false);

  // --- Data hooks ---

  const { data: ethBalance, isLoading: ethLoading } = useWalletBalance({
    client,
    chain,
    address: account?.address,
  });

  const { data: usdcBalance, isLoading: usdcLoading } = useWalletBalance({
    client,
    chain,
    address: account?.address,
    tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  });

  const { data: citizenBalance } = useReadContract(balanceOf, {
    contract: citizenNFTContract,
    owner: account?.address!,
    queryOptions: { enabled: !!account?.address },
  });

  const { data: attesterBalance } = useReadContract(balanceOf, {
    contract: attesterNFTContract,
    owner: account?.address!,
    queryOptions: { enabled: !!account?.address },
  });

  // --- Handlers ---

  const handleCopyAddress = async () => {
    if (!account?.address) return;
    await Clipboard.setStringAsync(account.address);
    showSnackbar({ message: 'Adresse kopiert' });
  };

  const handleSend = async () => {
    if (!account) return;
    if (!recipientAddress.startsWith('0x') || recipientAddress.length !== 42) {
      Alert.alert('Fehler', 'Bitte gib eine gültige Adresse ein (0x...)');
      return;
    }
    const amount = parseFloat(sendAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Fehler', 'Bitte gib einen gültigen Betrag ein');
      return;
    }

    setIsSending(true);
    try {
      if (sendToken === 'ETH') {
        const transaction = prepareTransaction({
          to: recipientAddress as `0x${string}`,
          value: toWei(sendAmount),
          chain,
          client,
        });
        await sendTransaction({ transaction, account });
      } else {
        const transaction = transfer({
          contract: usdcContract,
          to: recipientAddress as `0x${string}`,
          amount: sendAmount,
        });
        await sendTransaction({ transaction, account });
      }
      showSnackbar({ message: 'Transaktion gesendet' });
      setSendVisible(false);
      setRecipientAddress('');
      setSendAmount('');
    } catch (error: any) {
      Alert.alert('Fehler beim Senden', error?.message || 'Unbekannter Fehler');
    } finally {
      setIsSending(false);
    }
  };

  if (!account) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Bitte melde dich an, um dein Wallet zu sehen.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Wallet</Text>
        <Pressable onPress={handleCopyAddress} style={styles.addressButton}>
          <Text style={[styles.addressText, { color: colors.textSecondary }]}>
            {shortenAddress(account.address)}
          </Text>
        </Pressable>
      </View>

      <ScrollView style={styles.flex1} showsVerticalScrollIndicator={false}>
        {/* Balance Section */}
        <View style={styles.balanceSection}>
          <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>Guthaben</Text>
          {ethLoading && usdcLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={styles.balanceLoader} />
          ) : (
            <View style={styles.balanceValues}>
              <Text style={[styles.balanceLarge, { color: colors.textPrimary }]}>
                {ethBalance ? parseFloat(ethBalance.displayValue).toFixed(6) : '0'} ETH
              </Text>
              <Text style={[styles.balanceSecondary, { color: colors.textSecondary }]}>
                {usdcBalance ? parseFloat(usdcBalance.displayValue).toFixed(2) : '0.00'} USDC
              </Text>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <Pressable style={styles.actionButton} onPress={() => setSendVisible(true)}>
            <View style={[styles.actionCircle, { backgroundColor: colors.primary }]}>
              <Text style={styles.actionIcon}>↑</Text>
            </View>
            <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>Senden</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={() => setReceiveVisible(true)}>
            <View style={[styles.actionCircle, { backgroundColor: colors.primary }]}>
              <Text style={styles.actionIcon}>↓</Text>
            </View>
            <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>Empfangen</Text>
          </Pressable>
        </View>

        {/* Tab Bar */}
        <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
          <Pressable
            style={[styles.tab, activeTab === 'tokens' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab('tokens')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'tokens' ? colors.textPrimary : colors.textSecondary }]}>
              Token
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'collectibles' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab('collectibles')}
          >
            <Text style={[styles.tabText, { color: activeTab === 'collectibles' ? colors.textPrimary : colors.textSecondary }]}>
              Sammlerstücke
            </Text>
          </Pressable>
        </View>

        {/* Token List */}
        {activeTab === 'tokens' && (
          <View style={styles.listContainer}>
            <TokenRow
              name="Ethereum"
              symbol="ETH"
              balance={ethBalance?.displayValue ?? '0'}
              isLoading={ethLoading}
              colors={colors}
            />
            <TokenRow
              name="USD Coin"
              symbol="USDC"
              balance={usdcBalance?.displayValue ?? '0'}
              isLoading={usdcLoading}
              colors={colors}
            />
          </View>
        )}

        {/* Collectibles List */}
        {activeTab === 'collectibles' && (
          <View style={styles.listContainer}>
            <CollectibleRow
              name="Bürger NFT"
              count={citizenBalance ? Number(citizenBalance) : 0}
              colors={colors}
            />
            <CollectibleRow
              name="Attester NFT"
              count={attesterBalance ? Number(attesterBalance) : 0}
              colors={colors}
            />
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Send Drawer */}
      <BottomDrawer visible={sendVisible} onClose={() => setSendVisible(false)} snapPoint={0.55}>
        <Text style={[styles.drawerTitle, { color: colors.textPrimary }]}>Senden</Text>

        {/* Token Picker */}
        <View style={styles.tokenPicker}>
          <Pressable
            style={[
              styles.tokenPickerButton,
              { backgroundColor: sendToken === 'ETH' ? colors.primary : colors.surface },
            ]}
            onPress={() => setSendToken('ETH')}
          >
            <Text style={[styles.tokenPickerText, { color: sendToken === 'ETH' ? '#fff' : colors.textPrimary }]}>
              ETH
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.tokenPickerButton,
              { backgroundColor: sendToken === 'USDC' ? colors.primary : colors.surface },
            ]}
            onPress={() => setSendToken('USDC')}
          >
            <Text style={[styles.tokenPickerText, { color: sendToken === 'USDC' ? '#fff' : colors.textPrimary }]}>
              USDC
            </Text>
          </Pressable>
        </View>

        {/* Recipient */}
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
          placeholder="Empfängeradresse (0x...)"
          placeholderTextColor={colors.textSecondary}
          value={recipientAddress}
          onChangeText={setRecipientAddress}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/* Amount */}
        <TextInput
          style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
          placeholder="Betrag"
          placeholderTextColor={colors.textSecondary}
          value={sendAmount}
          onChangeText={setSendAmount}
          keyboardType="decimal-pad"
        />

        {/* Send Button */}
        <Pressable
          style={[styles.sendButton, { backgroundColor: colors.primary, opacity: isSending ? 0.6 : 1 }]}
          onPress={handleSend}
          disabled={isSending}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendButtonText}>Senden</Text>
          )}
        </Pressable>
      </BottomDrawer>

      {/* Receive Drawer */}
      <BottomDrawer visible={receiveVisible} onClose={() => setReceiveVisible(false)} snapPoint={0.35}>
        <Text style={[styles.drawerTitle, { color: colors.textPrimary }]}>Empfangen</Text>
        <Text style={[styles.receiveHint, { color: colors.textSecondary }]}>
          Teile deine Adresse, um Token auf Base zu empfangen.
        </Text>

        <View style={[styles.addressBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.fullAddress, { color: colors.textPrimary }]} selectable>
            {account.address}
          </Text>
        </View>

        <Pressable
          style={[styles.copyButton, { backgroundColor: colors.primary }]}
          onPress={handleCopyAddress}
        >
          <Text style={styles.copyButtonText}>Adresse kopieren</Text>
        </Pressable>
      </BottomDrawer>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex1: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },

  // Header
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
    fontFamily: 'MonaSansSemiCondensed-SemiBold',
  },
  addressButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  addressText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },

  // Balance
  balanceSection: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  balanceLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    marginBottom: 8,
  },
  balanceLoader: {
    marginTop: 16,
  },
  balanceValues: {
    alignItems: 'center',
  },
  balanceLarge: {
    fontSize: 32,
    fontFamily: 'Inter-SemiBold',
  },
  balanceSecondary: {
    fontSize: 18,
    fontFamily: 'Inter-Regular',
    marginTop: 4,
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 24,
  },
  actionButton: {
    alignItems: 'center',
  },
  actionCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionIcon: {
    color: '#fff',
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
  },
  actionLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginTop: 8,
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    marginHorizontal: 16,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },

  // Token / Collectible rows
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tokenIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tokenIconText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  tokenInfo: {
    flex: 1,
    marginLeft: 12,
  },
  tokenName: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  tokenSymbol: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  tokenBalance: {
    alignItems: 'flex-end',
  },
  tokenBalanceText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },

  // Drawers
  drawerTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 16,
  },

  // Send drawer
  tokenPicker: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  tokenPickerButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  tokenPickerText: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    marginBottom: 12,
  },
  sendButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },

  // Receive drawer
  receiveHint: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    marginBottom: 16,
  },
  addressBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  fullAddress: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 22,
  },
  copyButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },

  bottomSpacer: {
    height: 40,
  },
});
