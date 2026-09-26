/**
 * v3 cutover, step 3: governance stack bound to CitizenNFTv3 / AttesterNFTv3.
 *
 * Why new MACI at all: burning or moving a token never removes its MACI state leaf, and the
 * v2 gatekeeper keys on v2 token ids. A fresh gatekeeper + MACI state tree is the only way to
 * get "one citizen = one leaf" on v3 (spec, D2 verdict). Everything stateless is REUSED:
 *
 *   NEW    SignUpTokenGatekeeper(token = CitizenNFTv3)
 *   NEW    MACI core (fresh state tree), linked to the LIVE Poseidon libraries
 *   REUSED PollFactory / MessageProcessorFactory / TallyFactory   (stateless deployers)
 *   REUSED ConstantInitialVoiceCreditProxy(1)                      (stateless)
 *   REUSED Verifier + VkRegistry (keys for 14/5/9/3 non-QV are set; checked below)
 *   NEW    TimelockController (minDelay + executors copied from the live Timelock; admin renounced)
 *   NEW    MaciAttesterGovernor (every parameter copied from the live Governor on-chain)
 *
 * All reused addresses and parameters are READ ON-CHAIN from the live Governor/MACI and only
 * cross-checked against gnosis-v2.json (MACI runbook §10.11: manifests hold the value a
 * contract was BORN with, not the one it HAS).
 *
 * Coordinator pubkey: default = the live Governor's coordinatorPubKey(). A v3 Governor can only
 * rotate its key through a passed + TALLIED proposal, so if a new Shamir ceremony has already
 * produced a new key, pass it here (COORDINATOR_PUBKEY_X / _Y) and the Governor is born with
 * it. If the live key equals the RETIRED single-operator key 1775076… (runbook §10.11), the
 * script refuses unless COORDINATOR_PUBKEY_X/Y is given or ACCEPT_LIVE_COORDINATOR_PUBKEY=yes.
 *
 * Gatekeeper ownership: setMaciInstance(newMACI) runs first, then transferOwnership(NEW Safe),
 * so the gatekeeper is never left owned by the deployer EOA (the v2 gatekeeper 0xc4B9… still
 * is: finding in the migration spec). SignUpTokenGatekeeper uses plain Ownable, so this is a
 * one-step transfer.
 *
 *   npx hardhat run scripts/v3-cutover/03-deploy-governance.cjs --network gnosis   (+ CONFIRM_MAINNET)
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const L = require("./lib.cjs");

const RETIRED_SINGLE_OPERATOR_PUBKEY_X =
  "17750760918337237068203925046126855078152981024548838042861633066128051663100";

const GOV_ABI = [
  "function coordinator() view returns (address)",
  "function coordinatorPubKey() view returns (uint256 x, uint256 y)",
  "function votingPeriod() view returns (uint256)",
  "function quorumPercentage() view returns (uint256)",
  "function quorumAbsolute() view returns (uint256)",
  "function tallyGracePeriod() view returns (uint256)",
  "function treeDepths() view returns (uint8 intStateTreeDepth, uint8 messageTreeSubDepth, uint8 messageTreeDepth, uint8 voteOptionTreeDepth)",
  "function mode() view returns (uint8)",
  "function verifier() view returns (address)",
  "function vkRegistry() view returns (address)",
  "function maci() view returns (address)",
  "function timelock() view returns (address)",
];
const MACI_ABI = [
  "function pollFactory() view returns (address)",
  "function messageProcessorFactory() view returns (address)",
  "function tallyFactory() view returns (address)",
  "function initialVoiceCreditProxy() view returns (address)",
  "function stateTreeDepth() view returns (uint8)",
  "function emptyBallotRoots(uint256) view returns (uint256)",
];
const TL_ABI = [
  "function getMinDelay() view returns (uint256)",
  "function hasRole(bytes32,address) view returns (bool)",
  "function EXECUTOR_ROLE() view returns (bytes32)",
];
const VK_ABI = [
  "function hasProcessVk(uint256,uint256,uint256,uint256,uint8) view returns (bool)",
  "function hasTallyVk(uint256,uint256,uint256,uint8) view returns (bool)",
];

/** Reads everything the new stack reuses or copies from the LIVE v2 governance. */
async function readLive(ethers, v2) {
  const a = v2.addresses;
  const gov = new ethers.Contract(a.maciAttesterGovernor, GOV_ABI, ethers.provider);
  const maciAddr = ethers.getAddress(await gov.maci());
  const maci = new ethers.Contract(maciAddr, MACI_ABI, ethers.provider);
  const tlAddr = ethers.getAddress(await gov.timelock());
  const tl = new ethers.Contract(tlAddr, TL_ABI, ethers.provider);
  const pk = await gov.coordinatorPubKey();
  const td = await gov.treeDepths();
  const live = {
    governor: ethers.getAddress(a.maciAttesterGovernor),
    maci: maciAddr,
    timelock: tlAddr,
    coordinator: ethers.getAddress(await gov.coordinator()),
    coordinatorPubKey: { x: pk[0].toString(), y: pk[1].toString() },
    votingPeriod: await gov.votingPeriod(),
    quorumPercentage: await gov.quorumPercentage(),
    quorumAbsolute: await gov.quorumAbsolute(),
    tallyGracePeriod: await gov.tallyGracePeriod(),
    treeDepths: {
      intStateTreeDepth: Number(td[0]), messageTreeSubDepth: Number(td[1]),
      messageTreeDepth: Number(td[2]), voteOptionTreeDepth: Number(td[3]),
    },
    mode: Number(await gov.mode()),
    verifier: ethers.getAddress(await gov.verifier()),
    vkRegistry: ethers.getAddress(await gov.vkRegistry()),
    pollFactory: ethers.getAddress(await maci.pollFactory()),
    messageProcessorFactory: ethers.getAddress(await maci.messageProcessorFactory()),
    tallyFactory: ethers.getAddress(await maci.tallyFactory()),
    voiceCreditProxy: ethers.getAddress(await maci.initialVoiceCreditProxy()),
    stateTreeDepth: Number(await maci.stateTreeDepth()),
    emptyBallotRoots: [],
    timelockMinDelay: await tl.getMinDelay(),
    openExecutor: await tl.hasRole(await tl.EXECUTOR_ROLE(), ethers.ZeroAddress),
  };
  for (let i = 0; i < 5; i++) live.emptyBallotRoots.push(await maci.emptyBallotRoots(i));

  // The MACI core must be linked against the same Poseidon libraries the live one uses.
  // Linked library addresses are embedded verbatim in the deployed bytecode.
  const code = (await ethers.provider.getCode(maciAddr)).toLowerCase();
  live.poseidon = {};
  for (const k of ["PoseidonT3", "PoseidonT4", "PoseidonT5", "PoseidonT6"]) {
    const addr = ethers.getAddress(a[k]);
    if ((await ethers.provider.getCode(addr)) === "0x") throw new Error(`${k} ${addr} has no code`);
    live.poseidon[k] = addr;
    live[`${k}InLiveMaci`] = code.includes(addr.slice(2).toLowerCase());
  }
  if (!live.PoseidonT3InLiveMaci && !live.PoseidonT4InLiveMaci && !live.PoseidonT5InLiveMaci && !live.PoseidonT6InLiveMaci) {
    throw new Error("none of the manifest Poseidon libraries is linked into the live MACI bytecode — manifest stale?");
  }

  // Manifest cross-check (warn only; on-chain wins).
  const drift = [];
  for (const [k, v] of Object.entries({ maci: live.maci, timelock: live.timelock, verifier: live.verifier, vkRegistry: live.vkRegistry, pollFactory: live.pollFactory, messageProcessorFactory: live.messageProcessorFactory, tallyFactory: live.tallyFactory, voiceCreditProxy: live.voiceCreditProxy, coordinator: live.coordinator })) {
    if (a[k] && ethers.getAddress(a[k]) !== v) drift.push(`${k}: manifest ${a[k]} vs chain ${v}`);
  }
  if (drift.length) console.warn("  ⚠️  gnosis-v2.json drift (using on-chain):\n    " + drift.join("\n    "));

  const vk = new ethers.Contract(live.vkRegistry, VK_ABI, ethers.provider);
  const batchSize = 5 ** live.treeDepths.messageTreeSubDepth;
  live.hasProcessVk = await vk.hasProcessVk(live.stateTreeDepth, live.treeDepths.messageTreeDepth, live.treeDepths.voteOptionTreeDepth, batchSize, live.mode);
  live.hasTallyVk = await vk.hasTallyVk(live.stateTreeDepth, live.treeDepths.intStateTreeDepth, live.treeDepths.voteOptionTreeDepth, live.mode);
  if (!live.hasProcessVk || !live.hasTallyVk) throw new Error("live VkRegistry lacks the process/tally keys for the live tree depths — cannot reuse it.");
  return live;
}

function chooseCoordinatorPubKey(live) {
  const x = process.env.COORDINATOR_PUBKEY_X, y = process.env.COORDINATOR_PUBKEY_Y;
  if (x || y) {
    if (!x || !y) throw new Error("set both COORDINATOR_PUBKEY_X and COORDINATOR_PUBKEY_Y");
    console.log("  coordinator pubkey: OVERRIDE from env (new Shamir ceremony key)");
    return { x: BigInt(x).toString(), y: BigInt(y).toString(), source: "env" };
  }
  if (live.coordinatorPubKey.x === RETIRED_SINGLE_OPERATOR_PUBKEY_X && process.env.ACCEPT_LIVE_COORDINATOR_PUBKEY !== "yes") {
    throw new Error(
      "the live Governor's coordinatorPubKey is 1775076… — the RETIRED single-operator key (MACI runbook §10.11), " +
      "not a 3-of-5 Shamir key. Run the new Shamir ceremony first and pass COORDINATOR_PUBKEY_X/Y, or set " +
      "ACCEPT_LIVE_COORDINATOR_PUBKEY=yes to deliberately inherit it (a v3 key rotation then needs a tallied proposal)."
    );
  }
  console.log("  coordinator pubkey: copied from the live Governor");
  return { ...live.coordinatorPubKey, source: "live-governor" };
}

async function deployLinked(ethers, name, signer, libraries, args) {
  const F = await ethers.getContractFactory(name, { signer, libraries });
  const c = await F.deploy(...args);
  await c.waitForDeployment();
  return c;
}

async function run(hre, opts = {}) {
  const { ethers } = hre;
  await L.guardChain(hre, "03-deploy-governance");
  const manifestPath = L.v3ManifestPath(opts);
  const v3 = L.readJson(manifestPath);
  const v2 = L.readJson(L.V2_MANIFEST);
  if (v3.addresses.maci) throw new Error(`gnosis-v3.json already has governance (maci ${v3.addresses.maci}); refusing to redeploy over it.`);
  const safe = ethers.getAddress(v3.addresses.ownerSafe);
  await L.assertAttesterSafe(hre, safe);
  const CIT = ethers.getAddress(v3.addresses.citizenNFT);
  const ATT = ethers.getAddress(v3.addresses.attesterNFT);

  const live = await readLive(ethers, v2);
  console.log("  live governance:", JSON.stringify({
    governor: live.governor, maci: live.maci, timelock: live.timelock, minDelay: live.timelockMinDelay.toString(),
    openExecutor: live.openExecutor, votingPeriod: live.votingPeriod.toString(), quorum: `${live.quorumPercentage}%/${live.quorumAbsolute}`,
    tallyGrace: live.tallyGracePeriod.toString(), treeDepths: live.treeDepths, mode: live.mode, coordinator: live.coordinator,
  }));
  const pubKey = chooseCoordinatorPubKey(live);

  const [deployer] = await ethers.getSigners();
  const deployerAddr = await deployer.getAddress();
  const startBal = await ethers.provider.getBalance(deployerAddr);
  console.log("  deployer:", deployerAddr, "balance", ethers.formatEther(startBal));

  console.log("  [1/5] SignUpTokenGatekeeper(CitizenNFTv3)…");
  const GK = await ethers.getContractFactory("SignUpTokenGatekeeper", deployer);
  const gatekeeper = await GK.deploy(CIT);
  await gatekeeper.waitForDeployment();
  const gatekeeperAddr = await gatekeeper.getAddress();
  console.log("        →", gatekeeperAddr);

  console.log("  [2/5] MACI core (fresh state tree; reused factories/proxy/Poseidon)…");
  const maci = await deployLinked(ethers, "MACI", deployer, live.poseidon, [
    live.pollFactory, live.messageProcessorFactory, live.tallyFactory, gatekeeperAddr, live.voiceCreditProxy,
    live.stateTreeDepth, live.emptyBallotRoots,
  ]);
  const maciAddr = await maci.getAddress();
  const maciDeployBlock = (await maci.deploymentTransaction().wait()).blockNumber;
  console.log("        →", maciAddr, "(block", maciDeployBlock + ")");

  console.log("  [3/5] gatekeeper.setMaciInstance → transferOwnership(new Safe)…");
  await (await gatekeeper.setMaciInstance(maciAddr)).wait();
  await (await gatekeeper.transferOwnership(safe)).wait();

  console.log(`  [4/5] TimelockController(minDelay=${live.timelockMinDelay}, executors=${live.openExecutor ? "[anyone]" : "[governor]"})…`);
  const TL = await ethers.getContractFactory("TimelockController", deployer);
  const timelock = await TL.deploy(live.timelockMinDelay, [], live.openExecutor ? [ethers.ZeroAddress] : [], deployerAddr);
  await timelock.waitForDeployment();
  const timelockAddr = await timelock.getAddress();
  console.log("        →", timelockAddr);

  console.log("  [5/5] MaciAttesterGovernor…");
  const G = await ethers.getContractFactory("MaciAttesterGovernor", deployer);
  const governor = await G.deploy({
    attesterNFT: ATT,
    citizenNFT: CIT,
    maci: maciAddr,
    verifier: live.verifier,
    vkRegistry: live.vkRegistry,
    coordinator: live.coordinator,
    coordinatorPubKey: { x: pubKey.x, y: pubKey.y },
    treeDepths: live.treeDepths,
    mode: live.mode,
    timelock: timelockAddr,
    votingPeriod: live.votingPeriod,
    quorumPercentage: live.quorumPercentage,
    quorumAbsolute: live.quorumAbsolute,
    tallyGracePeriod: live.tallyGracePeriod,
  });
  await governor.waitForDeployment();
  const governorAddr = await governor.getAddress();
  console.log("        →", governorAddr);

  console.log("  locking Timelock (Governor = proposer + canceller; executor = governor if not open; deployer renounces admin)…");
  await (await timelock.grantRole(await timelock.PROPOSER_ROLE(), governorAddr)).wait();
  await (await timelock.grantRole(await timelock.CANCELLER_ROLE(), governorAddr)).wait();
  if (!live.openExecutor) await (await timelock.grantRole(await timelock.EXECUTOR_ROLE(), governorAddr)).wait();
  await (await timelock.renounceRole(await timelock.DEFAULT_ADMIN_ROLE(), deployerAddr)).wait();

  // ---- verification (abort loudly; the manifest is only written when everything holds) ----
  const eq = (x, y) => String(x).toLowerCase() === String(y).toLowerCase();
  const gpk = await governor.coordinatorPubKey();
  const gtd = await governor.treeDepths();
  const checks = {
    gatekeeperToken: eq(await gatekeeper.token(), CIT),
    gatekeeperMaci: eq(await gatekeeper.maci(), maciAddr),
    gatekeeperOwnerIsSafe: eq(await gatekeeper.owner(), safe),
    maciGatekeeper: eq(await maci.signUpGatekeeper(), gatekeeperAddr),
    maciFresh: (await maci.numSignUps()) === 1n || (await maci.numSignUps()) === 0n,
    govNfts: eq(await governor.citizenNFT(), CIT) && eq(await governor.attesterNFT(), ATT),
    govMaci: eq(await governor.maci(), maciAddr),
    govTimelock: eq(await governor.timelock(), timelockAddr),
    govParams: (await governor.votingPeriod()) === live.votingPeriod && (await governor.quorumPercentage()) === live.quorumPercentage &&
      (await governor.quorumAbsolute()) === live.quorumAbsolute && (await governor.tallyGracePeriod()) === live.tallyGracePeriod,
    govPubKey: gpk[0].toString() === pubKey.x && gpk[1].toString() === pubKey.y,
    govTreeDepths: Number(gtd[0]) === live.treeDepths.intStateTreeDepth && Number(gtd[1]) === live.treeDepths.messageTreeSubDepth &&
      Number(gtd[2]) === live.treeDepths.messageTreeDepth && Number(gtd[3]) === live.treeDepths.voteOptionTreeDepth,
    tlProposer: await timelock.hasRole(await timelock.PROPOSER_ROLE(), governorAddr),
    tlCanceller: await timelock.hasRole(await timelock.CANCELLER_ROLE(), governorAddr),
    tlExecutor: await timelock.hasRole(await timelock.EXECUTOR_ROLE(), live.openExecutor ? ethers.ZeroAddress : governorAddr),
    tlDeployerNotAdmin: !(await timelock.hasRole(await timelock.DEFAULT_ADMIN_ROLE(), deployerAddr)),
    tlSelfAdminOnly: await timelock.hasRole(await timelock.DEFAULT_ADMIN_ROLE(), timelockAddr),
    tlDelay: (await timelock.getMinDelay()) === live.timelockMinDelay,
  };
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
  if (failed.length) throw new Error("post-deploy checks failed: " + failed.join(", "));
  console.log("  post-deploy checks OK:", Object.keys(checks).join(", "));

  const out = L.readJson(manifestPath);
  Object.assign(out.addresses, {
    gatekeeper: gatekeeperAddr, maci: maciAddr, timelock: timelockAddr, maciAttesterGovernor: governorAddr,
    voiceCreditProxy: live.voiceCreditProxy, verifier: live.verifier, vkRegistry: live.vkRegistry,
    pollFactory: live.pollFactory, messageProcessorFactory: live.messageProcessorFactory, tallyFactory: live.tallyFactory,
    ...live.poseidon, coordinator: live.coordinator,
  });
  out.maciDeployBlock = maciDeployBlock;
  out.parameters = {
    stateTreeDepth: live.stateTreeDepth, ...live.treeDepths, messageBatchSize: 5 ** live.treeDepths.messageTreeSubDepth,
    mode: live.mode === 1 ? "NON_QV" : live.mode, votingPeriod: Number(live.votingPeriod),
    quorumPercentage: Number(live.quorumPercentage), quorumAbsolute: Number(live.quorumAbsolute),
    tallyGracePeriod: Number(live.tallyGracePeriod), timelockMinDelay: Number(live.timelockMinDelay),
    timelockOpenExecutor: live.openExecutor, coordinatorPubKey: { x: pubKey.x, y: pubKey.y }, coordinatorPubKeySource: pubKey.source,
  };
  out.reusedFromV2 = { governor: live.governor, maci: live.maci, timelock: live.timelock };
  out.governanceDeployedAt = new Date().toISOString();
  out.status = { ...(out.status || {}), governance: "deployed; gatekeeper owner = new Safe; NFT owner still Safe (see 05 runbook)" };
  L.writeJson(manifestPath, out);

  console.log("  gas spent:", ethers.formatEther(startBal - (await ethers.provider.getBalance(deployerAddr))), "xDAI");
  console.log("  merged into", manifestPath);
  console.log("  NOTE: Supabase coordinator_key_generations is keyed by governor_address — re-key it or run the new ceremony (runbook §10.11).");
  return out;
}

module.exports = { run, readLive, RETIRED_SINGLE_OPERATOR_PUBKEY_X };

if (require.main === module) {
  run(hre).catch((e) => { console.error(e); process.exit(1); });
}
