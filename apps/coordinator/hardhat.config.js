// Minimal Hardhat config so maci-cli's getDefaultSigner() resolves a real
// Base-mainnet signer. maci-cli imports `hardhat` at runtime and calls
// `ethers.getSigners()`; without a config defining the network it falls back
// to `localhost`, hence the "HH108: Cannot connect to localhost" we hit before.
//
// The CLI is launched with HARDHAT_NETWORK=base by finalize-poll.js so the
// signer comes from the `base` network's accounts list. PRIVATE_KEY is set on
// the child env (mapped from COORDINATOR_ETH_PRIV).

require("@nomicfoundation/hardhat-toolbox");

const RAW_PK = process.env.PRIVATE_KEY || process.env.COORDINATOR_ETH_PRIV || "";
const PRIVATE_KEY = RAW_PK
  ? (RAW_PK.startsWith("0x") ? RAW_PK : "0x" + RAW_PK)
  : undefined;

module.exports = {
  solidity: "0.8.20",
  networks: {
    hardhat: {},
    base: {
      url: process.env.BASE_RPC_URL || "https://mainnet.base.org",
      chainId: 8453,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};
