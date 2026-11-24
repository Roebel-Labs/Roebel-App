/**
 * An attester's vote on an org registration request (NSP-14), shared by the inbox and the
 * notification card. One sponsored call to the OrgRegistry.
 */
import { encodeFunctionData, parseAbi, type Address } from 'viem';
import { orgRegistryGnosisAddress } from '@/constants/gnosis';
import { sendOrgCalls } from './send';

const voteAbi = parseAbi(['function approveRequest(uint256 requestId)', 'function rejectRequest(uint256 requestId)']);

export async function voteOnOrgRequest(account: Parameters<typeof sendOrgCalls>[0], requestId: number, approve: boolean): Promise<void> {
  const data = encodeFunctionData({
    abi: voteAbi,
    functionName: approve ? 'approveRequest' : 'rejectRequest',
    args: [BigInt(requestId)],
  });
  await sendOrgCalls(account, [{ to: orgRegistryGnosisAddress as Address, data }]);
}

export function orgVoteErrorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('SelfVote')) return 'Du bist Inhaber dieser Organisation und kannst sie nicht selbst bestätigen.';
  if (msg.includes('AlreadyVoted')) return 'Du hast hier bereits abgestimmt.';
  if (msg.includes('Expired') || msg.includes('NotPending')) return 'Die Anfrage ist nicht mehr offen.';
  return 'Transaktion fehlgeschlagen. Bitte versuche es erneut.';
}
