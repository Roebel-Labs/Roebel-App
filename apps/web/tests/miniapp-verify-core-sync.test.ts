import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p));
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

test("the verify package ships the same signature rule as the server", () => {
  assert.equal(
    sha256(read("../src/lib/auth/account-signature-core.ts")),
    sha256(read("../../../packages/miniapp-verify/src/account-signature-core.ts")),
  );
});
