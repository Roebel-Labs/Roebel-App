import assert from "node:assert";

function approvalLabel(n, m) {
  return n >= m ? `Bereit zur Ausführung (${n}/${m})` : `Wartet auf Freigaben (${n}/${m})`;
}
assert.equal(approvalLabel(1, 2), "Wartet auf Freigaben (1/2)");
assert.equal(approvalLabel(2, 2), "Bereit zur Ausführung (2/2)");
assert.equal(approvalLabel(3, 2), "Bereit zur Ausführung (3/2)");
console.log("✅ gk-verify-format passed");
