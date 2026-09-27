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
 *   node scripts/org-registry-batch-register.cjs --registry 0x… --from-block N [--only uuid,uuid] [--send]
 *
 * --only restricts to the given org uuids (recommended: pass exactly the orgs you
 * created Safes for). Never registers a claim whose Safe has no code.
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const orgIdOf = (uuid) => ethers.id(`netizen:org:v1:${uuid.trim().toLowerCase()}`);

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
  if (only) {
    for (const [id, uuid] of only) if (!rows.some((r) => r.orgId === id)) console.log(`  – ${uuid}: no open claim (not created yet, or already registered)`);
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
