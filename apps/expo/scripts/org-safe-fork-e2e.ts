/**
 * Fork proof for the org-Safe settings flow: runs the SAME builders the app uses
 * (lib/org-safe/ops.ts) against a Gnosis fork with the real Safe 1.4.1 contracts.
 *
 *   # terminal 1 (contracts/governor-contract)
 *   GNOSIS_FORK=1 npx hardhat node --port 8546
 *   # terminal 2 (apps/expo)
 *   npx tsx scripts/org-safe-fork-e2e.ts [executorSmartAccount]
 *
 * The executor defaults to a fresh address; pass a real thirdweb smart account to
 * prove the flow for an existing citizen (impersonated — no key involved).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbi,
  type Address,
  type Hex,
} from 'viem';
import {
  createAndRequestCalls,
  leaveBlocker,
  leaveSafeCall,
  planSync,
  syncCall,
  type Call,
  type DbMember,
  type OrgChainState,
} from '../lib/org-safe/ops';

const RPC = process.env.FORK_RPC ?? 'http://127.0.0.1:8546';
const TEST_ATTESTER_NFT = '0x5983F6300bCE3D9C1336a858Bd73F259bB8330F3' as Address;
const COSIGNERS = [
  '0x23C1A14d34E2Dd66DB272a916dDbf2a695366706',
  '0x2A8a14a76d7e02FB7ffb4FB1a1b58bC11184225B',
  '0x5cA779815A65D541d3aAf01B7A6e5c8E25182d77',
  '0x80474C4E4360321F75cE4b5dE11Ba0BA51d484E8',
] as Address[];
const ORG_UUID = '00000000-0000-4000-8000-00000000e2e1';

const pub = createPublicClient({ transport: http(RPC) });
const rpc = (method: string, params: unknown[]) => pub.request({ method: method as never, params: params as never });

async function actor(address: Address) {
  await rpc('hardhat_impersonateAccount', [address]);
  await rpc('hardhat_setBalance', [address, '0x56BC75E2D63100000']);
  return createWalletClient({ account: address, transport: http(RPC) });
}

async function sendAll(from: Address, calls: Call[], label: string) {
  const w = await actor(from);
  for (const c of calls) {
    const hash = await w.sendTransaction({ to: c.to, data: c.data, chain: null });
    const r = await pub.waitForTransactionReceipt({ hash });
    if (r.status !== 'success') throw new Error(`${label}: reverted`);
  }
  console.log(`  ✓ ${label}`);
}

const registryAbi = parseAbi([
  'function approveRequest(uint256 requestId)',
  'function requestCount() view returns (uint256)',
  'function isRegistered(bytes32 orgId) view returns (bool)',
  'function roleOf(bytes32 orgId, address account) view returns (uint8)',
  'function openRegistrationOf(address safe) view returns (bool open, uint256 requestId)',
]);
const safeAbi = parseAbi(['function getOwners() view returns (address[])', 'function getThreshold() view returns (uint256)']);
const ROLES = ['none', 'member', 'admin'] as const;

async function chainState(registry: Address, orgId: Hex, safe: Address, accounts: Address[]): Promise<OrgChainState> {
  const owners = await pub.readContract({ address: safe, abi: safeAbi, functionName: 'getOwners' });
  const threshold = await pub.readContract({ address: safe, abi: safeAbi, functionName: 'getThreshold' });
  const roles: OrgChainState['roles'] = {};
  for (const a of accounts) {
    const r = ROLES[Number(await pub.readContract({ address: registry, abi: registryAbi, functionName: 'roleOf', args: [orgId, a] }))];
    if (r !== 'none') roles[a.toLowerCase()] = r;
  }
  return { safe, owners: owners.map((o) => getAddress(o)), threshold: Number(threshold), roles };
}

function check(name: string, ok: boolean) {
  console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  await rpc('hardhat_mine', ['0x1']); // "latest" must not be the fork block (see hardhat.config.js)

  const executor = getAddress(process.argv[2] ?? '0x' + '1'.repeat(40));
  const owner2 = getAddress('0x' + '2'.repeat(40));
  const admin = getAddress('0x' + '3'.repeat(40));
  const member = getAddress('0x' + '4'.repeat(40));
  const lateOwner = getAddress('0x' + '5'.repeat(40));
  const deployer = getAddress('0x' + '6'.repeat(40));
  console.log(`executor: ${executor}${process.argv[2] ? ' (real account, impersonated)' : ''}`);

  // Fresh registry against the TEST attester set.
  const art = JSON.parse(
    readFileSync(
      resolve(__dirname, '../../../contracts/governor-contract/artifacts/contracts/verification-system/OrgRegistry.sol/OrgRegistry.json'),
      'utf8',
    ),
  );
  const band = (percentBps: number, floor: number, cap: number) => ({ percentBps, floor, cap });
  const dw = await actor(deployer);
  const hash = await dw.deployContract({
    abi: art.abi,
    bytecode: art.bytecode,
    args: [deployer, TEST_ATTESTER_NFT, band(5000, 2, 5), band(2500, 2, 5), band(6700, 3, 65535)],
    chain: null,
  });
  const registry = getAddress((await pub.waitForTransactionReceipt({ hash })).contractAddress!);
  console.log(`registry: ${registry}`);

  // 1. Safe erstellen (one batch in the app; sequential here — same msg.sender).
  const dbOwners = [executor, owner2];
  const { safe, orgId, calls } = createAndRequestCalls({ orgUuid: ORG_UUID, owners: dbOwners, executor, registry });
  await sendAll(executor, calls, 'Safe erstellen (deploy + request)');
  const [open, rid] = await pub.readContract({ address: registry, abi: registryAbi, functionName: 'openRegistrationOf', args: [safe] });
  check('registration request is open', open);

  // Attesters approve.
  for (const a of COSIGNERS.slice(0, 3)) {
    await sendAll(a, [{ to: registry, data: (await import('viem')).encodeFunctionData({ abi: registryAbi, functionName: 'approveRequest', args: [rid] }) }], `attester ${a.slice(0, 8)}… approves`);
    if (await pub.readContract({ address: registry, abi: registryAbi, functionName: 'isRegistered', args: [orgId] })) break;
  }
  check('org registered', await pub.readContract({ address: registry, abi: registryAbi, functionName: 'isRegistered', args: [orgId] }));

  // 2. Mitglieder übertragen — a new owner joined in the DB, plus an admin and a member.
  const members: DbMember[] = [
    { wallet_address: executor, role: 'owner' },
    { wallet_address: owner2, role: 'owner' },
    { wallet_address: lateOwner, role: 'owner' },
    { wallet_address: admin, role: 'admin' },
    { wallet_address: member, role: 'member' },
  ];
  const everyone = members.map((m) => getAddress(m.wallet_address));
  let state = await chainState(registry, orgId, safe, everyone);
  check('leave blocked before sync', leaveBlocker(state, members, executor) === 'not_in_sync');
  const plan = planSync(state, members);
  await sendAll(executor, [syncCall({ safe, executor, registry, orgId, plan })!], `Mitglieder übertragen (${plan.addOwners.length} Inhaber, ${plan.setRoles.length} Rollen)`);
  state = await chainState(registry, orgId, safe, everyone);
  check('late owner is now a Safe owner', state.owners.includes(lateOwner));
  check('admin role onchain', state.roles[admin.toLowerCase()] === 'admin');
  check('member role onchain', state.roles[member.toLowerCase()] === 'member');
  check('sync is idempotent', planSync(state, members).addOwners.length + planSync(state, members).setRoles.length === 0);

  // 3. Übergeben & austreten.
  check('leave allowed', leaveBlocker(state, members, executor) === null);
  await sendAll(executor, [leaveSafeCall(state, executor)], 'Übergeben (executor removed from Safe)');
  state = await chainState(registry, orgId, safe, everyone);
  check('executor no longer a Safe owner', !state.owners.includes(executor));
  check('two owners keep control', state.owners.length === 2 && state.threshold === 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
