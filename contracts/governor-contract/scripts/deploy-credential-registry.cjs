/**
 * Deploy the PRODUCTION CredentialRegistry on Gnosis (chain 100).
 *
 *   owner   = the Attester Safe (gnosis-v2.json addresses.ownerSafe): recognition,
 *             reserved-type metadata, COMMUNITY types and the delayed source swap.
 *             It can never issue, revoke or claim inside an org's namespace.
 *   sources = production CitizenNFTv2, AttesterNFTv2 and OrgRegistry (org-registry.json)
 *   reservedURIs = metadata of Citizen, Attester and Guest, in that order (--uris, required)
 *
 * The deployer key only pays gas and holds no power afterwards. Writes
 * deployments/credential-registry.json. Refuses to redeploy if that record exists.
 *
 *   node -r dotenv/config scripts/deploy-credential-registry.cjs --uris <citizen>,<attester>,<guest> [--dry-run] dotenv_config_path=<.env>
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const DRY = process.argv.includes("--dry-run");
const RECORD = path.resolve(__dirname, "../deployments/credential-registry.json");
const V2 = require("../deployments/gnosis-v2.json");
const ORGS = require("../deployments/org-registry.json");

const MAX_URI_BYTES = 512;
const RESERVED = [
  ["Citizen", "0x29b30918374d5511c2e04c13b53cdf777411c64e6c26e82641ac55603c5dacb3", "CITIZEN_TYPE"],
  ["Attester", "0xf0f85ad4e1a9d51549974d05172850f7fba29de6d4c95221f26a47f1aeaa8d5d", "ATTESTER_TYPE"],
  ["Guest", "0xd3275120b39f46eafbcc7a5ce0e5397f25f1eaeb72d17620ddf39886beab17b7", "GUEST_TYPE"],
];

function parseUris() {
  const i = process.argv.indexOf("--uris");
  const raw = i >= 0 ? process.argv[i + 1] : undefined;
  if (!raw || raw.startsWith("--")) throw new Error("REFUSING: --uris <citizen>,<attester>,<guest> is required");
  const uris = raw.split(",").map((s) => s.trim());
  if (uris.length !== 3 || uris.some((u) => !u)) throw new Error("REFUSING: --uris needs exactly three non-empty comma-separated URIs");
  for (const u of uris) {
    if (Buffer.byteLength(u, "utf8") > MAX_URI_BYTES) throw new Error(`REFUSING: URI longer than ${MAX_URI_BYTES} bytes: ${u}`);
  }
  return uris;
}

async function main() {
  if (fs.existsSync(RECORD)) throw new Error(`REFUSING: ${RECORD} exists — the production registry is already deployed.`);
  const uris = parseUris();
  const raw = process.env.DEPLOYER_PRIVATE_KEY;
  if (!raw) throw new Error("DEPLOYER_PRIVATE_KEY missing");
  const provider = new ethers.JsonRpcProvider(process.env.GNOSIS_RPC_URL || "https://rpc.gnosischain.com");
  const net = await provider.getNetwork();
  if (net.chainId !== 100n) throw new Error(`REFUSING: chain ${net.chainId} is not Gnosis`);
  const wallet = new ethers.Wallet(raw.startsWith("0x") ? raw : "0x" + raw, provider);

  const owner = V2.addresses.ownerSafe;
  const citizenNft = V2.addresses.citizenNFT;
  const attesterNft = V2.addresses.attesterNFT;
  const orgRegistry = ORGS.orgRegistry;
  if (ORGS.chainId !== 100) throw new Error("org-registry.json is not a Gnosis record");

  const sources = [
    ["owner (Attester Safe)", owner],
    ["CitizenNFTv2", citizenNft],
    ["AttesterNFTv2", attesterNft],
    ["OrgRegistry", orgRegistry],
  ];
  console.log(`deployer:       ${wallet.address}  (${ethers.formatEther(await provider.getBalance(wallet.address))} xDAI)`);
  for (const [name, a] of sources) {
    if ((await provider.getCode(a)) === "0x") throw new Error(`${name} ${a} has no code`);
    console.log(`${(name + ":").padEnd(23)} ${a}  has code`);
  }
  const orgs = new ethers.Contract(orgRegistry, ["function orgCount() view returns (uint256)"], provider);
  console.log(`orgs registered: ${await orgs.orgCount()}`);
  uris.forEach((u, i) => console.log(`${RESERVED[i][0]} URI:`.padEnd(16) + u));
  // Read the artifact before the dry-run return, so a dry run also catches a missing compile.
  const artPath = path.resolve(__dirname, "../artifacts/contracts/verification-system/CredentialRegistry.sol/CredentialRegistry.json");
  if (!fs.existsSync(artPath)) throw new Error(`Artifact missing (${artPath}) — run: npx hardhat compile`);
  const art = JSON.parse(fs.readFileSync(artPath, "utf8"));
  if (!art.bytecode || art.bytecode === "0x") throw new Error("CredentialRegistry artifact has no bytecode");
  console.log(`artifact:       CredentialRegistry (${(art.bytecode.length - 2) / 2} bytes init code)`);
  if (DRY) return console.log("dry run: nothing sent.");
  const c = await new ethers.ContractFactory(art.abi, art.bytecode, wallet).deploy(owner, citizenNft, attesterNft, orgRegistry, uris);
  const dtx = c.deploymentTransaction();
  // Printed before waiting, so a process that dies mid-wait still leaves the address on screen.
  console.log(`sent:           tx ${dtx.hash}  → ${await c.getAddress()} (pending)`);
  const rcpt = await dtx.wait();
  if (!rcpt || rcpt.status !== 1) throw new Error(`deploy transaction failed (${dtx.hash})`);
  const address = await c.getAddress();
  console.log(`deployed:       ${address}  tx ${rcpt.hash}  block ${rcpt.blockNumber}`);

  // Write the record right away (verified: false), so a failed verification or a dead
  // process can never lead a rerun to deploy a second registry.
  const record = {
    network: "gnosis",
    chainId: 100,
    deployedAt: new Date().toISOString(),
    deployer: wallet.address,
    credentialRegistry: address,
    deployBlock: rcpt.blockNumber,
    txHash: rcpt.hash,
    owner,
    citizenNFT: citizenNft,
    attesterNFT: attesterNft,
    orgRegistry,
    reservedURIs: { citizen: uris[0], attester: uris[1], guest: uris[2] },
    verified: false,
    note: "Owner = Attester Safe (recognition, reserved metadata, COMMUNITY types, 2-day delayed source swap). Hand ownership to the Timelock together with OrgRegistry after bootstrap.",
  };
  const writeRecord = () => fs.writeFileSync(RECORD, JSON.stringify(record, null, 2) + "\n");
  writeRecord();
  console.log(`record:         ${RECORD} (verified: false)`);

  const reg = new ethers.Contract(address, art.abi, provider);

  // Post-deploy verification: owner, sources, reserved type ids and their URIs.
  const eq = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  if (!eq(await reg.owner(), owner)) throw new Error("owner mismatch after deploy");
  if (!eq(await reg.citizenNFT(), citizenNft)) throw new Error("citizenNFT mismatch after deploy");
  if (!eq(await reg.attesterNFT(), attesterNft)) throw new Error("attesterNFT mismatch after deploy");
  if (!eq(await reg.orgRegistry(), orgRegistry)) throw new Error("orgRegistry mismatch after deploy");
  for (let i = 0; i < RESERVED.length; i++) {
    const [name, id, getter] = RESERVED[i];
    if ((await reg[getter]()) !== id) throw new Error(`${getter} constant mismatch`);
    if (!(await reg.typeExists(id))) throw new Error(`${name} type missing after deploy`);
    if ((await reg.getType(id)).config.metadataURI !== uris[i]) throw new Error(`${name} URI mismatch after deploy`);
  }

  record.verified = true;
  record.verifiedAt = new Date().toISOString();
  writeRecord();
  console.log(`✓ CredentialRegistry ${address} (block ${rcpt.blockNumber})\nrecord: ${RECORD}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
