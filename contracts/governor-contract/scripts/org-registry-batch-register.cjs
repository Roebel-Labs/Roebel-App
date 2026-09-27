/**
 * NSP-14 bootstrap: register every org Safe that has applied (from the app's
 * "Safe erstellen") in ONE owner transaction — `migrationRegister` — instead of
 * attesters approving each org one by one.
 *
 * Reads the registry's open RegistrationRequested claims, keeps the newest open
 * claim per org id, drops ids that are already registered, and prints a review
 * table (org id, Safe, its owners). Then:
 *
 *   production (owner = Attester Safe): writes a Safe{Wallet} Transaction Builder
 *     JSON — import it at app.safe.global → Apps → Transaction Builder, check the
 *     table against the app, collect the signatures.
 *   test env (owner = burner): --send submits directly.
 *
 *   node scripts/org-registry-batch-register.cjs --registry 0x… --from-block N [--only uuid,uuid] [--predict orgs.json] [--send]
 *
 * --predict orgs.json: [{ "uuid": "…", "owners": ["0x…"] }] — also finds Safes the
 * app's bulk action deployed WITHOUT a registration request, at their CREATE2
 * address (same formula as apps/expo/lib/org-safe/ops.ts predictOrgSafeAddress).
 *
 * Only KNOWN orgs are registered: those named in --only or --predict. A claim for
 * an org id nobody named (anyone can file one — e.g. a squatter) is listed as
 * skipped; --all-claims includes them deliberately. Never registers a claim whose
 * Safe has no code.
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const orgIdOf = (uuid) => ethers.id(`netizen:org:v1:${uuid.trim().toLowerCase()}`);

// Safe 1.4.1 on Gnosis — identical to the app's org-Safe builder.
const SAFE_L2_SINGLETON = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
const SAFE_PROXY_FACTORY = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
const FALLBACK_HANDLER = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99";
const setupIface = new ethers.Interface([
  "function setup(address[] _owners,uint256 _threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address paymentReceiver)",
]);

/** predictOrgSafeAddress: owners checksummed, de-duplicated, sorted; threshold 1; salt = orgId. */
async function predictOrgSafe(provider, orgId, owners) {
  const list = [...new Map(owners.map((o) => [o.toLowerCase(), ethers.getAddress(o)])).values()].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );
  const initializer = setupIface.encodeFunctionData("setup", [
    list, 1, ethers.ZeroAddress, "0x", FALLBACK_HANDLER, ethers.ZeroAddress, 0, ethers.ZeroAddress,
  ]);
  const factory = new ethers.Contract(SAFE_PROXY_FACTORY, ["function proxyCreationCode() pure returns (bytes)"], provider);
  const salt = ethers.keccak256(ethers.solidityPacked(["bytes32", "uint256"], [ethers.keccak256(initializer), BigInt(orgId)]));
  const initCode = ethers.concat([await factory.proxyCreationCode(), ethers.zeroPadValue(SAFE_L2_SINGLETON, 32)]);
  return ethers.getCreate2Address(SAFE_PROXY_FACTORY, salt, ethers.keccak256(initCode));
}

async function main() {
  const registryAddr = arg("registry");
  const fromBlock = Number(arg("from-block") ?? 0);
  if (!registryAddr) throw new Error("--registry required");
  const only = arg("only") ? new Map(arg("only").split(",").map((u) => [orgIdOf(u), u.trim()])) : null;

  const provider = new ethers.JsonRpcProvider(process.env.GNOSIS_RPC_URL || "https://rpc.gnosischain.com");
  const art = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../artifacts/contracts/verification-system/OrgRegistry.sol/OrgRegistry.json"), "utf8"),
  );
  const registry = new ethers.Contract(registryAddr, art.abi, provider);
  const safeAbi = ["function getOwners() view returns (address[])"];

  const head = await provider.getBlockNumber();
  const claims = new Map(); // orgId -> { requestId, safe }
  for (let from = fromBlock; from <= head; from += 10_000) {
    const to = Math.min(head, from + 9_999);
    for (const log of await registry.queryFilter(registry.filters.RegistrationRequested(), from, to)) {
      claims.set(log.args.orgId, { requestId: log.args.requestId, safe: log.args.safe });
    }
  }

  // Deploy-only Safes from the bulk action: no request event, found by prediction.
  const predictFile = arg("predict");
  const predicted = new Map(); // orgId -> { uuid, safe }
  if (predictFile) {
    for (const o of JSON.parse(fs.readFileSync(predictFile, "utf8"))) {
      const orgId = orgIdOf(o.uuid);
      const safe = await predictOrgSafe(provider, orgId, o.owners);
      predicted.set(orgId, { uuid: o.uuid, safe });
      if (only && !only.has(orgId)) only.set(orgId, o.uuid);
    }
  }

  const rows = [];
  for (const [orgId, c] of claims) {
    if (only && !only.has(orgId)) continue;
    if (await registry.isRegistered(orgId)) continue;
    const req = await registry.getRequest(c.requestId);
    if (Number(req.status) !== 0) continue; // only still-pending claims
    if ((await provider.getCode(c.safe)) === "0x") continue;
    if ((await registry.orgIdOfSafe(c.safe)) !== ethers.ZeroHash) continue;
    const owners = await new ethers.Contract(c.safe, safeAbi, provider).getOwners();
    rows.push({ orgId, uuid: only?.get(orgId) ?? "?", safe: c.safe, owners, uri: req.uri });
  }
  for (const [orgId, p] of predicted) {
    if (rows.some((r) => r.orgId === orgId)) continue;
    if (await registry.isRegistered(orgId)) continue;
    if ((await provider.getCode(p.safe)) === "0x") continue;
    if ((await registry.orgIdOfSafe(p.safe)) !== ethers.ZeroHash) continue;
    const owners = await new ethers.Contract(p.safe, safeAbi, provider).getOwners();
    rows.push({ orgId, uuid: p.uuid, safe: p.safe, owners, uri: "" });
  }
  if (only) {
    for (const [id, uuid] of only) if (!rows.some((r) => r.orgId === id)) console.log(`  – ${uuid}: no open claim (not created yet, or already registered)`);
  }
  const unknown = rows.filter((r) => r.uuid === "?");
  if (unknown.length && !process.argv.includes("--all-claims")) {
    console.log(`\nskipped ${unknown.length} claim(s) for org ids not named in --only/--predict (pass --all-claims to include):`);
    for (const r of unknown) console.log(`  ${r.orgId}  safe ${r.safe}`);
    rows.splice(0, rows.length, ...rows.filter((r) => r.uuid !== "?"));
  }
  if (rows.length === 0) return console.log("nothing to register.");

  console.log(`\n${rows.length} org Safe(s) to register:`);
  for (const r of rows) console.log(`  ${r.uuid}  safe ${r.safe}  owners ${r.owners.length}: ${r.owners.join(", ")}`);

  const args = [rows.map((r) => r.orgId), rows.map((r) => r.safe), rows.map((r) => r.uri), rows.map(() => ethers.ZeroHash)];
  const data = registry.interface.encodeFunctionData("migrationRegister", args);
  const owner = await registry.owner();

  if (process.argv.includes("--send")) {
    const raw = process.env.DEPLOYER_PRIVATE_KEY;
    const wallet = new ethers.Wallet(raw.startsWith("0x") ? raw : "0x" + raw, provider);
    if (wallet.address.toLowerCase() !== owner.toLowerCase()) {
      throw new Error(`REFUSING --send: registry owner is ${owner} (a Safe?) — use the Transaction Builder file instead.`);
    }
    const tx = await wallet.sendTransaction({ to: registryAddr, data });
    await tx.wait();
    return console.log(`✓ registered ${rows.length} org(s): ${tx.hash}`);
  }

  const out = path.resolve(process.cwd(), `org-registry-migration-${Date.now()}.json`);
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        version: "1.0",
        chainId: "100",
        createdAt: Date.now(),
        meta: {
          name: `NSP-14 migrationRegister (${rows.length} orgs)`,
          description: "Registers org Safes created in the Röbel app. Review every Safe against the app first.",
          createdFromSafeAddress: owner,
        },
        transactions: [{ to: registryAddr, value: "0", data }],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`\nTransaction Builder file (owner ${owner}): ${out}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
