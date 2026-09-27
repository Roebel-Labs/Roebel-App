jest.mock('react-native-passkey', () => ({ Passkey: { create: jest.fn(), get: jest.fn(), isSupported: () => true } }));

import { encodeFunctionData, getAddress, parseAbi, toFunctionSelector, type Address, type Hex } from 'viem';
import { SAFE_WEBAUTHN_SHARED_SIGNER } from '../constants';
import {
  clearPollHints,
  MISSING_POLL_ID_MESSAGE,
  MIXED_POLLS_MESSAGE,
  PUBLISH_MESSAGE_SELECTOR,
  pollIdForTxs,
  rememberPollId,
} from '../poll-hints';
import { predictSafeAddress } from '../safe-address';
import { createPasskeyAccount, type AdapterDeps } from '../thirdweb-adapter';
import { sponsorRequestBody, type PasskeyUserOpArgs, type UnpackedUserOp } from '../userop';
import sv from './passkey-safe-vector.json';

const pollAbi = parseAbi(['function publishMessage((uint256[10] data) _message, (uint256 x, uint256 y) _encPubKey)']);
const POLL = getAddress('0x1111111111111111111111111111111111111111');
const POLL_B = getAddress('0x2222222222222222222222222222222222222222');
const LEGACY = getAddress('0xc49dE63CcfeE46C6C5c3E393293f66779799Fb28');
const x = sv.x as Hex;
const y = sv.y as Hex;
const SAFE = predictSafeAddress({ x, y });

const voteData = (): Hex =>
  encodeFunctionData({
    abi: pollAbi,
    functionName: 'publishMessage',
    args: [{ data: [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n] }, { x: 11n, y: 12n }],
  });

beforeEach(() => clearPollHints());

describe('poll hints', () => {
  it('pins the publishMessage selector the sponsor allowlists', () => {
    expect(PUBLISH_MESSAGE_SELECTOR).toBe(
      toFunctionSelector('function publishMessage((uint256[10] data) _message, (uint256 x, uint256 y) _encPubKey)'),
    );
  });

  it('returns undefined when no call is a vote', () => {
    expect(pollIdForTxs([{ to: POLL, data: '0x0d873a79' }])).toBeUndefined();
  });

  it('resolves the recorded pollId case-insensitively', () => {
    rememberPollId(POLL.toLowerCase(), 7n);
    expect(pollIdForTxs([{ to: POLL, data: voteData() }])).toBe(7n);
  });

  it('refuses a vote whose poll is unknown (never sends a body the sponsor rejects)', () => {
    expect(() => pollIdForTxs([{ to: POLL, data: voteData() }])).toThrow(MISSING_POLL_ID_MESSAGE);
  });

  it('refuses two polls in one op', () => {
    rememberPollId(POLL, 1n);
    rememberPollId(POLL_B, 2n);
    expect(() =>
      pollIdForTxs([
        { to: POLL, data: voteData() },
        { to: POLL_B, data: voteData() },
      ]),
    ).toThrow(MIXED_POLLS_MESSAGE);
  });
});

describe('adapter → sponsor body carries pollId', () => {
  function deps() {
    const sent: PasskeyUserOpArgs[] = [];
    const d: AdapterDeps = {
      sign: jest.fn(),
      isSafeDeployed: jest.fn(async () => true),
      sendUserOp: jest.fn(async (args: PasskeyUserOpArgs) => {
        sent.push(args);
        return { userOpHash: `0x${'aa'.repeat(32)}` as Hex, txHash: `0x${'bb'.repeat(32)}` as Hex };
      }),
    };
    return { d, sent };
  }
  const session = (identity: Address) => ({
    credentialId: 'cred',
    x,
    y,
    safe: SAFE,
    identity,
    ownerType: 'sharedSigner' as const,
    owner: SAFE_WEBAUTHN_SHARED_SIGNER,
  });

  it.each([
    ['legacy', LEGACY],
    ['safe', SAFE],
  ])('passes the vote pollId for a %s identity', async (_k, identity) => {
    rememberPollId(POLL, 42n);
    const { d, sent } = deps();
    await createPasskeyAccount(session(identity), d).sendTransaction({ chainId: 100, to: POLL, data: voteData() });
    expect(sent[0].pollId).toBe(42n);
  });

  it('omits pollId for non-vote calls', async () => {
    const { d, sent } = deps();
    await createPasskeyAccount(session(LEGACY), d).sendTransaction({ chainId: 100, to: POLL, data: '0x0d873a79' });
    expect('pollId' in sent[0]).toBe(false);
  });

  it('a vote with no recorded poll never reaches the sponsor', async () => {
    const { d, sent } = deps();
    await expect(
      createPasskeyAccount(session(LEGACY), d).sendTransaction({ chainId: 100, to: POLL, data: voteData() }),
    ).rejects.toThrow(MISSING_POLL_ID_MESSAGE);
    expect(sent).toHaveLength(0);
  });

  it('sponsorRequestBody encodes pollId as a 0x hex quantity (server parseSponsorRequest)', () => {
    const op = { sender: SAFE, nonce: 0n, callData: '0x', callGasLimit: 0n, verificationGasLimit: 0n, preVerificationGas: 0n,
      maxFeePerGas: 0n, maxPriorityFeePerGas: 0n, paymaster: SAFE, paymasterVerificationGasLimit: 0n,
      paymasterPostOpGasLimit: 0n, paymasterData: '0x', signature: '0x' } as unknown as UnpackedUserOp;
    expect(sponsorRequestBody(op, { x, y, pollId: 255n }).pollId).toBe('0xff');
    expect(sponsorRequestBody(op, { x, y, pollId: 0n }).pollId).toBe('0x0');
    expect('pollId' in sponsorRequestBody(op, { x, y })).toBe(false);
  });
});
