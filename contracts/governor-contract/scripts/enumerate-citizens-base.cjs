/**
 * Enumerate the CURRENT Roebel citizen + attester sets from the live Base
 * production contracts, and diff them against the Gnosis snapshot (gnosis.json)
 * to surface the post-2026-06-17 "stragglers" that must be re-issued on the
 * fresh Gnosis v2 deployment.
 *
 *   BASE_RPC_URL=https://mainnet.base.org node scripts/enumerate-citizens-base.cjs
 *
 * Read-only. Writes deployments/base-citizen-set.json.
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const CITIZEN_NFT = "0x7eF8308129C47E31415BEfC210aCEbD8ae6861BB";
const ATTESTER_NFT = "0x79B837b269f3EB3FB1c5856fE1E21675F05a3aFb";

// Gnosis snapshot (2026-06-17) — from contracts/governor-contract/deployments/gnosis.json
const GNOSIS_CITIZENS = [
  "0xC49dE63CcfeE46C6C5c3E393293f66779799Fb28", "0x90F677dC480e76a127Ec1dCE42263a370e396313",
  "0xf468d87FCa0E15bC2c383eF482D38b9b77812b29", "0xCa598EcD6541177897c7a30cE378e53F5557e951",
  "0xD7cA07c0F152fC27F0E48d5326e07026e4fDD4bA", "0x3B49287F15F5605036d135A296C2bAC2aFbFA24c",
  "0xEbf3C1694FBD80b1a7ab8F82e19A1291Cd795227", "0x466587C1102a99726b2751712c69338cf0401f43",
  "0x5Ddf5ee5ac3b5DeB9eae2920E71997e2a07A406B", "0xa6B3defbBe135f3fcE045e59b3e984c23d43E5a8",
  "0x1a3cD237400b032DCfB3d45Ef694674f2dEcdee0", "0x2645530306321e4758FF93559A4F44a826C6EfA6",
  "0x1916bAC01118EE53A7F7eca0F312431b68011Ce4", "0xd1A7d945fCCa08f67E30E526E34cf4Aaa2725D03",
  "0x0e9C37cfc94E1BAFCd53450998Cc26d10A6b5D20",
].map((a) => ethers.getAddress(a));
const GNOSIS_ATTESTERS = [
  "0xC49dE63CcfeE46C6C5c3E393293f66779799Fb28", "0x90F677dC480e76a127Ec1dCE42263a370e396313",
  "0xf468d87FCa0E15bC2c383eF482D38b9b77812b29", "0xD7cA07c0F152fC27F0E48d5326e07026e4fDD4bA",
  "0x3B49287F15F5605036d135A296C2bAC2aFbFA24c",
].map((a) => ethers.getAddress(a));

const MINTED_TOPICS = {
  citizen: ethers.id("CitizenNFTMinted(address,uint256,uint256)"),
  attester: ethers.id("AttesterNFTMinted(address,uint256,uint256)"),
};
const HAS_ABI = ["function hasCitizenNFT(address) view returns (bool)", "function hasAttesterNFT(address) view returns (bool)"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn) {
  for (let i = 0; i < 8; i++) {
    try { return await fn(); }
    catch (e) {
      const over = e?.info?.error?.code === -32016 || /rate limit|429/i.test(e?.message || "");
      if (!over || i === 7) throw e;
      await sleep(1000 * (i + 1));
    }
  }
}

async function findDeployBlock(provider, address, lo, hi) {
  const hiCode = await provider.getCode(address, hi);
  if (hiCode === "0x") throw new Error(`${address} has no code at head — wrong address?`);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const code = await provider.getCode(address, mid);
    if (code !== "0x") hi = mid; else lo = mid + 1;
  }
  return lo;
}

async function getMintedAddresses(provider, address, topic, fromBlock, toBlock) {
  const seen = new Set();
  let span = 100_000;
  let start = fromBlock;
  while (start <= toBlock) {
    const end = Math.min(start + span - 1, toBlock);
    try {
      const logs = await withRetry(() => provider.getLogs({ address, topics: [topic], fromBlock: start, toBlock: end }));
      for (const log of logs) seen.add(ethers.getAddress(ethers.dataSlice(log.topics[1], 12)));
      start = end + 1;
      await sleep(120);
    } catch (e) {
      if (span > 2_000) { span = Math.floor(span / 2); continue; }
      throw e;
    }
  }
  return [...seen];
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const head = await provider.getBlockNumber();
  console.log("Base head block:", head);

  const citizenNFT = new ethers.Contract(CITIZEN_NFT, HAS_ABI, provider);
  const attesterNFT = new ethers.Contract(ATTESTER_NFT, HAS_ABI, provider);

  // Deploy blocks discovered once (2026-05-23 NFT rotation); override via env to re-discover.
  const cFrom = Number(process.env.BASE_CITIZEN_FROM || 46_387_040);
  const aFrom = Number(process.env.BASE_ATTESTER_FROM || 46_387_039);
  console.log("  CitizenNFT from block", cFrom, "| AttesterNFT from block", aFrom);

  const citizenCandidates = await getMintedAddresses(provider, CITIZEN_NFT, MINTED_TOPICS.citizen, cFrom, head);
  const attesterCandidates = await getMintedAddresses(provider, ATTESTER_NFT, MINTED_TOPICS.attester, aFrom, head);
  console.log(`Mint events → ${citizenCandidates.length} citizen candidates, ${attesterCandidates.length} attester candidates`);

  // Authoritative current holders: filter candidates by on-chain hasX (handles revocations).
  // Rate-limit friendly: retry on -32016 and pace the calls.
  const citizens = [];
  for (const a of citizenCandidates) {
    if (await withRetry(() => citizenNFT.hasCitizenNFT(a))) citizens.push(a);
    await sleep(120);
  }
  const attesters = [];
  for (const a of attesterCandidates) {
    if (await withRetry(() => attesterNFT.hasAttesterNFT(a))) attesters.push(a);
    await sleep(120);
  }

  const gC = new Set(GNOSIS_CITIZENS), gA = new Set(GNOSIS_ATTESTERS);
  const citizenStragglers = citizens.filter((a) => !gC.has(a));
  const attesterStragglers = attesters.filter((a) => !gA.has(a));
  const droppedFromGnosis = GNOSIS_CITIZENS.filter((a) => !citizens.includes(a)); // on Gnosis but revoked on Base

  const out = {
    enumeratedAt: new Date().toISOString(),
    baseHead: head,
    contracts: { citizenNFT: CITIZEN_NFT, attesterNFT: ATTESTER_NFT },
    counts: {
      baseCitizens: citizens.length, baseAttesters: attesters.length,
      gnosisCitizens: GNOSIS_CITIZENS.length, gnosisAttesters: GNOSIS_ATTESTERS.length,
      citizenStragglers: citizenStragglers.length, attesterStragglers: attesterStragglers.length,
    },
    citizens, attesters,
    citizenStragglers, attesterStragglers, droppedFromGnosis,
  };
  const outFile = path.resolve(__dirname, "../deployments/base-citizen-set.json");
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));

  console.log("\n=== RESULT ===");
  console.log(`Current Base citizens:  ${citizens.length} (Gnosis snapshot had ${GNOSIS_CITIZENS.length})`);
  console.log(`Current Base attesters: ${attesters.length} (Gnosis snapshot had ${GNOSIS_ATTESTERS.length})`);
  console.log(`Citizen stragglers (on Base, NOT yet on Gnosis): ${citizenStragglers.length}`);
  citizenStragglers.forEach((a) => console.log("   +", a));
  console.log(`Attester stragglers: ${attesterStragglers.length}`);
  attesterStragglers.forEach((a) => console.log("   +", a));
  if (droppedFromGnosis.length) {
    console.log(`On Gnosis but NO LONGER a citizen on Base (revoked since snapshot): ${droppedFromGnosis.length}`);
    droppedFromGnosis.forEach((a) => console.log("   -", a));
  }
  console.log("\nWritten:", outFile);
}

main().catch((e) => { console.error(e); process.exit(1); });
