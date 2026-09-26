// Gnosis-fork rehearsal of the v3 bootstrap against the REAL v2 holder set.
// Local fork only: nothing is broadcast. Skipped unless both env vars are set:
//
//   V3_FORK_TEST=1 GNOSIS_FORK=1 [GNOSIS_RPC_URL=…] [V3_FORK_FROM_BLOCK=…] \
//     npx hardhat test test/V3Bootstrap.fork.test.js
//
// Holders are reconstructed from v2 Transfer logs (mint = from 0, burn = to 0) and then
// cross-checked with v2.hasCitizenNFT / hasAttesterNFT before bootstrapping.
const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const CITIZEN_V2 = "0x59aA26f499D7C2B3EC2c8524Ed06F54fc4E85dE5";
const ATTESTER_V2 = "0xC587F383696D3c9DF7A6eE03A9160E40Ae1cdb82";
const FROM_BLOCK = Number(process.env.V3_FORK_FROM_BLOCK || 46_800_000);
const CHUNK = Number(process.env.V3_FORK_LOG_CHUNK || 200_000);

const enabled = process.env.V3_FORK_TEST === "1" && process.env.GNOSIS_FORK === "1";
const d = enabled ? describe : describe.skip;

async function holdersFromLogs(address) {
  const topic = ethers.id("Transfer(address,address,uint256)");
  const latest = await ethers.provider.getBlockNumber();
  const owner = new Map(); // tokenId → owner
  for (let from = FROM_BLOCK; from <= latest; from += CHUNK) {
    const to = Math.min(from + CHUNK - 1, latest);
    const logs = await ethers.provider.getLogs({ address, topics: [topic], fromBlock: from, toBlock: to });
    for (const l of logs) {
      const recipient = ethers.getAddress("0x" + l.topics[2].slice(26));
      const id = BigInt(l.topics[3]);
      if (recipient === ethers.ZeroAddress) owner.delete(id);
      else owner.set(id, recipient);
    }
  }
  return [...new Set(owner.values())];
}

d("v3 bootstrap — Gnosis fork, real v2 holders", function () {
  this.timeout(20 * 60 * 1000);

  it("bootstraps every v2 attester and citizen; counts match v2; real isAdmin works", async function () {
    // Hardhat has no hardfork history for chain 100, so calls AT the fork block fail;
    // mine one local block so every call runs on a local (known-hardfork) block.
    await network.provider.send("hardhat_mine", ["0x1"]);
    const citV2 = await ethers.getContractAt(
      ["function hasCitizenNFT(address) view returns (bool)", "function citizenCount() view returns (uint256)"],
      CITIZEN_V2
    );
    const attV2 = await ethers.getContractAt(
      ["function hasAttesterNFT(address) view returns (bool)", "function attesterCount() view returns (uint256)"],
      ATTESTER_V2
    );

    const citizens = (await holdersFromLogs(CITIZEN_V2)).filter(Boolean);
    const attesters = (await holdersFromLogs(ATTESTER_V2)).filter(Boolean);
    for (const c of citizens) expect(await citV2.hasCitizenNFT(c), c).to.equal(true);
    for (const a of attesters) expect(await attV2.hasAttesterNFT(a), a).to.equal(true);
    expect(BigInt(citizens.length)).to.equal(await citV2.citizenCount());
    expect(BigInt(attesters.length)).to.equal(await attV2.attesterCount());

    const [owner] = await ethers.getSigners();
    const A = await ethers.getContractFactory("AttesterNFTv3");
    const att = await A.deploy(owner.address, ATTESTER_V2, "Roebel Attester", "ROEBEL-ATTESTER", [5000, 3, 7], [5000, 3, 7]);
    const C = await ethers.getContractFactory("CitizenNFTv3");
    const cit = await C.deploy(await att.getAddress(), CITIZEN_V2, owner.address, [
      [3000, 2, 7], [0, 1, 1], [6700, 3, 65535], [0, 1, 1], [2500, 2, 5], [2500, 2, 5],
    ]);

    await att.bootstrapFromV2(attesters);
    await cit.bootstrapFromV2(citizens);
    expect(await att.attesterCount()).to.equal(BigInt(attesters.length));
    expect(await cit.citizenCount()).to.equal(BigInt(citizens.length));
    for (const c of citizens) {
      expect(await cit.hasCitizenNFT(c)).to.equal(true);
      expect(await cit.getVotes(c)).to.equal(1n);
    }

    // The real thirdweb Account's isAdmin is read correctly: a random destination is NotLinked.
    let deployed = 0;
    let probed = false;
    for (const c of citizens) {
      if ((await ethers.provider.getCode(c)) === "0x") continue;
      deployed++;
      if (probed) continue;
      await network.provider.send("hardhat_impersonateAccount", [c]);
      await network.provider.send("hardhat_setBalance", [c, "0xde0b6b3a7640000"]);
      const signer = await ethers.getSigner(c);
      const stranger = ethers.Wallet.createRandom().address;
      await expect(cit.connect(signer).moveTo(stranger))
        .to.be.revertedWithCustomError(cit, "NotLinked").withArgs(c, stranger);
      await network.provider.send("hardhat_stopImpersonatingAccount", [c]);
      probed = true;
    }
    console.log(`      v2 citizens=${citizens.length} (deployed=${deployed}, counterfactual=${citizens.length - deployed}), attesters=${attesters.length}`);
    expect(probed).to.equal(true);
  });
});
