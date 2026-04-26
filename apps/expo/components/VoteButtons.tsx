import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useActiveAccount } from 'thirdweb/react';
import { prepareContractCall, sendTransaction } from 'thirdweb';
import { governorContract } from '@/constants/thirdweb';
import { VoteType, ProposalState } from '@/lib/governance-types';
import { isProposalActive } from '@/lib/governance-utils';
import ErrorDrawer from './ErrorDrawer';
import SuccessDrawer from './SuccessDrawer';
import { useTheme } from '@/context/ThemeContext';
import { Events, track } from '@/lib/analytics';

interface VoteButtonsProps {
  proposalId: bigint;
  proposalState: ProposalState;
  hasVoted: boolean;
  isCitizen: boolean;
  onVoteSuccess: () => void;
}

export default function VoteButtons({
  proposalId,
  proposalState,
  hasVoted,
  isCitizen,
  onVoteSuccess,
}: VoteButtonsProps) {
  const account = useActiveAccount();
  const { colors } = useTheme();
  const [voting, setVoting] = useState(false);
  const [votingFor, setVotingFor] = useState<VoteType | null>(null);
  const [errorDrawer, setErrorDrawer] = useState({ visible: false, message: '' });
  const [successDrawer, setSuccessDrawer] = useState({ visible: false, message: '', action: null as (() => void) | null });

  const canVote = account && isCitizen && isProposalActive(proposalState) && !hasVoted;

  const handleVote = async (support: VoteType) => {
    if (!account) {
      setErrorDrawer({
        visible: true,
        message: 'Please connect your wallet to vote'
      });
      return;
    }

    if (!isCitizen) {
      setErrorDrawer({
        visible: true,
        message: 'You must own a Citizen NFT to vote'
      });
      return;
    }

    if (!canVote) {
      setErrorDrawer({
        visible: true,
        message: 'Voting is not available for this proposal'
      });
      return;
    }

    try {
      setVoting(true);
      setVotingFor(support);

      // Prepare the vote transaction using thirdweb's prepareContractCall
      const transaction = prepareContractCall({
        contract: governorContract,
        method: 'function castVote(uint256 proposalId, uint8 support) returns (uint256)',
        params: [proposalId, support],
      });

      // Send transaction (gasless via smart account)
      const receipt = await sendTransaction({
        transaction,
        account,
      });

      track(Events.PROPOSAL_VOTED, {
        proposal_id: proposalId.toString(),
        vote_type: VoteType[support] ?? String(support),
        tx_hash: receipt.transactionHash,
      });

      setSuccessDrawer({
        visible: true,
        message: 'Your vote has been recorded!',
        action: () => onVoteSuccess()
      });
    } catch (error) {
      console.error('Error voting:', error);
      setErrorDrawer({
        visible: true,
        message: error instanceof Error ? error.message : 'Failed to submit vote. Please try again.'
      });
    } finally {
      setVoting(false);
      setVotingFor(null);
    }
  };

  if (!account) {
    return (
      <View style={styles.container}>
        <View style={[styles.messageContainer, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.messageText, { color: colors.textSecondary }]}>Connect your wallet to vote</Text>
        </View>
      </View>
    );
  }

  if (!isCitizen) {
    return (
      <View style={styles.container}>
        <View style={[styles.messageContainer, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.messageText, { color: colors.textSecondary }]}>Bürger-Pass erforderlich, um abzustimmen</Text>
        </View>
      </View>
    );
  }

  if (!isProposalActive(proposalState)) {
    return (
      <View style={styles.container}>
        <View style={[styles.messageContainer, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.messageText, { color: colors.textSecondary }]}>Die Abstimmung für diesen Vorschlag ist geschlossen</Text>
        </View>
      </View>
    );
  }

  if (hasVoted) {
    return (
      <View style={styles.container}>
        <View style={[styles.messageContainer, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.messageText, { color: colors.textSecondary }]}>Sie haben bereits über diesen Vorschlag abgestimmt</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Abstimmen</Text>

      <View style={styles.buttonsContainer}>
        <Pressable
          style={[
            styles.voteButton,
            styles.voteButtonFor,
            voting && styles.voteButtonDisabled,
          ]}
          onPress={() => handleVote(VoteType.For)}
          disabled={voting}
        >
          {voting && votingFor === VoteType.For ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.voteButtonText}>Dafür</Text>
          )}
        </Pressable>

        <Pressable
          style={[
            styles.voteButton,
            styles.voteButtonAgainst,
            voting && styles.voteButtonDisabled,
          ]}
          onPress={() => handleVote(VoteType.Against)}
          disabled={voting}
        >
          {voting && votingFor === VoteType.Against ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.voteButtonText}>Dagegen</Text>
          )}
        </Pressable>

        <Pressable
          style={[
            styles.voteButton,
            { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.disabled },
            voting && styles.voteButtonDisabled,
          ]}
          onPress={() => handleVote(VoteType.Abstain)}
          disabled={voting}
        >
          {voting && votingFor === VoteType.Abstain ? (
            <ActivityIndicator color={colors.textSecondary} />
          ) : (
            <Text style={[styles.voteButtonText, { color: colors.textPrimary }]}>Enthalten</Text>
          )}
        </Pressable>
      </View>

      {/* Error Drawer */}
      <ErrorDrawer
        visible={errorDrawer.visible}
        message={errorDrawer.message}
        onDismiss={() => setErrorDrawer({ visible: false, message: '' })}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    marginBottom: 16,
  },
  buttonsContainer: {
    gap: 12,
  },
  voteButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  voteButtonFor: {
    backgroundColor: '#10b981',
  },
  voteButtonAgainst: {
    backgroundColor: '#ef4444',
  },
  voteButtonDisabled: {
    opacity: 0.5,
  },
  voteButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
  messageContainer: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  messageText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
  },
});
