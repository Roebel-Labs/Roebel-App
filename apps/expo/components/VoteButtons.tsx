import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useActiveAccount } from 'thirdweb/react';
import { prepareContractCall, readContract, sendTransaction } from 'thirdweb';
import {
  governorContract,
  maciContract,
  citizenNFTContract,
  getPollContract,
} from '@/constants/thirdweb';
import { VoteType, ProposalState } from '@/lib/governance-types';
import { isProposalActive, toBigInt, getStateMessage } from '@/lib/governance-utils';
import ErrorDrawer from './ErrorDrawer';
import SuccessDrawer from './SuccessDrawer';
import { useTheme } from '@/context/ThemeContext';
import { useMaci } from '@/context/MaciContext';
import { Events, track } from '@/lib/analytics';
import {
  buildVoteMessage,
  prepareInitialVoiceCreditProxyData,
  prepareSignUpGatekeeperData,
} from '@/lib/maci';

interface VoteButtonsProps {
  proposalId: bigint;
  proposalState: ProposalState;
  hasVoted: boolean;
  isCitizen: boolean;
  onVoteSuccess: () => void;
}

type Phase =
  | 'idle'
  | 'creating-key'
  | 'signing-up'
  | 'encrypting-vote'
  | 'submitting-vote';

/**
 * MACI-aware vote buttons.
 *
 * UX principle: surface every state explicitly.
 *
 *   1. No wallet                  → "Connect to vote"
 *   2. Not a citizen              → "Bürger-Pass erforderlich"
 *   3. Voting closed              → "Abstimmung geschlossen"
 *   4. No MACI keypair yet        → "Schritt 1: privaten Schlüssel erstellen"
 *   5. Keypair OK, not signed up  → "Schritt 2: einmalige Anmeldung bei MACI"
 *   6. Signed up + active         → 3 buttons (Dafür / Dagegen / Enthalten)
 *      (re-voting allowed; we increment a per-poll nonce)
 *
 * Voting happens on the per-proposal Poll contract, NOT the Governor.
 * Governor.proposalPolls(proposalId) tells us where the Poll lives.
 */
export default function VoteButtons({
  proposalId,
  proposalState,
  hasVoted: legacyHasVoted, // unused for MACI but kept for API compat
  isCitizen,
  onVoteSuccess,
}: VoteButtonsProps) {
  const account = useActiveAccount();
  const { colors } = useTheme();
  const {
    serializedKeypair,
    keypairLoading,
    signUpState,
    generateAndStoreKeypair,
    refreshSignUp,
    getKeypair,
  } = useMaci();

  const [phase, setPhase] = useState<Phase>('idle');
  const [votingFor, setVotingFor] = useState<VoteType | null>(null);
  const [pollAddress, setPollAddress] = useState<string | null>(null);
  const [pollId, setPollId] = useState<bigint | null>(null);
  const [voteNonce, setVoteNonce] = useState<bigint>(1n);
  const [errorDrawer, setErrorDrawer] = useState({ visible: false, message: '' });
  const [successDrawer, setSuccessDrawer] = useState({
    visible: false,
    message: '',
    action: null as (() => void) | null,
  });

  // Resolve the per-proposal Poll address from the Governor.
  useEffect(() => {
    if (!proposalId || proposalId === 0n) return;
    let cancelled = false;
    (async () => {
      try {
        const result = (await readContract({
          contract: governorContract,
          method:
            'function proposalPolls(uint256) view returns (uint256 pollId, address poll, address messageProcessor, address tally, uint256 deadline)',
          params: [proposalId],
        })) as readonly [bigint, string, string, string, bigint];
        if (cancelled) return;
        const [pId, pAddr] = result;
        if (pAddr && pAddr !== '0x0000000000000000000000000000000000000000') {
          setPollId(pId);
          setPollAddress(pAddr);
        }
      } catch (err) {
        console.warn('[VoteButtons] proposalPolls lookup failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [proposalId]);

  const isActive = isProposalActive(proposalState);
  const canVote =
    !!account &&
    isCitizen &&
    isActive &&
    !!pollAddress &&
    signUpState.status === 'signed-up';

  // Ensure refreshSignUp is called when prerequisites change.
  useEffect(() => {
    if (!serializedKeypair) return;
    if (signUpState.status === 'unknown') {
      refreshSignUp().catch(() => undefined);
    }
  }, [serializedKeypair, signUpState.status, refreshSignUp]);

  // ----- Step 1: generate keypair locally -----
  const handleGenerateKey = async () => {
    if (phase !== 'idle') return;
    try {
      setPhase('creating-key');
      await generateAndStoreKeypair();
      setSuccessDrawer({
        visible: true,
        message:
          'Privater MACI-Schlüssel erstellt und sicher in deinem Gerät gespeichert. Nächster Schritt: einmalige Anmeldung bei MACI.',
        action: null,
      });
    } catch (err) {
      console.error('[VoteButtons] generate key failed:', err);
      setErrorDrawer({
        visible: true,
        message:
          err instanceof Error
            ? err.message
            : 'Schlüssel konnte nicht erstellt werden.',
      });
    } finally {
      setPhase('idle');
    }
  };

  // ----- Step 2: sign up to MACI -----
  const handleSignUp = async () => {
    if (phase !== 'idle') return;
    if (!account) {
      setErrorDrawer({ visible: true, message: 'Bitte verbinde zuerst dein Wallet.' });
      return;
    }
    if (!serializedKeypair) {
      setErrorDrawer({ visible: true, message: 'Bitte erstelle zuerst einen MACI-Schlüssel.' });
      return;
    }
    try {
      setPhase('signing-up');

      // Look up the citizen's CitizenNFT tokenId. SignUpTokenGatekeeper expects
      // the tokenId so it can verify ownership and mark the token as used.
      const tokenId = (await readContract({
        contract: citizenNFTContract,
        method: 'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
        params: [account.address, 0n],
      })) as bigint;

      const signUpData = prepareSignUpGatekeeperData(tokenId);
      const voiceData = prepareInitialVoiceCreditProxyData();

      const tx = prepareContractCall({
        contract: maciContract,
        method:
          'function signUp(((uint256 x, uint256 y) _pubKey), bytes _signUpGatekeeperData, bytes _initialVoiceCreditProxyData)',
        params: [
          { x: BigInt(serializedKeypair.pubX), y: BigInt(serializedKeypair.pubY) },
          signUpData,
          voiceData,
        ],
      });

      await sendTransaction({ transaction: tx, account });
      await refreshSignUp();
      setSuccessDrawer({
        visible: true,
        message:
          'Du bist bei MACI angemeldet. Du kannst jetzt verschlüsselt abstimmen — und deine Stimme bis zum Ende der Frist beliebig oft ändern.',
        action: null,
      });
    } catch (err) {
      console.error('[VoteButtons] signUp failed:', err);
      setErrorDrawer({
        visible: true,
        message:
          err instanceof Error
            ? err.message
            : 'Anmeldung bei MACI ist fehlgeschlagen.',
      });
    } finally {
      setPhase('idle');
    }
  };

  // ----- Step 3: cast (or change) vote -----
  const handleVote = async (support: VoteType) => {
    if (!canVote || !account || !pollAddress || pollId === null) return;
    if (signUpState.status !== 'signed-up') return;
    const kp = getKeypair();
    if (!kp) return;

    try {
      setVotingFor(support);
      setPhase('encrypting-vote');

      // VoteType.For = 1, VoteType.Against = 0, VoteType.Abstain = 2 — matches
      // MACI option indices on the Poll's vote-option tree. `toBigInt` routes
      // via String to dodge Hermes' refusal of BigInt(<Number>).
      const optionIndex = toBigInt(support);
      const { message, encPubKey } = buildVoteMessage({
        voterKeypair: kp,
        voterStateIndex: signUpState.stateIndex,
        pollId,
        voteOptionIndex: optionIndex,
        voiceCredits: 1n, // 1 NFT = 1 credit, all-in
        nonce: voteNonce,
      });

      setPhase('submitting-vote');
      const poll = getPollContract(pollAddress);
      const tx = prepareContractCall({
        contract: poll,
        method:
          'function publishMessage((uint256[10] data) _message, (uint256 x, uint256 y) _encPubKey)',
        params: [{ data: message }, encPubKey],
      });
      const receipt = await sendTransaction({ transaction: tx, account });

      track(Events.PROPOSAL_VOTED, {
        proposal_id: proposalId.toString(),
        poll_id: pollId.toString(),
        vote_type: VoteType[support] ?? String(support),
        nonce: voteNonce.toString(),
        tx_hash: receipt.transactionHash,
        encrypted: true,
      });

      // Bump the nonce so the next call (re-vote) supersedes this one.
      setVoteNonce((n) => n + 1n);
      setSuccessDrawer({
        visible: true,
        message:
          'Stimme verschlüsselt abgegeben. Sie wird erst nach Ablauf der Frist von einem unabhängigen Koordinator entschlüsselt und auf der Blockchain veröffentlicht. Du kannst deine Stimme bis dahin jederzeit ändern.',
        action: () => onVoteSuccess(),
      });
    } catch (err) {
      console.error('[VoteButtons] vote failed:', err);
      setErrorDrawer({
        visible: true,
        message:
          err instanceof Error
            ? err.message
            : 'Stimme konnte nicht abgegeben werden.',
      });
    } finally {
      setPhase('idle');
      setVotingFor(null);
    }
  };

  // ============== Rendering ==============

  if (!account) {
    return (
      <Container colors={colors}>
        <Text style={[styles.messageText, { color: colors.textSecondary }]}>
          Verbinde dein Wallet, um abzustimmen.
        </Text>
      </Container>
    );
  }

  if (!isCitizen) {
    return (
      <Container colors={colors}>
        <Text style={[styles.messageText, { color: colors.textSecondary }]}>
          Bürger-Pass erforderlich, um abzustimmen.
        </Text>
      </Container>
    );
  }

  // Pending: voting hasn't started yet. With votingDelay=0 this is a brief
  // window between propose() and the next block; show "starts in a moment"
  // rather than the misleading "voting closed".
  if (proposalState === ProposalState.Pending) {
    const msg = getStateMessage(proposalState);
    return (
      <Container colors={colors}>
        <Text style={[styles.title, { color: colors.textPrimary, marginBottom: 4 }]}>
          {msg.label}
        </Text>
        <Text style={[styles.messageText, { color: colors.textSecondary }]}>
          {msg.detail}
        </Text>
      </Container>
    );
  }

  // Anything that isn't Active or Pending → voting closed, with state-specific copy.
  if (!isActive) {
    const msg = getStateMessage(proposalState);
    return (
      <Container colors={colors}>
        <Text style={[styles.title, { color: colors.textPrimary, marginBottom: 4 }]}>
          {msg.label}
        </Text>
        <Text style={[styles.messageText, { color: colors.textSecondary }]}>
          {msg.detail}
        </Text>
      </Container>
    );
  }

  if (!pollAddress) {
    return (
      <Container colors={colors}>
        <ActivityIndicator color={colors.textSecondary} />
        <Text style={[styles.messageText, { color: colors.textSecondary, marginTop: 8 }]}>
          Lade verschlüsselte Abstimmung…
        </Text>
      </Container>
    );
  }

  if (keypairLoading) {
    return (
      <Container colors={colors}>
        <ActivityIndicator color={colors.textSecondary} />
        <Text style={[styles.messageText, { color: colors.textSecondary, marginTop: 8 }]}>
          Schlüssel wird geladen…
        </Text>
      </Container>
    );
  }

  if (signUpState.status === 'needs-keypair') {
    return (
      <View style={styles.container}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Verschlüsselt abstimmen</Text>
        <View style={[styles.stepCard, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.stepLabel, { color: colors.textSecondary }]}>Schritt 1 von 2</Text>
          <Text style={[styles.stepBody, { color: colors.textPrimary }]}>
            Erstelle einen privaten MACI-Schlüssel auf deinem Gerät. Damit verschlüsselst du
            später deine Stimmen — niemand außer dem Koordinator kann sie lesen, und auch der
            kann das Ergebnis nicht fälschen.
          </Text>
        </View>
        <Pressable
          style={[styles.primaryButton, phase !== 'idle' && styles.disabled]}
          onPress={handleGenerateKey}
          disabled={phase !== 'idle'}
        >
          {phase === 'creating-key' ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>Schlüssel erstellen</Text>
          )}
        </Pressable>
        {renderDrawers()}
      </View>
    );
  }

  if (signUpState.status === 'needs-signup' || signUpState.status === 'unknown') {
    return (
      <View style={styles.container}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Verschlüsselt abstimmen</Text>
        <View style={[styles.stepCard, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.stepLabel, { color: colors.textSecondary }]}>Schritt 2 von 2</Text>
          <Text style={[styles.stepBody, { color: colors.textPrimary }]}>
            Einmalige Anmeldung bei MACI. Dein Bürger-Pass wird auf der Blockchain registriert,
            damit du privat abstimmen kannst. Nur dieses Wallet zählt danach für genau eine
            Stimme — egal wie viele Geräte du nutzt.
          </Text>
        </View>
        <Pressable
          style={[styles.primaryButton, phase !== 'idle' && styles.disabled]}
          onPress={handleSignUp}
          disabled={phase !== 'idle'}
        >
          {phase === 'signing-up' ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>Bei MACI anmelden</Text>
          )}
        </Pressable>
        {renderDrawers()}
      </View>
    );
  }

  // signed-up & active: full vote UI
  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Abstimmen</Text>
      <View style={[styles.infoCard, { backgroundColor: colors.surfaceSecondary }]}>
        <Text style={[styles.infoText, { color: colors.textSecondary }]}>
          Verschlüsselte Stimme. Du kannst deine Wahl bis zum Ende der Frist beliebig oft
          ändern — nur die letzte zählt.
        </Text>
      </View>
      <View style={styles.buttonsContainer}>
        <Pressable
          style={[
            styles.voteButton,
            styles.voteButtonFor,
            phase !== 'idle' && styles.disabled,
          ]}
          onPress={() => handleVote(VoteType.For)}
          disabled={phase !== 'idle'}
        >
          {phase !== 'idle' && votingFor === VoteType.For ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.voteButtonText}>Dafür</Text>
          )}
        </Pressable>
        <Pressable
          style={[
            styles.voteButton,
            styles.voteButtonAgainst,
            phase !== 'idle' && styles.disabled,
          ]}
          onPress={() => handleVote(VoteType.Against)}
          disabled={phase !== 'idle'}
        >
          {phase !== 'idle' && votingFor === VoteType.Against ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.voteButtonText}>Dagegen</Text>
          )}
        </Pressable>
        <Pressable
          style={[
            styles.voteButton,
            { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.disabled },
            phase !== 'idle' && styles.disabled,
          ]}
          onPress={() => handleVote(VoteType.Abstain)}
          disabled={phase !== 'idle'}
        >
          {phase !== 'idle' && votingFor === VoteType.Abstain ? (
            <ActivityIndicator color={colors.textSecondary} />
          ) : (
            <Text style={[styles.voteButtonText, { color: colors.textPrimary }]}>Enthalten</Text>
          )}
        </Pressable>
      </View>
      {phase === 'encrypting-vote' && (
        <Text style={[styles.statusLine, { color: colors.textSecondary }]}>
          Stimme wird verschlüsselt…
        </Text>
      )}
      {phase === 'submitting-vote' && (
        <Text style={[styles.statusLine, { color: colors.textSecondary }]}>
          Stimme wird auf die Blockchain gesendet…
        </Text>
      )}
      {renderDrawers()}
    </View>
  );

  function renderDrawers() {
    return (
      <>
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
            setSuccessDrawer({ visible: false, message: '', action: null });
            if (successDrawer.action) successDrawer.action();
          }}
          onDismiss={() => {
            setSuccessDrawer({ visible: false, message: '', action: null });
            if (successDrawer.action) successDrawer.action();
          }}
        />
      </>
    );
  }
}

function Container({
  children,
  colors,
}: {
  children: React.ReactNode;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <View style={styles.container}>
      <View style={[styles.messageContainer, { backgroundColor: colors.surfaceSecondary }]}>
        {children}
      </View>
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
  stepCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  stepLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  stepBody: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: '#194383',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
  infoCard: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  infoText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
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
  disabled: {
    opacity: 0.5,
  },
  voteButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
  statusLine: {
    marginTop: 12,
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
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
