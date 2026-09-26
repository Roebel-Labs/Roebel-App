/**
 * v3 cutover, step 2: build the bootstrap Safe transactions. READ-ONLY: this script never
 * sends a transaction. The new Attester Safe signs the files it writes.
 *
 * What it does
 *  1. Rebuilds the CURRENT v2 holder sets from v2 Transfer logs (adaptive paging, see
 *     lib.holdersFromLogs), then cross-checks each holder with hasCitizenNFT/hasAttesterNFT
 *     and the totals with citizenCount()/attesterCount(). Any mismatch aborts.
 *  2. Drops holders already bootstrapped into v3 (hasEverHeld… or movedTo), so re-running
 *     after a partial execution only emits the delta. bootstrapFromV2 skips them anyway.
 *  3. Splits the rest into bootstrapFromV2 calls of BATCH_SIZE addresses (default 20),
 *     estimates gas for each call FROM the Safe, and packs calls into Safe Transaction
 *     Builder files so each Safe tx stays under MAX_GAS_PER_SAFE_TX (default 8,000,000;
 *     the Gnosis block gas limit is ~17M).
 *        <outDir>/02-bootstrap-part-<n>.json         → sign + execute now, in order
 *        <outDir>/02-LATER-finalize-bootstrap.json    → do NOT execute yet (see below)
 *        <outDir>/02-bootstrap-summary.json           → holder lists + scan block, for review
 *
 * When to execute 02-LATER-finalize-bootstrap.json
 *   finalizeBootstrap() is one-way: after it the owner can never mint again. Execute it only
 *   after ALL of:
 *     a) every bootstrap part executed and a re-run of this script reports
 *        "delta: 0 attesters, 0 citizens" and v3 counts == v2 counts;
 *     b) new v2 attestations are frozen (app surfaces v3 only), so no citizen can appear on
 *        v2 after the last bootstrap and be stranded;
 *     c) the app has been reading v3 in production for a while (RE-POINT-CHECKLIST step 4)
 *        and nobody reports a missing citizenship.
 *   Until then, keeping bootstrap open costs nothing: only the Safe can call it and it can
 *   only mint to addresses that hold v2 today.
 *
 * Env: V3_MANIFEST (default deployments/gnosis-v3.json), V3_OUT_DIR, V2_FROM_BLOCK
 *   (default 46_800_000; v2 NFTs were deployed 2026-06-24, before MACI block 46,867,803),
 *   LOG_CHUNK (default 200_000; rpc.gnosischain.com accepts 500k; publicnode needs far less —
 *   the pager halves automatically), BATCH_SIZE, MAX_GAS_PER_SAFE_TX, SAFE_CHAIN_ID (default 100).
 *
 *   npx hardhat run scripts/v3-cutover/02-bootstrap-calldata.cjs --network gnosis   (+ CONFIRM_MAINNET)
 */
require("dotenv").config();
const path = require("path");
const hre = require("hardhat");
const L = require("./lib.cjs");

async function run(hre, opts = {}) {
  const { ethers } = hre;
  await L.guardChain(hre, "02-bootstrap-calldata");
  const v3 = L.readJson(L.v3ManifestPath(opts));
  const safe = ethers.getAddress(v3.addresses.ownerSafe);
  const out = L.outDir(opts);
  const fromBlock = Number(opts.fromBlock ?? process.env.V2_FROM_BLOCK ?? 46_800_000);
  const chunk = Number(process.env.LOG_CHUNK || 200_000);
  const batchSize = Number(opts.batchSize ?? process.env.BATCH_SIZE ?? 20);
  const maxGas = BigInt(process.env.MAX_GAS_PER_SAFE_TX || 8_000_000);
  const safeChainId = Number(process.env.SAFE_CHAIN_ID || 100);

  const attV2 = new ethers.Contract(v3.addresses.attesterNFTv2, [
    "function hasAttesterNFT(address) view returns (bool)", "function attesterCount() view returns (uint256)",
  ], ethers.provider);
  const citV2 = new ethers.Contract(v3.addresses.citizenNFTv2, [
    "function hasCitizenNFT(address) view returns (bool)", "function citizenCount() view returns (uint256)",
  ], ethers.provider);
  const att = await ethers.getContractAt("AttesterNFTv3", v3.addresses.attesterNFT);
  const cit = await ethers.getContractAt("CitizenNFTv3", v3.addresses.citizenNFT);
  if (await att.bootstrapFinalized() || await cit.bootstrapFinalized()) {
    throw new Error("bootstrap already finalized on v3 — nothing to do.");
  }

  // Pin one block for logs AND state checks, so both views describe the same moment.
  const toBlock = await ethers.provider.getBlockNumber();
  console.log(`  scanning v2 Transfer logs ${fromBlock}..${toBlock} (chunk ${chunk})`);
  const aScan = await L.holdersFromLogs(ethers.provider, v3.addresses.attesterNFTv2, { fromBlock, toBlock, chunk });
  const cScan = await L.holdersFromLogs(ethers.provider, v3.addresses.citizenNFTv2, { fromBlock, toBlock, chunk });
  console.log(`  logs: ${aScan.holders.length} attesters (${aScan.calls} calls), ${cScan.holders.length} citizens (${cScan.calls} calls)`);

  const tag = { blockTag: toBlock };
  for (const a of aScan.holders) if (!(await attV2.hasAttesterNFT(a, tag))) throw new Error(`log holder ${a} has no AttesterNFTv2`);
  for (const c of cScan.holders) if (!(await citV2.hasCitizenNFT(c, tag))) throw new Error(`log holder ${c} has no CitizenNFTv2`);
  const [aCount, cCount] = [await attV2.attesterCount(tag), await citV2.citizenCount(tag)];
  if (BigInt(aScan.holders.length) !== aCount || BigInt(cScan.holders.length) !== cCount) {
    throw new Error(`log reconstruction (${aScan.holders.length}/${cScan.holders.length}) != on-chain counts (${aCount}/${cCount}). ` +
      "Lower V2_FROM_BLOCK or LOG_CHUNK and retry; never bootstrap from a partial list.");
  }
  console.log(`  cross-check OK: v2 attesterCount=${aCount}, citizenCount=${cCount}`);

  const pending = async (c, list, everHeld) => {
    const res = [];
    for (const h of list) {
      if (await c[everHeld](h)) continue;
      if ((await c.movedTo(h)) !== ethers.ZeroAddress) continue;
      res.push(h);
    }
    return res;
  };
  const aTodo = await pending(att, aScan.holders, "hasEverHeldAttesterNFT");
  const cTodo = await pending(cit, cScan.holders, "hasEverHeldCitizenNFT");
  console.log(`  delta: ${aTodo.length} attesters, ${cTodo.length} citizens to bootstrap`);

  const calls = [];
  const addCalls = async (contract, label, list) => {
    for (let i = 0; i < list.length; i += batchSize) {
      const slice = list.slice(i, i + batchSize);
      const data = contract.interface.encodeFunctionData("bootstrapFromV2", [slice]);
      const to = await contract.getAddress();
      const gasEstimate = await ethers.provider.estimateGas({ from: safe, to, data });
      calls.push({ to, data, method: `${label}.bootstrapFromV2(${slice.length})`, note: slice.join(","), gasEstimate: gasEstimate.toString(), gas: gasEstimate });
    }
  };
  await addCalls(att, "AttesterNFTv3", aTodo);
  await addCalls(cit, "CitizenNFTv3", cTodo);

  // Pack calls into Safe txs under the gas budget (+ ~20% headroom for MultiSend + Safe overhead).
  const parts = [];
  let cur = [], curGas = 0n;
  for (const c of calls) {
    const g = (c.gas * 12n) / 10n;
    if (g > maxGas) throw new Error(`${c.method} needs ~${g} gas > MAX_GAS_PER_SAFE_TX; lower BATCH_SIZE`);
    if (cur.length && curGas + g > maxGas) { parts.push(cur); cur = []; curGas = 0n; }
    cur.push(c); curGas += g;
  }
  if (cur.length) parts.push(cur);

  const files = [];
  parts.forEach((txs, i) => {
    const f = path.join(out, `02-bootstrap-part-${i + 1}.json`);
    const total = txs.reduce((s, t) => s + t.gas, 0n);
    L.writeJson(f, L.safeBatch({
      chainId: safeChainId, safe,
      name: `v3 bootstrap part ${i + 1}/${parts.length}`,
      description: `bootstrapFromV2 into v3 (scan block ${toBlock}); estimated gas ${total}. Execute parts in order.`,
      txs: txs.map(({ gas, ...t }) => t),
      extra: { step: "02-bootstrap", part: i + 1, of: parts.length, scanBlock: toBlock, estimatedGas: total.toString() },
    }));
    files.push(f);
  });

  const finalizeTxs = [
    { to: v3.addresses.attesterNFT, data: att.interface.encodeFunctionData("finalizeBootstrap"), method: "AttesterNFTv3.finalizeBootstrap()" },
    { to: v3.addresses.citizenNFT, data: cit.interface.encodeFunctionData("finalizeBootstrap"), method: "CitizenNFTv3.finalizeBootstrap()" },
  ];
  const finalizeFile = path.join(out, "02-LATER-finalize-bootstrap.json");
  L.writeJson(finalizeFile, L.safeBatch({
    chainId: safeChainId, safe,
    name: "v3 finalizeBootstrap (ONE-WAY — run LAST)",
    description: "One-way: the owner can never mint again. Only after a re-run of 02 shows delta 0, v3 counts == v2 counts, " +
      "v2 attestations are frozen and the app has read v3 in production. See 02-bootstrap-calldata.cjs header.",
    txs: finalizeTxs,
    extra: { step: "02-finalize", preconditions: ["delta 0", "v3 counts == v2 counts", "v2 attestation frozen", "app reads v3"] },
  }));

  const summaryFile = path.join(out, "02-bootstrap-summary.json");
  L.writeJson(summaryFile, {
    generatedAt: new Date().toISOString(), scanBlock: toBlock, fromBlock, safe,
    v2: { attesterCount: aCount, citizenCount: cCount, attesters: aScan.holders, citizens: cScan.holders },
    delta: { attesters: aTodo, citizens: cTodo }, parts: files.map((f) => path.basename(f)),
  });

  console.log(`  wrote ${files.length} bootstrap part(s), the LATER finalize file and a summary to ${out}`);
  for (const c of calls) console.log(`    ${c.method}  gas≈${c.gasEstimate}`);
  if (!calls.length) console.log("  nothing left to bootstrap. If v3 counts == v2 counts, finalize can be scheduled.");
  return { files, finalizeFile, summaryFile, attesters: aScan.holders, citizens: cScan.holders, delta: { aTodo, cTodo }, scanBlock: toBlock };
}

module.exports = { run };

if (require.main === module) {
  run(hre).catch((e) => { console.error(e); process.exit(1); });
}
