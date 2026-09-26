/**
 * Shared helpers for the v3 identity/governance cutover scripts.
 *
 * Every script in this folder:
 *   - is env-driven (no CLI args; `hardhat run` does not forward them),
 *   - never embeds a key (the deployer comes from hardhat's DEPLOYER_PRIVATE_KEY config),
 *   - refuses chain 100 unless CONFIRM_MAINNET=yes-i-mean-it,
 *   - exports `run(hre, opts)` so rehearse.cjs can chain them in ONE hardhat process
 *     (a forked hardhat network only lives as long as its process).
 */
const fs = require("fs");
const path = require("path");

const CONFIRM_VALUE = "yes-i-mean-it";
const ROOT = path.resolve(__dirname, "../..");
const V2_MANIFEST = path.join(ROOT, "deployments/gnosis-v2.json");
const DEFAULT_V3_MANIFEST = path.join(ROOT, "deployments/gnosis-v3.json");
const DEFAULT_OUT_DIR = path.join(ROOT, "deployments/v3-safe-txs");

// Canonical MultiSendCallOnly deployments on Gnosis (safe-global/safe-deployments), both with
// code on Gnosis (checked 2026-09-26). The Transaction Builder JSON itself is version-agnostic
// (plain {to,value,data} list); the Safe UI picks the MultiSend matching the Safe's version.
// Both libraries are stateless and delegatecalled, so either works with a 1.4.1 or 1.5.0 Safe
// (rehearse.cjs --real-safe executes batches through both against the real 1.5.0 Safe).
const SAFE_MULTISEND_CALL_ONLY = "0x9641d764fc13c8B624c04430C7356C1C7C8102e2"; // v1.4.1
const SAFE_MULTISEND_CALL_ONLY_150 = "0xA83c336B20401Af773B6219BA5027174338D1836"; // v1.5.0
function multiSendCallOnlyFor(version) {
  return String(version).startsWith("1.5.") ? SAFE_MULTISEND_CALL_ONLY_150 : SAFE_MULTISEND_CALL_ONLY;
}
// The real new Attester Safe Max created on 2026-09-26 (Safe 1.5.0; 1-of-1 EOA at creation,
// members join later). A HINT only: every script still requires NEW_ATTESTER_SAFE explicitly.
const NEW_ATTESTER_SAFE_HINT = "0xbCAbbAA26420e0A4771808F9639D4176355E5d4B";
const SAFE_SENTINEL = "0x0000000000000000000000000000000000000001";

/**
 * Refuses to run against Gnosis mainnet (chain 100) unless the operator typed the
 * confirmation. A local hardhat fork reports chainId 31337, so rehearsals never need it.
 */
async function guardChain(hre, label) {
  const { chainId } = await hre.ethers.provider.getNetwork();
  const name = hre.network.name;
  if (!["hardhat", "localhost", "gnosis"].includes(name)) {
    throw new Error(`[${label}] refusing network "${name}" (expected hardhat fork, localhost or gnosis).`);
  }
  if (chainId === 100n) {
    if (process.env.CONFIRM_MAINNET !== CONFIRM_VALUE) {
      throw new Error(
        `[${label}] chain 100 (Gnosis mainnet) detected. This broadcasts real transactions. ` +
        `Re-run with CONFIRM_MAINNET=${CONFIRM_VALUE} only after the fork rehearsal passed.`
      );
    }
    console.log(`[${label}] *** GNOSIS MAINNET (chain 100) — CONFIRM_MAINNET given ***`);
  } else {
    console.log(`[${label}] chainId ${chainId} (${name}) — not mainnet`);
  }
  return { chainId, isMainnet: chainId === 100n };
}

function readJson(file) {
  if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n");
}

function v3ManifestPath(opts = {}) {
  return opts.manifest || process.env.V3_MANIFEST || DEFAULT_V3_MANIFEST;
}

function outDir(opts = {}) {
  return opts.outDir || process.env.V3_OUT_DIR || DEFAULT_OUT_DIR;
}

function requireEnvAddress(hre, name, value) {
  const v = value ?? process.env[name];
  if (!v) {
    const hint = name === "NEW_ATTESTER_SAFE" ? ` (Max's new Attester Safe is ${NEW_ATTESTER_SAFE_HINT}; pass it explicitly)` : "";
    throw new Error(`${name} is required${hint}`);
  }
  if (!hre.ethers.isAddress(v)) throw new Error(`${name} is not an address: ${v}`);
  const a = hre.ethers.getAddress(v);
  if (a === hre.ethers.ZeroAddress) throw new Error(`${name} is the zero address`);
  return a;
}

/**
 * Checks that `safe` is a Safe that satisfies Max's rule "at least 3-of-5":
 * threshold >= 3, >= 5 owners, no enabled modules (a module bypasses the threshold),
 * and (unless ALLOW_EOA_SAFE_OWNERS=yes) no plain-EOA owners (the spec wants the
 * attesters' passkey Safes as owners, never an EOA like the 1-of-4 0x3A08 has today).
 */
async function assertAttesterSafe(hre, safe, { minThreshold = 3, minOwners = 5 } = {}) {
  const { ethers } = hre;
  if ((await ethers.provider.getCode(safe)) === "0x") throw new Error(`Safe ${safe} has no code`);
  const s = new ethers.Contract(safe, [
    "function getThreshold() view returns (uint256)",
    "function getOwners() view returns (address[])",
    "function VERSION() view returns (string)",
    "function getModulesPaginated(address,uint256) view returns (address[],address)",
  ], ethers.provider);
  let threshold, owners, version;
  try {
    [threshold, owners, version] = await Promise.all([s.getThreshold(), s.getOwners(), s.VERSION()]);
  } catch (e) {
    throw new Error(`${safe} does not answer getThreshold/getOwners/VERSION — not a Safe? (${e.shortMessage || e.message})`);
  }
  owners = [...owners].map((o) => ethers.getAddress(o));
  if (threshold < BigInt(minThreshold)) {
    throw new Error(`Safe ${safe} threshold is ${threshold}; Max's rule is at least ${minThreshold}-of-${minOwners}. Refusing.`);
  }
  if (owners.length < minOwners) {
    throw new Error(`Safe ${safe} has ${owners.length} owners; Max's rule is at least ${minThreshold}-of-${minOwners}. Refusing.`);
  }
  const [modules] = await s.getModulesPaginated(SAFE_SENTINEL, 10);
  if (modules.length && process.env.ALLOW_SAFE_MODULES !== "yes") {
    throw new Error(`Safe ${safe} has enabled modules ${modules.join(", ")} (they bypass the threshold). Set ALLOW_SAFE_MODULES=yes only if audited.`);
  }
  // A contract owner may be a passkey Safe OR (during the transition) an attester's legacy
  // thirdweb smart account; both have code. A COUNTERFACTUAL thirdweb account has no code
  // yet and is counted as an EOA here: deploy it (AccountFactory.createAccount) first.
  const eoaOwners = [];
  for (const o of owners) if ((await ethers.provider.getCode(o)) === "0x") eoaOwners.push(o);
  if (eoaOwners.length && process.env.ALLOW_EOA_SAFE_OWNERS !== "yes") {
    throw new Error(`Safe ${safe} has plain-EOA owners ${eoaOwners.join(", ")}; the spec wants passkey Safes only. Set ALLOW_EOA_SAFE_OWNERS=yes to override.`);
  }
  console.log(`  Safe ${safe}: v${version}, ${threshold}-of-${owners.length}, modules=${modules.length}, eoaOwners=${eoaOwners.length}`);
  return { threshold, owners, version, modules, eoaOwners };
}

/**
 * Reconstructs the current holder set of an ERC-721 from Transfer logs (mint = from 0,
 * burn = to 0). Adaptive paging: public RPCs cap eth_getLogs by block range and result
 * size (publicnode caps ranges well below rpc.gnosischain.com, and sometimes returns
 * null/empty on overload — MACI runbook §10.1), so a failing window is halved and retried.
 */
async function holdersFromLogs(provider, address, { fromBlock, toBlock, chunk = 200_000, minChunk = 1_000, retries = 4 } = {}) {
  const { id, getAddress, ZeroAddress } = require("ethers");
  const topic = id("Transfer(address,address,uint256)");
  const latest = toBlock ?? (await provider.getBlockNumber());
  const owner = new Map(); // tokenId → owner
  let from = fromBlock;
  let size = chunk;
  let calls = 0;
  while (from <= latest) {
    const to = Math.min(from + size - 1, latest);
    let logs;
    let attempt = 0;
    for (;;) {
      try {
        logs = await provider.getLogs({ address, topics: [topic], fromBlock: from, toBlock: to });
        if (!Array.isArray(logs)) throw new Error("non-array getLogs result");
        break;
      } catch (e) {
        attempt++;
        if (size > minChunk) { size = Math.max(minChunk, Math.floor(size / 2)); break; }
        if (attempt > retries) throw new Error(`getLogs ${from}-${to} failed after ${retries} retries: ${e.shortMessage || e.message}`);
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    if (!logs) continue; // window shrank; retry the same `from` with the smaller size
    calls++;
    for (const l of logs) {
      const recipient = getAddress("0x" + l.topics[2].slice(26));
      const tokenId = BigInt(l.topics[3]);
      if (recipient === ZeroAddress) owner.delete(tokenId);
      else owner.set(tokenId, recipient);
    }
    from = to + 1;
  }
  return { holders: [...new Set(owner.values())], tokenOwners: owner, scannedTo: latest, calls };
}

// ---------------------------------------------------------------------------
// Safe Transaction Builder JSON (safe-global/safe-react-apps tx-builder format)
// ---------------------------------------------------------------------------

function _serialize(json) {
  const rep = (_, v) => (v === undefined ? null : v);
  if (Array.isArray(json)) return `[${json.map((el) => _serialize(el)).join(",")}]`;
  if (typeof json === "object" && json !== null) {
    const keys = Object.keys(json).sort();
    let acc = `{${JSON.stringify(keys, rep)}`;
    for (const k of keys) acc += `${_serialize(json[k])},`;
    return `${acc}}`;
  }
  return `${JSON.stringify(json, rep)}`;
}

/** Same checksum the Transaction Builder computes (meta.name is nulled before hashing). */
function txBuilderChecksum(batch) {
  const { solidityPackedKeccak256 } = require("ethers");
  return solidityPackedKeccak256(["string"], [_serialize({ ...batch, meta: { ...batch.meta, name: null } })]);
}

/**
 * @param txs [{ to, value?, data, method?, note? }] — `data` is authoritative; `method`
 *   is informational (the Transaction Builder uses raw `data` when contractMethod is null).
 */
function safeBatch({ chainId, safe, name, description, txs, extra = {} }) {
  const batch = {
    version: "1.0",
    chainId: String(chainId),
    createdAt: Date.now(),
    meta: {
      name,
      description,
      txBuilderVersion: "1.16.5",
      createdFromSafeAddress: safe,
      createdFromOwnerAddress: "",
    },
    transactions: txs.map((t) => ({
      to: t.to,
      value: String(t.value ?? 0),
      data: t.data,
      contractMethod: null,
      contractInputsValues: null,
    })),
  };
  batch.meta.checksum = txBuilderChecksum(batch);
  // Non-standard, ignored by the Transaction Builder; read by rehearse.cjs and humans.
  batch.x_roebel = { ...extra, calls: txs.map((t) => ({ to: t.to, method: t.method, note: t.note, gasEstimate: t.gasEstimate })) };
  return batch;
}

/** Encodes a Transaction Builder batch into the single Safe tx the Safe UI would sign. */
function batchToSafeTx(ethersLib, batch, multiSendCallOnly = SAFE_MULTISEND_CALL_ONLY) {
  const txs = batch.transactions;
  if (txs.length === 1) return { to: txs[0].to, value: BigInt(txs[0].value), data: txs[0].data, operation: 0 };
  const packed = ethersLib.concat(txs.map((t) => ethersLib.solidityPacked(
    ["uint8", "address", "uint256", "uint256", "bytes"],
    [0, t.to, BigInt(t.value), ethersLib.dataLength(t.data), t.data]
  )));
  const iface = new ethersLib.Interface(["function multiSend(bytes transactions)"]);
  return { to: multiSendCallOnly, value: 0n, data: iface.encodeFunctionData("multiSend", [packed]), operation: 1 };
}

module.exports = {
  CONFIRM_VALUE, ROOT, V2_MANIFEST, DEFAULT_V3_MANIFEST, DEFAULT_OUT_DIR, SAFE_MULTISEND_CALL_ONLY,
  SAFE_MULTISEND_CALL_ONLY_150, multiSendCallOnlyFor, NEW_ATTESTER_SAFE_HINT,
  guardChain, readJson, writeJson, v3ManifestPath, outDir, requireEnvAddress, assertAttesterSafe,
  holdersFromLogs, safeBatch, batchToSafeTx, txBuilderChecksum,
};
