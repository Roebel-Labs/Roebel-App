#!/usr/bin/env node
// Sanity check before running deploy-maci-base.ts: verify the deployer key is
// readable, the address has ETH on Base, and the coordinator address is set.
// Does NOT print the private key to stdout/stderr.

require("dotenv").config();
const { ethers } = require("ethers");

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY missing from .env");
  const normalized = pk.startsWith("0x") ? pk : "0x" + pk;
  const wallet = new ethers.Wallet(normalized);
  const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
  const balance = await provider.getBalance(wallet.address);
  const network = await provider.getNetwork();

  console.log("Network:           ", network.name, "chainId=" + network.chainId.toString());
  console.log("Deployer address:  ", wallet.address);
  console.log("Deployer balance:  ", ethers.formatEther(balance), "ETH");
  console.log("Coordinator EOA:   ", process.env.COORDINATOR_ADDRESS);
  console.log("AttesterNFT:       ", process.env.ATTESTER_NFT_ADDRESS);
  console.log("CitizenNFT:        ", process.env.CITIZEN_NFT_ADDRESS);

  if (balance < ethers.parseEther("0.003")) {
    console.warn("\n⚠ Deployer has < 0.003 ETH. Top up before running the deploy.");
  } else {
    console.log("\n✓ Pre-deploy checks pass.");
  }

  // Format normalization warning
  if (!pk.startsWith("0x")) {
    console.warn("  Note: DEPLOYER_PRIVATE_KEY missing 0x prefix; deploy script will normalize.");
  }
}

main().catch((e) => {
  console.error("Check failed:", e.message);
  process.exit(1);
});
