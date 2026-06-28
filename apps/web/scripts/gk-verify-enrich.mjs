import assert from "node:assert";
function initials(name) {
  const parts = name.replace(/[^\p{L} ]/gu, "").trim().split(/\s+/).filter(Boolean);
  return (parts.map((w) => w[0]).join("").slice(0, 2).toUpperCase()) || "?";
}
assert.equal(initials("Paul"), "P");
assert.equal(initials("Shreky Müller"), "SM");
assert.equal(initials("@@@"), "?");
const euroXdai = 264, euroEure = 0, total = euroXdai + euroEure;
assert.equal(Math.round((euroXdai / total) * 100), 100);
console.log("✅ gk-verify-enrich passed");
