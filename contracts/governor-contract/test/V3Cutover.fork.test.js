// Gnosis-fork rehearsal of the WHOLE v3 cutover (scripts/v3-cutover 01→04 + Safe execution).
// Local fork only: nothing is broadcast; all keys are generated in-process. Skipped unless:
//
//   V3_CUTOVER_FORK_TEST=1 GNOSIS_FORK=1 [GNOSIS_RPC_URL=…] \
//     npx hardhat test test/V3Cutover.fork.test.js
//
// The same flow runs standalone with `GNOSIS_FORK=1 npx hardhat run scripts/v3-cutover/rehearse.cjs`.
const { expect } = require("chai");
const hre = require("hardhat");
const { rehearse } = require("../scripts/v3-cutover/rehearse.cjs");

const enabled = process.env.V3_CUTOVER_FORK_TEST === "1" && process.env.GNOSIS_FORK === "1";
const d = enabled ? describe : describe.skip;

d("v3 cutover — Gnosis fork rehearsal (01→04, Safe-executed)", function () {
  this.timeout(30 * 60 * 1000);

  it("every rehearsal assertion passes", async function () {
    const { results, failed } = await rehearse(hre, { log: (m) => console.log("      " + m) });
    expect(results.length).to.be.greaterThan(15);
    expect(failed.map((f) => f.name)).to.deep.equal([]);
  });
});
