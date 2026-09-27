import { decodeFunctionData, getAddress, parseAbi, type Address } from 'viem';
import {
  createAndRequestCalls,
  isInSync,
  leaveBlocker,
  leaveSafeCall,
  orgIdFromUuid,
  planSync,
  predictOrgSafeAddress,
  preValidatedSignature,
  SAFE_OWNERS_SENTINEL,
  syncCall,
  type OrgChainState,
} from '../org-safe/ops';
import { MULTI_SEND_CALL_ONLY, SAFE_PROXY_FACTORY } from '../passkey/constants';

const UUID = '6f1c2c7e-0d3a-4b5e-9a51-3f7a1d2b9c10';
// Pinned in packages/protocol/test/orgs.test.ts and the OrgRegistry tests.
const ORG = '0xe24e97d03b0d38722d695a9ad8cb4f4c87d82908a322b08d510acaef2bb629f3';
const A = getAddress('0x' + 'a'.repeat(40));
const B = getAddress('0x' + 'b'.repeat(40));
const C = getAddress('0x' + 'c'.repeat(40));
const D = getAddress('0x' + 'd'.repeat(40));
const REGISTRY = getAddress('0x' + 'e'.repeat(40));
const SAFE = getAddress('0x' + 'f'.repeat(40));

const safeAbi = parseAbi([
  'function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures)',
  'function removeOwner(address prevOwner,address owner,uint256 _threshold)',
]);

const state = (over: Partial<OrgChainState> = {}): OrgChainState => ({
  safe: SAFE,
  owners: [A, B],
  threshold: 1,
  roles: {},
  ...over,
});

describe('org Safe ids and addresses', () => {
  it('derives the frozen NSP-14 org id', () => {
    expect(orgIdFromUuid(UUID)).toBe(ORG);
    expect(orgIdFromUuid(UUID.toUpperCase())).toBe(ORG);
    expect(() => orgIdFromUuid('nope')).toThrow();
  });

  it('predicts the same Safe regardless of owner order or case', () => {
    const a = predictOrgSafeAddress(ORG, [A, B]);
    expect(predictOrgSafeAddress(ORG, [B.toLowerCase(), A])).toBe(a);
    expect(predictOrgSafeAddress(ORG, [A, C])).not.toBe(a);
  });

  it('create+request batches factory then Safe, and requires the executor to be an owner', () => {
    const { safe, calls } = createAndRequestCalls({ orgUuid: UUID, owners: [A, B], executor: A, registry: REGISTRY });
    expect(calls).toHaveLength(2);
    expect(calls[0].to).toBe(SAFE_PROXY_FACTORY);
    expect(calls[1].to).toBe(safe);
    const exec = decodeFunctionData({ abi: safeAbi, data: calls[1].data });
    expect(exec.args[0]).toBe(REGISTRY);
    expect(exec.args[9]).toBe(preValidatedSignature(A));
    expect(createAndRequestCalls({ orgUuid: UUID, owners: [A], executor: A, registry: REGISTRY, alreadyDeployed: true }).calls).toHaveLength(1);
    expect(() => createAndRequestCalls({ orgUuid: UUID, owners: [B], executor: A, registry: REGISTRY })).toThrow();
  });

  it('pre-validated signature is r=owner, s=0, v=1', () => {
    const sig = preValidatedSignature(A);
    expect(sig.length).toBe(2 + 65 * 2);
    expect(sig.slice(-2)).toBe('01');
    expect(sig.toLowerCase()).toContain(A.slice(2).toLowerCase());
  });
});

describe('sync plan', () => {
  it('adds missing owners, sets roles, never removes Safe owners', () => {
    const plan = planSync(state({ owners: [A] }), [
      { wallet_address: A.toLowerCase(), role: 'owner' },
      { wallet_address: B.toLowerCase(), role: 'owner' },
      { wallet_address: C.toLowerCase(), role: 'admin' },
      { wallet_address: D.toLowerCase(), role: 'member' },
    ]);
    expect(plan.addOwners).toEqual([B]);
    expect(plan.setRoles).toEqual([
      { account: C, role: 'admin' },
      { account: D, role: 'member' },
    ]);
  });

  it('clears roles of people who left or became owners, and is idempotent', () => {
    const members = [
      { wallet_address: A, role: 'owner' },
      { wallet_address: C, role: 'owner' },
    ];
    const s = state({ owners: [A, C], roles: { [C.toLowerCase()]: 'admin', [D.toLowerCase()]: 'member' } });
    const plan = planSync(s, members);
    expect(plan.addOwners).toEqual([]);
    expect(plan.setRoles).toEqual([
      { account: C, role: 'none' },
      { account: D, role: 'none' },
    ]);
    expect(isInSync(planSync(state({ owners: [A, C] }), members))).toBe(true);
  });

  it('encodes the whole sync as one DELEGATECALL into MultiSendCallOnly', () => {
    const plan = planSync(state({ owners: [A] }), [
      { wallet_address: A, role: 'owner' },
      { wallet_address: B, role: 'owner' },
      { wallet_address: C, role: 'member' },
    ]);
    const call = syncCall({ safe: SAFE, executor: A, registry: REGISTRY, orgId: ORG, plan })!;
    expect(call.to).toBe(SAFE);
    const exec = decodeFunctionData({ abi: safeAbi, data: call.data });
    expect(exec.args[0]).toBe(MULTI_SEND_CALL_ONLY);
    expect(exec.args[3]).toBe(1);
    expect(syncCall({ safe: SAFE, executor: A, registry: REGISTRY, orgId: ORG, plan: { addOwners: [], setRoles: [] } })).toBeNull();
  });
});

describe('leaving', () => {
  const members = [
    { wallet_address: A, role: 'owner' },
    { wallet_address: B, role: 'owner' },
  ];

  it('is blocked without another database owner in the Safe, or while out of sync', () => {
    expect(leaveBlocker(state({ owners: [A] }), members, A)).toBe('no_other_owner');
    expect(leaveBlocker(state({ owners: [A, C] }), [{ wallet_address: A, role: 'owner' }], A)).toBe('no_other_owner');
    expect(leaveBlocker(state(), [...members, { wallet_address: C, role: 'member' }], A)).toBe('not_in_sync');
    expect(leaveBlocker(state(), members, C)).toBe('not_an_owner');
    expect(leaveBlocker(state(), members, A)).toBeNull();
  });

  it('removes the executor with the right prevOwner and a threshold that still fits', () => {
    const first = decodeFunctionData({ abi: safeAbi, data: decodeFunctionData({ abi: safeAbi, data: leaveSafeCall(state({ owners: [A, B, C], threshold: 3 }), A).data }).args[2] as `0x${string}` });
    expect(first.args).toEqual([SAFE_OWNERS_SENTINEL, A, 2n]);
    const middle = decodeFunctionData({ abi: safeAbi, data: decodeFunctionData({ abi: safeAbi, data: leaveSafeCall(state({ owners: [A, B, C] }), B).data }).args[2] as `0x${string}` });
    expect(middle.args).toEqual([A, B, 1n]);
    expect(() => leaveSafeCall(state({ owners: [A] }), A)).toThrow();
  });
});
