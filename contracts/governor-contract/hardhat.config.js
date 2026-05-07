require("@matterlabs/hardhat-zksync-solc");
require("@matterlabs/hardhat-zksync-verify");


/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  zksolc: {
    version: "1.4.1",
    compilerSource: "binary",
    settings: {
      optimizer: {
        enabled: true,
      },
    },
  },
  networks: {
    zkSyncbaseTestnet: {
      url: "https://base.era.zksync.dev",
      ethNetwork: "base",
      zksync: true,
      chainId: 300,
      verifyURL:
        "https://explorer.base.era.zksync.dev/contract_verification",
    },
    zkSyncMainnet: {
      url: "https://mainnet.era.zksync.io",
      ethNetwork: "mainnet",
      zksync: true,
      chainId: 324,
      verifyURL:
        "https://zksync2-mainnet-explorer.zksync.io/contract_verification",
    },
  },
  paths: {
    artifacts: "./artifacts-zk",
    cache: "./cache-zk",
    // Scope compile to verification-system only. The legacy /semaphore tree imports
    // OZ v4's Counters.sol (removed in v5) and is out of scope for the MACI work.
    sources: "./contracts/verification-system",
    tests: "./test",
  },
  solidity: {
    compilers: [
      {
        version: "0.8.28",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          viaIR: true,
        },
      },
      {
        version: "0.8.23",
        settings: {
          optimizer: { enabled: true, runs: 200 },
        },
      },
      {
        version: "0.8.20",
        settings: {
          optimizer: { enabled: true, runs: 200 },
        },
      },
    ],
  },
};
