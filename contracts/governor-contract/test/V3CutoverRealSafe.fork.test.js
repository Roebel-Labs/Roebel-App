// Gnosis-fork rehearsal of the v3 cutover against Max's REAL new Attester Safe (Safe 1.5.0,
// 0xbCAbbAA26420e0A4771808F9639D4176355E5d4B). Local fork only: its creator EOA is impersonated
// to turn it into a 3-of-5 of contract owners; nothing is broadcast. Skipped unless:
//
//   V3_CUTOVER_REAL_SAFE_FORK_TEST=1 GNOSIS_FORK=1 [REHEARSE_REAL_SAFE=0x…] \
//     npx hardhat test test/V3CutoverRealSafe.fork.test.js
//
// Standalone: GNOSIS_FORK=1 REHEARSE_REAL_SAFE=0xbCAb… npx hardhat run scripts/v3-cutover/rehearse.cjs
const { expect } = require("chai");
const hre = require("hardhat");
const { rehearse } = require("../scripts/v3-cutover/rehearse.cjs");
const { NEW_ATTESTER_SAFE_HINT } = require("../scripts/v3-cutover/lib.cjs");

const enabled = process.env.V3_CUTOVER_REAL_SAFE_FORK_TEST === "1" && process.env.GNOSIS_FORK === "1";
const d = enabled ? describe : describe.skip;

d("v3 cutover — Gnosis fork rehearsal with the REAL 1.5.0 Attester Safe", function () {
  this.timeout(30 * 60 * 1000);

  it("every rehearsal assertion passes", async function () {
    const realSafe = process.env.REHEARSE_REAL_SAFE || NEW_ATTESTER_SAFE_HINT;
    const { results, failed } = await rehearse(hre, { realSafe, log: (m) => console.log("      " + m) });
    expect(results.length).to.be.greaterThan(20);
    expect(failed.map((f) => f.name)).to.deep.equal([]);
  });
});
