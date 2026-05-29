import { useEffect, useState } from 'react';
import { readContract } from 'thirdweb';
import { governorContract, getTallyContract } from '@/constants/thirdweb';
import { toBigInt } from '@/lib/governance-utils';

/**
 * Self-fetching MACI tally reader, shared by the single-instance proposal
 * surfaces (home hero card + detail-page VotingStats). Centralizes the
 * `governor.proposalPolls(id) → Tally.isTallied() → tallyResults(0/1/2)` flow
 * that VotingStats used to inline.
 *
 * Vote-option indices match VoteType: 0=Against, 1=For, 2=Abstain.
 *
 * "published" mirrors the codebase's canonical definition (see
 * ProposalTimeline): the coordinator has proven the tally on-chain, so the
 * decrypted results are available. We treat `isTallied() === true` as the
 * published signal and read the three result buckets once that flips.
 *
 * NOT for use inside list rows — each instance opens its own 30 s chain poll.
 */

export interface ProposalTallyState {
  loading: boolean;
  /** Governor returned no poll/tally for this id (old governor / stale row). */
  orphan: boolean;
  /** Coordinator has published the decrypted tally on-chain. */
  published: boolean;
  /** Unix-seconds end of the voting window; null until polls() resolves. */
  deadlineSec: number | null;
  forVotes: bigint;
  againstVotes: bigint;
  abstainVotes: bigint;
  total: bigint;
  pollAddress: string | null;
  tallyAddress: string | null;
}

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const TALLY_REFRESH_MS = 30_000;

const INITIAL_STATE: ProposalTallyState = {
  loading: true,
  orphan: false,
  published: false,
  deadlineSec: null,
  forVotes: 0n,
  againstVotes: 0n,
  abstainVotes: 0n,
  total: 0n,
  pollAddress: null,
  tallyAddress: null,
};

export function useProposalTally(proposalId: bigint): ProposalTallyState {
  const [state, setState] = useState<ProposalTallyState>(INITIAL_STATE);

  useEffect(() => {
    if (!proposalId || proposalId === 0n) {
      setState({ ...INITIAL_STATE, loading: false });
      return;
    }
    let cancelled = false;

    const fetchOnce = async (isFirstFetch: boolean) => {
      if (isFirstFetch) setState((s) => ({ ...s, loading: true }));
      try {
        const polls = (await readContract({
          contract: governorContract,
          method:
            'function proposalPolls(uint256) view returns (uint256 pollId, address poll, address messageProcessor, address tally, uint256 deadline)',
          params: [proposalId],
        })) as readonly [bigint, string, string, string, bigint];
        const [, pollAddr, , tallyAddr, deadlineRaw] = polls;
        if (cancelled) return;
        if (!tallyAddr || tallyAddr.toLowerCase() === ZERO_ADDR) {
          setState({ ...INITIAL_STATE, loading: false, orphan: true });
          return;
        }
        const deadlineSec = Number(toBigInt(deadlineRaw));
        const tally = getTallyContract(tallyAddr);
        const tallied = (await readContract({
          contract: tally,
          method: 'function isTallied() view returns (bool)',
          params: [],
        })) as boolean;
        if (cancelled) return;
        if (!tallied) {
          setState({
            loading: false,
            orphan: false,
            published: false,
            deadlineSec,
            forVotes: 0n,
            againstVotes: 0n,
            abstainVotes: 0n,
            total: 0n,
            pollAddress: pollAddr,
            tallyAddress: tallyAddr,
          });
          return;
        }
        // Vote-option order matches VoteType: 0=Against, 1=For, 2=Abstain.
        const [against, forR, abstain] = await Promise.all([
          readContract({
            contract: tally,
            method: 'function tallyResults(uint256) view returns (uint256 value, bool flag)',
            params: [0n],
          }) as Promise<readonly [bigint, boolean]>,
          readContract({
            contract: tally,
            method: 'function tallyResults(uint256) view returns (uint256 value, bool flag)',
            params: [1n],
          }) as Promise<readonly [bigint, boolean]>,
          readContract({
            contract: tally,
            method: 'function tallyResults(uint256) view returns (uint256 value, bool flag)',
            params: [2n],
          }) as Promise<readonly [bigint, boolean]>,
        ]);
        if (cancelled) return;
        const forVotes = toBigInt(forR[0]);
        const againstVotes = toBigInt(against[0]);
        const abstainVotes = toBigInt(abstain[0]);
        setState({
          loading: false,
          orphan: false,
          published: true,
          deadlineSec,
          forVotes,
          againstVotes,
          abstainVotes,
          total: forVotes + againstVotes + abstainVotes,
          pollAddress: pollAddr,
          tallyAddress: tallyAddr,
        });
      } catch (err) {
        console.warn('[useProposalTally] fetch failed:', err);
        if (!cancelled && isFirstFetch) setState({ ...INITIAL_STATE, loading: false });
      }
    };

    fetchOnce(true);
    const id = setInterval(() => fetchOnce(false), TALLY_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [proposalId]);

  return state;
}
