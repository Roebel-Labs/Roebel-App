/**
 * Full v3 cutover rehearsal on a LOCAL Gnosis fork. Nothing is broadcast; every key is
 * generated in-process (ethers.Wallet.createRandom) and dies with the process.
 *
 *   GNOSIS_FORK=1 [GNOSIS_RPC_URL=…] npx hardhat run scripts/v3-cutover/rehearse.cjs
 *   (or the mocha wrapper: V3_CUTOVER_FORK_TEST=1 GNOSIS_FORK=1 npx hardhat test test/V3Cutover.fork.test.js)
 *
 * Flow
 *  - builds a REAL Safe 1.4.1 "new Attester Safe": 3-of-5, whose 5 owners are themselves
 *    Safes (stand-ins for the attesters' passkey Safes), each 1-of-1 over a fork EOA;
 *  - runs 01 → 02 → 03 → 04 exactly as an operator would (same modules, same env contract);
 *  - executes every generated Transaction Builder file through the new Safe with 3 real
 *    owner approvals (owner Safe → approveHash, then execTransaction with pre-validated
 *    signatures; MultiSendCallOnly for multi-call batches), and the Circles file by
 *    impersonating the group owner (we do not hold 0x3A08's keys);
 *  - asserts the properties listed in the task and prints PASS/FAIL per assertion.
 */
require("dotenv").config();
const os = require("os");
const fs = require("fs");
const path = require("path");
const L = require("./lib.cjs");

// Gnosis canonical addresses (safe-global deployments 1.4.1; thirdweb; Safe 4337 module v0.3.0).
const SAFE_L2_SINGLETON = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
const SAFE_PROXY_FACTORY = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
const SAFE_4337_MODULE = "0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226"; // passkey Safes' fallback handler
const TW_FACTORY = "0x85e23b94e7F5E9cC1fF78BCe78cfb15B81f0DF00";
const CIRCLES_HUB = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8";
const OLD_ATTESTER_SAFE = "0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa";

const SAFE_ABI = [
  "function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)",
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool)",
  "function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)",
  "function approveHash(bytes32 hashToApprove)",
  "function nonce() view returns (uint256)",
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "event ExecutionSuccess(bytes32 indexed txHash, uint256 payment)",
  "event ExecutionFailure(bytes32 indexed txHash, uint256 payment)",
];
const FACTORY_ABI = ["function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce) returns (address proxy)"];
const TW_FACTORY_ABI = ["function createAccount(address admin, bytes data) returns (address)"];
const TW_ACCOUNT_ABI = [
  "function execute(address target, uint256 value, bytes data)",
  "function isAdmin(address) view returns (bool)",
  "function setPermissionsForSigner((address signer,uint8 isAdmin,address[] approvedTargets,uint256 nativeTokenLimitPerTransaction,uint128 permissionStartTimestamp,uint128 permissionEndTimestamp,uint128 reqValidityStartTimestamp,uint128 reqValidityEndTimestamp,bytes32 uid) req, bytes signature)",
  "function verifySignerPermissionRequest((address signer,uint8 isAdmin,address[] approvedTargets,uint256 nativeTokenLimitPerTransaction,uint128 permissionStartTimestamp,uint128 permissionEndTimestamp,uint128 reqValidityStartTimestamp,uint128 reqValidityEndTimestamp,bytes32 uid) req, bytes signature) view returns (bool success, address signer)",
];

function makeReporter(log = console.log) {
  const results = [];
  const check = (name, pass, detail = "") => {
    results.push({ name, pass: !!pass, detail });
    log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  };
  return { results, check };
}

async function expectRevert(promise) {
  try { await promise; return { reverted: false }; } catch (e) { return { reverted: true, reason: e.shortMessage || e.message }; }
}

async function rehearse(hre, { log = console.log } = {}) {
  const { ethers, network } = hre;
  if (network.name !== "hardhat" || !network.config.forking?.url) {
    throw new Error("rehearse.cjs only runs on the in-process hardhat network forking Gnosis (GNOSIS_FORK=1).");
  }
  const { results, check } = makeReporter(log);
  const provider = ethers.provider;
  // Hardhat has no hardfork history for chain 100: mine one local block first (see V3Bootstrap.fork.test.js).
  await network.provider.send("hardhat_mine", ["0x1"]);
  const { chainId } = await provider.getNetwork();
  log(`fork of Gnosis at block ${await provider.getBlockNumber()} (local chainId ${chainId})`);

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "v3-cutover-rehearsal-"));
  const opts = { manifest: path.join(work, "gnosis-v3.json"), outDir: path.join(work, "safe-txs") };
  log(`rehearsal manifest + Safe files: ${work}`);

  const [deployer] = await ethers.getSigners();
  const fund = (a) => network.provider.send("hardhat_setBalance", [a, "0x56BC75E2D63100000"]);
  const impersonate = async (a) => { await network.provider.send("hardhat_impersonateAccount", [a]); await fund(a); return ethers.getSigner(a); };
  const newWallet = async () => { const w = ethers.Wallet.createRandom().connect(provider); await fund(w.address); return w; };
  const factory = new ethers.Contract(SAFE_PROXY_FACTORY, FACTORY_ABI, deployer);
  const safeAt = (a, runner = deployer) => new ethers.Contract(a, SAFE_ABI, runner);
  let salt = BigInt(Date.now()) * 1000n;

  async function deploySafe(owners, threshold, fallbackHandler = ethers.ZeroAddress) {
    const init = safeAt(ethers.ZeroAddress).interface.encodeFunctionData("setup",
      [owners, threshold, ethers.ZeroAddress, "0x", fallbackHandler, ethers.ZeroAddress, 0, ethers.ZeroAddress]);
    const s = salt++;
    const addr = await factory.createProxyWithNonce.staticCall(SAFE_L2_SINGLETON, init, s);
    await (await factory.createProxyWithNonce(SAFE_L2_SINGLETON, init, s)).wait();
    return addr;
  }

  /** 1-of-1 Safe executes a call, signed by its EOA owner (raw ECDSA over the Safe tx hash). */
  async function execFromOwnerSafe(ownerSafe, wallet, to, data, value = 0n, operation = 0) {
    const s = safeAt(ownerSafe);
    const h = await s.getTransactionHash(to, value, data, operation, 0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, await s.nonce());
    const sig = wallet.signingKey.sign(h).serialized;
    return (await s.execTransaction(to, value, data, operation, 0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, sig)).wait();
  }

  /** Executes one Transaction Builder file through the 3-of-5 Safe with `approvers` owner Safes. */
  async function execBatchViaSafe(safeAddr, approvers, batch) {
    const tx = L.batchToSafeTx(ethers, batch);
    const s = safeAt(safeAddr);
    const h = await s.getTransactionHash(tx.to, tx.value, tx.data, tx.operation, 0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, await s.nonce());
    for (const a of approvers) await execFromOwnerSafe(a.safe, a.wallet, safeAddr, s.interface.encodeFunctionData("approveHash", [h]));
    const sorted = [...approvers].map((a) => a.safe).sort((x, y) => (BigInt(x) < BigInt(y) ? -1 : 1));
    const sigs = ethers.concat(sorted.map((o) => ethers.concat([ethers.zeroPadValue(o, 32), ethers.ZeroHash, "0x01"])));
    const rc = await (await s.execTransaction(tx.to, tx.value, tx.data, tx.operation, 0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, sigs)).wait();
    const ok = rc.logs.some((l) => { try { return s.interface.parseLog(l)?.name === "ExecutionSuccess"; } catch { return false; } });
    if (!ok) throw new Error(`Safe execution failed for "${batch.meta.name}"`);
    return rc;
  }

  // ---------------------------------------------------------------- guards
  const fakeHre = (id, name) => ({ ethers: { provider: { getNetwork: async () => ({ chainId: id }) } }, network: { name } });
  const savedConfirm = process.env.CONFIRM_MAINNET;
  delete process.env.CONFIRM_MAINNET;
  check("guard: chain 100 refused without CONFIRM_MAINNET", (await expectRevert(L.guardChain(fakeHre(100n, "gnosis"), "t"))).reverted);
  process.env.CONFIRM_MAINNET = "yes";
  check("guard: chain 100 refused with a wrong CONFIRM_MAINNET value", (await expectRevert(L.guardChain(fakeHre(100n, "gnosis"), "t"))).reverted);
  if (savedConfirm === undefined) delete process.env.CONFIRM_MAINNET; else process.env.CONFIRM_MAINNET = savedConfirm;
  check("guard: unknown network refused", (await expectRevert(L.guardChain(fakeHre(8453n, "base"), "t"))).reverted);
  const oldSafeCheck = await expectRevert(L.assertAttesterSafe(hre, OLD_ATTESTER_SAFE));
  check("guard: old 1-of-4 Attester Safe 0x3A08 rejected as NEW_ATTESTER_SAFE", oldSafeCheck.reverted, oldSafeCheck.reason?.slice(0, 90));

  // ---------------------------------------------------------------- new 3-of-5 Attester Safe
  const owners = [];
  for (let i = 0; i < 5; i++) {
    const wallet = await newWallet();
    owners.push({ wallet, safe: await deploySafe([wallet.address], 1) });
  }
  const weak = await deploySafe(owners.map((o) => o.safe), 2);
  check("guard: 2-of-5 Safe rejected", (await expectRevert(L.assertAttesterSafe(hre, weak))).reverted);
  const eoaOwned = await deploySafe([...owners.slice(0, 4).map((o) => o.safe), owners[4].wallet.address], 3);
  check("guard: Safe with an EOA owner rejected", (await expectRevert(L.assertAttesterSafe(hre, eoaOwned))).reverted);
  const attesterSafe = await deploySafe(owners.map((o) => o.safe), 3);
  const approvers = owners.slice(0, 3);
  log(`new Attester Safe (3-of-5, owners = 5 Safes): ${attesterSafe}`);

  // ---------------------------------------------------------------- 01
  const step01 = require("./01-deploy-identity.cjs");
  const m1 = await step01.run(hre, { ...opts, newAttesterSafe: attesterSafe });
  const att = await ethers.getContractAt("AttesterNFTv3", m1.addresses.attesterNFT);
  const cit = await ethers.getContractAt("CitizenNFTv3", m1.addresses.citizenNFT);
  const v2 = L.readJson(L.V2_MANIFEST);
  check("01: owner of both v3 NFTs = new Safe; bands = live v2",
    (await att.owner()) === attesterSafe && (await cit.owner()) === attesterSafe &&
    JSON.stringify(m1.thresholds.citizen) === JSON.stringify(v2.thresholds.citizen) &&
    JSON.stringify(m1.thresholds.attesterApproval) === JSON.stringify(v2.thresholds.attesterApproval));

  // ---------------------------------------------------------------- 02
  const step02 = require("./02-bootstrap-calldata.cjs");
  const r2 = await step02.run(hre, opts);
  const nonceBefore = await safeAt(attesterSafe).nonce();
  for (const f of r2.files) await execBatchViaSafe(attesterSafe, approvers, L.readJson(f));
  const citV2 = new ethers.Contract(v2.addresses.citizenNFT, ["function citizenCount() view returns (uint256)"], provider);
  const attV2 = new ethers.Contract(v2.addresses.attesterNFT, ["function attesterCount() view returns (uint256)"], provider);
  const [v2c, v2a] = [await citV2.citizenCount(), await attV2.attesterCount()];
  let allCit = true, allVotes = true, allAtt = true;
  for (const c of r2.citizens) { allCit &&= await cit.hasCitizenNFT(c); allVotes &&= (await cit.getVotes(c)) === 1n; }
  for (const a of r2.attesters) allAtt &&= await att.hasAttesterNFT(a);
  check(`02: all ${v2c} citizens / ${v2a} attesters bootstrapped via ${r2.files.length} Safe tx(s)`,
    allCit && allAtt && allVotes && (await cit.citizenCount()) === v2c && (await att.attesterCount()) === v2a &&
    r2.citizens.length === Number(v2c) && r2.attesters.length === Number(v2a),
    `v3 citizenCount=${await cit.citizenCount()} attesterCount=${await att.attesterCount()} safeNonce ${nonceBefore}→${await safeAt(attesterSafe).nonce()}`);
  const r2b = await step02.run(hre, { ...opts, outDir: path.join(work, "safe-txs-rerun") });
  check("02: re-run after execution reports delta 0 (idempotent)", r2b.delta.aTodo.length === 0 && r2b.delta.cTodo.length === 0 && r2b.files.length === 0);

  // ---------------------------------------------------------------- 03
  const step03 = require("./03-deploy-governance.cjs");
  const savedX = process.env.COORDINATOR_PUBKEY_X, savedY = process.env.COORDINATOR_PUBKEY_Y, savedAcc = process.env.ACCEPT_LIVE_COORDINATOR_PUBKEY;
  delete process.env.COORDINATOR_PUBKEY_X; delete process.env.COORDINATOR_PUBKEY_Y; delete process.env.ACCEPT_LIVE_COORDINATOR_PUBKEY;
  const refused = await expectRevert(step03.run(hre, opts));
  check("03: refuses to inherit the retired single-operator coordinator key 1775076…", refused.reverted && /1775076/.test(refused.reason || ""), refused.reason?.slice(0, 80));
  // Stand-in for the new Shamir ceremony output: a fresh BabyJubJub keypair.
  const { Keypair } = require("maci-domainobjs");
  const ceremonyKey = new Keypair();
  const ceremonyPub = ceremonyKey.pubKey.asContractParam();
  process.env.COORDINATOR_PUBKEY_X = ceremonyPub.x; process.env.COORDINATOR_PUBKEY_Y = ceremonyPub.y;
  const m3 = await step03.run(hre, opts);
  for (const [k, v] of [["COORDINATOR_PUBKEY_X", savedX], ["COORDINATOR_PUBKEY_Y", savedY], ["ACCEPT_LIVE_COORDINATOR_PUBKEY", savedAcc]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  const A = m3.addresses;
  const gatekeeper = await ethers.getContractAt("SignUpTokenGatekeeper", A.gatekeeper);
  const maci = await ethers.getContractAt("MACI", A.maci);
  const governor = await ethers.getContractAt("MaciAttesterGovernor", A.maciAttesterGovernor);
  const timelock = await ethers.getContractAt("TimelockController", A.timelock);
  check("03: gatekeeper owner = new Safe (not the deployer EOA), token = CitizenNFTv3, maci = new MACI",
    (await gatekeeper.owner()) === attesterSafe && (await gatekeeper.token()) === A.citizenNFT && (await gatekeeper.maci()) === A.maci);
  check("03: Timelock minDelay 3600 = live, open executor, deployer not admin, Governor proposer",
    (await timelock.getMinDelay()) === 3600n && await timelock.hasRole(await timelock.EXECUTOR_ROLE(), ethers.ZeroAddress) &&
    !(await timelock.hasRole(await timelock.DEFAULT_ADMIN_ROLE(), deployer.address)) &&
    await timelock.hasRole(await timelock.PROPOSER_ROLE(), A.maciAttesterGovernor));
  check("03: MACI reuses live factories / verifier / vkRegistry / voice-credit proxy",
    A.verifier === v2.addresses.verifier && A.vkRegistry === v2.addresses.vkRegistry && A.pollFactory === v2.addresses.pollFactory &&
    (await maci.pollFactory()) === v2.addresses.pollFactory && (await maci.initialVoiceCreditProxy()) === v2.addresses.voiceCreditProxy);

  // ---------------------------------------------------------------- 04 (+ Circles Safe tx via impersonation)
  const step04 = require("./04-circles-condition.cjs");
  const r4 = await step04.run(hre, opts);
  const ownerSigner = await impersonate(r4.groupOwner);
  for (const t of L.readJson(r4.file).transactions) await (await ownerSigner.sendTransaction({ to: t.to, data: t.data, value: BigInt(t.value) })).wait();
  const group = new ethers.Contract(v2.addresses.circlesGroup, [
    "function getMembershipConditions() view returns (address[])",
    "function service() view returns (address)",
    "function trustBatchWithConditions(address[] _members, uint96 _expiry)",
  ], provider);
  const conds = (await group.getMembershipConditions()).map((a) => ethers.getAddress(a));
  check("04: group gated ONLY on the v3 condition after the Safe tx", conds.length === 1 && conds[0] === r4.condition, `conditions [${conds.join(", ")}]`);

  // ---------------------------------------------------------------- MACI signUp for a bootstrapped citizen
  let deployedCitizen = null;
  for (const c of r2.citizens) if ((await provider.getCode(c)) !== "0x") { deployedCitizen = c; break; }
  const signUpsBefore = await maci.numSignUps();
  const tokenIdC = await cit.tokenOfOwnerByIndex(deployedCitizen, 0);
  const cSigner = await impersonate(deployedCitizen);
  const pk = () => new Keypair().pubKey.asContractParam();
  const enc = (id) => ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [id]);
  await (await maci.connect(cSigner).signUp(pk(), enc(tokenIdC), "0x")).wait();
  check("MACI: bootstrapped citizen signs up through the new gatekeeper",
    (await maci.numSignUps()) === signUpsBefore + 1n && await gatekeeper.registeredTokenIds(tokenIdC), `citizen ${deployedCitizen} token ${tokenIdC}`);
  check("MACI: same token cannot sign up twice", (await expectRevert(maci.connect(cSigner).signUp(pk(), enc(tokenIdC), "0x"))).reverted);
  const stranger = await newWallet();
  check("MACI: non-citizen cannot sign up", (await expectRevert(maci.connect(stranger).signUp(pk(), enc(tokenIdC), "0x"))).reverted);

  // ---------------------------------------------------------------- Governor propose by an attester
  const attesterAddr = r2.attesters[0];
  const aSigner = await impersonate(attesterAddr);
  const desc = `v3 rehearsal survey ${Date.now()}`;
  const rc = await (await governor.connect(aSigner).propose([A.maciAttesterGovernor], [0], ["0x"], desc)).wait();
  const linked = rc.logs.map((l) => { try { return governor.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "PollLinked");
  const proposalId = linked?.args?.proposalId;
  const pp = proposalId !== undefined ? await governor.proposalPolls(proposalId) : null;
  let pollKeyOk = false;
  if (pp) {
    const poll = new ethers.Contract(pp.poll, ["function coordinatorPubKey() view returns (uint256 x, uint256 y)"], provider);
    const k = await poll.coordinatorPubKey();
    pollKeyOk = k[0].toString() === ceremonyPub.x && k[1].toString() === ceremonyPub.y;
  }
  // votingDelay = 0 with a timestamp clock: the proposal is Pending in its own block, Active from the next.
  await network.provider.send("evm_increaseTime", [1]);
  await network.provider.send("hardhat_mine", ["0x1"]);
  const propState = proposalId !== undefined ? Number(await governor.state(proposalId)) : -1;
  check("Governor: attester propose() deploys a MACI poll on the new MACI, bound to the ceremony key; state Active",
    !!pp && pp.poll !== ethers.ZeroAddress && propState === 1 && pollKeyOk,
    pp ? `poll ${pp.pollId} at ${pp.poll}, state ${propState}, pollKeyMatchesCeremony ${pollKeyOk}` : "no PollLinked");
  check("Governor: non-attester propose() reverts",
    (await expectRevert(governor.connect(stranger).propose([A.maciAttesterGovernor], [0], ["0x"], desc + " x"))).reverted);

  // ---------------------------------------------------------------- moveTo via a real thirdweb account + EIP-712 handover
  const eoa = await newWallet();
  const twFactory = new ethers.Contract(TW_FACTORY, TW_FACTORY_ABI, deployer);
  const legacyAddr = await twFactory.createAccount.staticCall(eoa.address, "0x");
  await (await twFactory.createAccount(eoa.address, "0x")).wait();
  const legacy = new ethers.Contract(legacyAddr, TW_ACCOUNT_ABI, eoa);
  // Give the fresh account a v3 citizenship through the normal v3 attestation flow (real
  // attester/citizen accounts vote via impersonation).
  const reqId = await cit.requestCount();
  await (await legacy.execute(A.citizenNFT, 0, cit.interface.encodeFunctionData("createAttestationRequest", ["ipfs://v3-rehearsal"]))).wait();
  const needAtt = Number(await cit.requiredAttesterApprovalsFor(reqId));
  const needCit = Number(await cit.requiredCitizenApprovalsFor(reqId));
  const attSet = new Set(r2.attesters);
  for (const a of r2.attesters.slice(0, needAtt)) await (await cit.connect(await impersonate(a)).approveRequest(reqId, true)).wait();
  for (const c of r2.citizens.filter((x) => !attSet.has(x)).slice(0, needCit)) await (await cit.connect(await impersonate(c)).approveRequest(reqId, false)).wait();
  check(`v3 attestation of a fresh thirdweb account (${needAtt} attester + ${needCit} citizen approvals)`, await cit.hasCitizenNFT(legacyAddr));
  const tokenIdL = await cit.tokenOfOwnerByIndex(legacyAddr, 0);
  await (await legacy.execute(A.maci, 0, maci.interface.encodeFunctionData("signUp", [pk(), enc(tokenIdL), "0x"]))).wait();

  // The passkey Safe stand-in: Safe 1.4.1 with the Safe4337Module as fallback handler (as the
  // real passkey Safe), owned by a fork EOA because the fork cannot produce WebAuthn assertions.
  const safeOwner = await newWallet();
  const passkeySafe = await deploySafe([safeOwner.address], 1, SAFE_4337_MODULE);
  const now = (await provider.getBlock("latest")).timestamp;
  const req = {
    signer: passkeySafe, isAdmin: 1, approvedTargets: [], nativeTokenLimitPerTransaction: 0,
    permissionStartTimestamp: 0, permissionEndTimestamp: 0,
    reqValidityStartTimestamp: now - 60, reqValidityEndTimestamp: now + 3600, uid: ethers.id(`handover-${now}`),
  };
  const types = { SignerPermissionRequest: [
    { name: "signer", type: "address" }, { name: "isAdmin", type: "uint8" }, { name: "approvedTargets", type: "address[]" },
    { name: "nativeTokenLimitPerTransaction", type: "uint256" }, { name: "permissionStartTimestamp", type: "uint128" },
    { name: "permissionEndTimestamp", type: "uint128" }, { name: "reqValidityStartTimestamp", type: "uint128" },
    { name: "reqValidityEndTimestamp", type: "uint128" }, { name: "uid", type: "bytes32" },
  ] };
  let handoverSig = null;
  for (const cid of [chainId, 100n]) { // thirdweb's EIP-712 domain uses block.chainid (31337 on a hardhat fork)
    const sig = await eoa.signTypedData({ name: "Account", version: "1", chainId: cid, verifyingContract: legacyAddr }, types, req);
    const [ok] = await legacy.verifySignerPermissionRequest(req, sig);
    if (ok) { handoverSig = sig; break; }
  }
  await (await legacy.connect(deployer).setPermissionsForSigner(req, handoverSig)).wait(); // permissionless relay
  check("handover: EOA-signed EIP-712 SignerPermissionRequest makes the Safe admin of the thirdweb account", await legacy.isAdmin(passkeySafe));

  const votesBefore = await cit.getVotes(legacyAddr);
  const countBefore = await cit.citizenCount();
  // The move is triggered by the Safe itself through the legacy account (the production path).
  await execFromOwnerSafe(passkeySafe, safeOwner, legacyAddr,
    legacy.interface.encodeFunctionData("execute", [A.citizenNFT, 0, cit.interface.encodeFunctionData("moveTo", [passkeySafe])]));
  check("moveTo: Safe holds the SAME tokenId and the vote (legacy 1→0, Safe 0→1), citizenCount unchanged",
    (await cit.ownerOf(tokenIdL)) === passkeySafe && (await cit.tokenOfOwnerByIndex(passkeySafe, 0)) === tokenIdL &&
    votesBefore === 1n && (await cit.getVotes(legacyAddr)) === 0n && (await cit.getVotes(passkeySafe)) === 1n &&
    (await cit.citizenCount()) === countBefore && !(await cit.hasCitizenNFT(legacyAddr)) &&
    (await cit.originOf(passkeySafe)) === legacyAddr,
    `tokenId ${tokenIdL}`);
  const dbl = await expectRevert(execFromOwnerSafe(passkeySafe, safeOwner, A.maci, maci.interface.encodeFunctionData("signUp", [pk(), enc(tokenIdL), "0x"])));
  check("moveTo: moved token cannot sign up to MACI a second time (one leaf per citizen)", dbl.reverted);

  // ---------------------------------------------------------------- Circles condition for the moved Safe
  const cond = await ethers.getContractAt("CitizenMembershipCondition", r4.condition);
  check("Circles: v3 condition passes the moved Safe and fails the old legacy address",
    (await cond.passesMembershipCondition.staticCall(passkeySafe)) === true &&
    (await cond.passesMembershipCondition.staticCall(legacyAddr)) === false);
  const service = await impersonate(await group.service());
  const trust = await expectRevert((async () => (await group.connect(service).trustBatchWithConditions([passkeySafe], 4102444800n)).wait())());
  const hub = new ethers.Contract(CIRCLES_HUB, ["function isTrusted(address,address) view returns (bool)"], provider);
  check("Circles: group service can trust the moved Safe through the v3 gate",
    !trust.reverted && await hub.isTrusted(v2.addresses.circlesGroup, passkeySafe), trust.reason?.slice(0, 80));

  // ---------------------------------------------------------------- finalize (one-way) last
  await execBatchViaSafe(attesterSafe, approvers, L.readJson(r2.finalizeFile));
  const again = await expectRevert(step02.run(hre, { ...opts, outDir: path.join(work, "safe-txs-after-final") }));
  check("finalizeBootstrap via Safe: both finalized; 02 refuses afterwards",
    await att.bootstrapFinalized() && await cit.bootstrapFinalized() && again.reverted);

  const failed = results.filter((r) => !r.pass);
  log(`\n${results.length - failed.length}/${results.length} assertions passed. Artifacts: ${work}`);
  return { results, failed, work };
}

module.exports = { rehearse };

if (require.main === module) {
  const hre = require("hardhat");
  rehearse(hre)
    .then(({ failed }) => process.exit(failed.length ? 1 : 0))
    .catch((e) => { console.error(e); process.exit(1); });
}
