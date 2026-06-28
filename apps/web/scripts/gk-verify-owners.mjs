import assert from "node:assert";
const SENTINEL = "0x0000000000000000000000000000000000000001";
function prevOwner(owners, owner) {
  const lower = owners.map((o) => o.toLowerCase());
  const i = lower.indexOf(owner.toLowerCase());
  if (i === -1) throw new Error("owner not found");
  return i === 0 ? SENTINEL : owners[i - 1];
}
function matchOwner(candidates, owners) {
  const set = new Set(owners.map((o) => o.toLowerCase()));
  for (const c of candidates) if (c && set.has(c.toLowerCase())) return c;
  return null;
}
const O = ["0xAAa0000000000000000000000000000000000001", "0xBbb0000000000000000000000000000000000002", "0xCcc0000000000000000000000000000000000003"];
assert.equal(prevOwner(O, O[0]), SENTINEL);              // first → sentinel
assert.equal(prevOwner(O, O[1]), O[0]);                  // middle → predecessor
assert.equal(prevOwner(O, O[2]), O[1]);                  // last → predecessor
assert.equal(prevOwner(O, O[2].toUpperCase()), O[1]);    // case-insensitive
assert.throws(() => prevOwner(O, "0xdead"));             // unknown → throws
assert.equal(matchOwner(["0xZZZ", O[1].toLowerCase()], O), O[1].toLowerCase());
assert.equal(matchOwner(["0xZZZ"], O), null);
console.log("✅ gk-verify-owners passed");
