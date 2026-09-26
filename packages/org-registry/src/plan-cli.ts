#!/usr/bin/env tsx
/**
 * netizen-org-plan — dry-run plan for moving orgs onto Safes (NSP-14).
 *
 *   netizen-org-plan --accounts accounts.json --owners owners.json \
 *     [--threshold parity|majority] [--node-id roebel] > plan.json
 *
 * Inputs are plain row exports of `accounts` and `account_owners` (no
 * database access here — export them however your node does). Set
 * NODE_AGENT_SECRET to include each org's node-derived Nostr key. Writes
 * nothing anywhere but stdout; a summary goes to stderr.
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { planOrgMigration, type ThresholdPolicy } from "./plan.js";

const { values } = parseArgs({
  options: {
    accounts: { type: "string" },
    owners: { type: "string" },
    threshold: { type: "string", default: "parity" },
    "node-id": { type: "string" },
  },
});

if (!values.accounts || !values.owners) {
  console.error("usage: netizen-org-plan --accounts <file> --owners <file> [--threshold parity|majority] [--node-id <slug>]");
  process.exit(2);
}
if (values.threshold !== "parity" && values.threshold !== "majority") {
  console.error(`--threshold must be parity or majority, got ${values.threshold}`);
  process.exit(2);
}

const plan = planOrgMigration(
  JSON.parse(readFileSync(values.accounts, "utf8")),
  JSON.parse(readFileSync(values.owners, "utf8")),
  {
    threshold: values.threshold as ThresholdPolicy,
    nodeId: values["node-id"],
    nodeSecret: process.env.NODE_AGENT_SECRET,
  },
);

process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
const reasons = plan.skipped.reduce<Record<string, number>>((acc, s) => ((acc[s.reason] = (acc[s.reason] ?? 0) + 1), acc), {});
console.error(
  `planned ${plan.orgs.length} org Safes; skipped ${plan.skipped.length} ${JSON.stringify(reasons)}; ` +
    `${plan.invalidWallets.length} invalid wallet rows`,
);
