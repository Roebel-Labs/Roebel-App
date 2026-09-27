/**
 * Deploy the PRODUCTION NSP-14 OrgRegistry on Gnosis (chain 100).
 *
 *   owner     = the Attester Safe (bands + one-time migrationRegister only; it can
 *               never touch an org's keys, roles or metadata)
 *   attesters = production AttesterNFTv2
 *   bands     = approval 50%/2/5, rejection 25%/2/5, revocation 67%/3/no cap
 *
 * The deployer key only pays gas and holds no power afterwards. Writes
 * deployments/org-registry.json. Refuses to redeploy if that record exists.
 *
 *   node -r dotenv/config scripts/deploy-org-registry.cjs [--dry-run] dotenv_config_path=<.env>
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const DRY = process.argv.includes("--dry-run");
const RECORD = path.resolve(__dirname, "../deployments/org-registry.json");
const V2 = require("../deployments/gnosis-v2.json");

const BANDS = {
  approval: { percentBps: 5000, floor: 2, cap: 5 },
  rejection: { percentBps: 2500, floor: 2, cap: 5 },
  revocation: { percentBps: 6700, floor: 3, cap: 65535 },
};

async function main() {
  if (fs.existsSync(RECORD)) throw new Error(`REFUSING: ${RECORD} exists — the production registry is already deployed.`);
  const raw = process.env.DEPLOYER_PRIVATE_KEY;
  if (!raw) throw new Error("DEPLOYER_PRIVATE_KEY missing");
  const provider = new ethers.JsonRpcProvider(process.env.GNOSIS_RPC_URL || "https://rpc.gnosischain.com");
  const net = await provider.getNetwork();
  if (net.chainId !== 100n) throw new Error(`REFUSING: chain ${net.chainId} is not Gnosis`);
  const wallet = new ethers.Wallet(raw.startsWith("0x") ? raw : "0x" + raw, provider);

  const owner = V2.addresses.ownerSafe;
  const attesterNft = V2.addresses.attesterNFT;
  for (const [name, a] of [["Attester Safe", owner], ["AttesterNFTv2", attesterNft]]) {
    if ((await provider.getCode(a)) === "0x") throw new Error(`${name} ${a} has no code`);
  }
  const attesters = new ethers.Contract(attesterNft, ["function attesterCount() view returns (uint256)"], provider);

  console.log(`deployer:       ${wallet.address}  (${ethers.formatEther(await provider.getBalance(wallet.address))} xDAI)`);
  console.log(`owner:          ${owner} (Attester Safe)`);
  console.log(`attester set:   ${attesterNft} (${await attesters.attesterCount()} attesters)`);
  if (DRY) return console.log("dry run: nothing sent.");

  const art = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../artifacts/contracts/verification-system/OrgRegistry.sol/OrgRegistry.json"), "utf8"),
  );
  const c = await new ethers.ContractFactory(art.abi, art.bytecode, wallet).deploy(
    owner,
    attesterNft,
    BANDS.approval,
    BANDS.rejection,
    BANDS.revocation,
  );
  const rcpt = await c.deploymentTransaction().wait();
  const address = await c.getAddress();
  const reg = new ethers.Contract(address, art.abi, provider);
  if ((await reg.owner()).toLowerCase() !== owner.toLowerCase()) throw new Error("owner mismatch after deploy");

  fs.writeFileSync(
    RECORD,
    JSON.stringify(
      {
        network: "gnosis",
        chainId: 100,
        deployedAt: new Date().toISOString(),
        deployer: wallet.address,
        orgRegistry: address,
        deployBlock: rcpt.blockNumber,
        txHash: rcpt.hash,
        owner,
        attesterNFT: attesterNft,
        bands: BANDS,
        migrationFinalized: false,
        note: "NSP-14. Owner may only tune bands and run migrationRegister until finalizeMigration(); hand ownership to the Timelock after bootstrap.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`✓ OrgRegistry ${address} (block ${rcpt.blockNumber})\nrecord: ${RECORD}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
