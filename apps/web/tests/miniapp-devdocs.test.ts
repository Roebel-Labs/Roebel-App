import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildLlmsIndexTxt, getDocsSection } from "../src/lib/miniapp/devdocs";
import { WELL_KNOWN_PATH } from "../src/lib/miniapp/manifestFile";

test("docs explain the user token and the deprecation", () => {
  const sdk = getDocsSection("sdk");
  assert.match(sdk, /## User token/);
  assert.match(sdk, /Authorization: Bearer/);
  assert.match(sdk, /sdk\.auth\.getToken\(\)/);
  assert.match(sdk, /10 minutes/);
  assert.match(sdk, /SDK 0\.4\.0/);
  assert.match(sdk, /null/);
  assert.doesNotMatch(getDocsSection("all"), /Wallet-Adresse als Token/);
});

test("the MCP section says only nz_ API keys are accepted", () => {
  const all = getDocsSection("all");
  assert.match(all, /only `nz_` API keys/i);
  assert.doesNotMatch(all, /Fallback during rollout/);
});

// Drift: the docs must follow the code (MCP tools, SDK version, manifest path, handshake).
test("every MCP tool is documented", () => {
  const src = readFileSync(new URL("../src/app/api/[transport]/route.ts", import.meta.url), "utf8");
  const tools = [...src.matchAll(/server\.tool\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
  assert.ok(tools.length >= 15);
  const docs = getDocsSection("all");
  for (const t of tools) assert.ok(docs.includes(t), `tool ${t} missing from the docs`);
});

test("the docs name the SDK version the package has", () => {
  const { version } = JSON.parse(
    readFileSync(new URL("../../../packages/miniapp-sdk/package.json", import.meta.url), "utf8"),
  );
  assert.ok(getDocsSection("sdk").includes(`miniapp-sdk-${version}.mjs`));
});

test("the docs name the manifest path the indexer reads", () =>
  assert.ok(getDocsSection("publish").includes(WELL_KNOWN_PATH)));

test("the README states the real handshake time", () => {
  const readme = readFileSync(new URL("../../../packages/miniapp-sdk/README.md", import.meta.url), "utf8");
  assert.doesNotMatch(readme, /1\.5\s?s/);
  assert.match(readme, /2\s?s/);
  assert.doesNotMatch(readme, /miniapp-sdk-0\.2\.0/);
  assert.doesNotMatch(getDocsSection("all"), /1\.5\s?s/);
});

test("the docs list every event, credentialsChanged included", () => {
  const sdk = getDocsSection("sdk");
  for (const e of ["walletChanged", "back", "visibilityChanged", "themeChanged", "credentialsChanged"]) assert.ok(sdk.includes(e), e);
});

test("DESIGN.md points to the manifest file, not netizen.manifest.ts", () => {
  const design = readFileSync(new URL("../../../packages/miniapp-sdk/DESIGN.md", import.meta.url), "utf8");
  assert.ok(design.includes(WELL_KNOWN_PATH));
});

// SDK 0.4.0 chapters: one source (devdocs.ts) for the site, llms.txt, llms-full.txt and the MCP.
for (const s of ["identity", "verify", "credentials", "wallet", "gasless", "issuer", "store"] as const)
  test(`section ${s} exists and is part of all`, () => {
    const t = getDocsSection(s);
    assert.ok(t.length > 400);
    assert.ok(getDocsSection("all").includes(t.slice(0, 80)));
  });

test("the SDK calls of 0.4.0 are documented", () => {
  const all = getDocsSection("all");
  for (const c of [
    "sdk.credentials.list",
    "sdk.credentials.has",
    "sdk.credentials.request",
    "sdk.credentials.onChange",
    "sdk.auth.getToken",
    "sdk.auth.signIn",
    "sdk.roebel.pay",
    "sdk.supports",
    "wallet_sendCalls",
    "eth_getLogs",
    "verifyUserToken",
    "verifySignIn",
    "holdsCredential",
    "handlesBack",
  ])
    assert.ok(all.includes(c), `${c} missing`);
});

test("llms.txt lists every section", () => {
  const index = buildLlmsIndexTxt();
  for (const s of ["identity", "verify", "credentials", "wallet", "gasless", "issuer", "store"])
    assert.match(index, new RegExp(`^- ${s}: `, "m"));
});

test("the issuer chapter says it needs the credential register", () =>
  assert.match(getDocsSection("issuer"), /credential register/i));
