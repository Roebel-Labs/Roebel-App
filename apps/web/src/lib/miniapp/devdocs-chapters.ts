/**
 * Developer-docs chapters for SDK 0.4.0 (identity, verification, credentials, wallet, gasless,
 * issuer, store). English for developers and agents; German only where UI copy is quoted.
 * Read through devdocs.ts, the single source for the website, llms.txt, llms-full.txt and the MCP.
 */

export const IDENTITY_CHAPTER = `## Identity and consent (manifest version "2")

A version-2 manifest says what the app may ask the person to share. Version "1" keeps the old
behaviour and gets none of this.

\`\`\`json
{
  "version": "2",
  "identity": {
    "profile": true,
    "address": false,
    "credentials": [
      { "type": "citizen", "reason": "Nur Bürger:innen können abstimmen." },
      { "type": "org:3f2504e0-4f89-41d3-9a0c-0305e82c3301", "reason": "Vereinsmitglieder sehen den Trainingsplan." }
    ]
  }
}
\`\`\`

- \`profile\` — display name and picture. \`address\` — the account address (only for apps that
  work on chain). \`credentials\` — up to 12 entries, each with a German \`reason\` of 1–120
  characters that the person reads on the consent sheet.
- The first time the app opens, the Röbel app shows one consent sheet: every item with its
  reason, each switchable, "Erlauben" or "Nicht jetzt". A declined item is simply absent: no
  name, no picture, \`address\` null, the credential missing from \`sdk.credentials.list()\`.
  A later manifest version asks again only for what is new.
- Without \`address\` the app gets a pseudonym: a stable id that is different for every mini app,
  so two apps cannot link the same person.
- \`sdk.getContext().user\` for version 1: \`{ id: <account address>, displayName, avatarUrl, isCitizen }\`.
  For version 2: \`id\` is the pseudonym (the address only if shared), name and picture only if
  \`profile\` was allowed, \`isCitizen\` only if the citizen credential was shared; \`null\` when the
  person is signed out. It stays display-only — never use it for authorisation.
- Private credentials: the app learns only that the person holds it, nothing else. The sheet
  says so ("Die App erfährt nur, dass du Mitglied bist.").
- Withdrawal: everything can be switched off again on the app's detail page ("Zugriff"); the
  app receives \`credentialsChanged\`.
- Review: the Röbel team checks that what the manifest asks for matches what the app does.
  Ask for the least you need.`;

export const VERIFY_CHAPTER = `## Verifying the person on your server

\`sdk.getContext().user\` is untrusted. When your server must know who is calling:

\`\`\`ts
// in the mini app
const t = await sdk.auth.getToken();            // { token } or null (signed out)
if (t) await fetch("/api/me", { headers: { Authorization: \`Bearer \${t.token}\` } });

// on your server (npm i @netizen-labs/miniapp-verify)
import { verifyUserToken } from "@netizen-labs/miniapp-verify";
const user = await verifyUserToken(token, { issuer: "https://id.roebel.app", slug: "<your-slug>" });
user.id;            // pseudonym, or the address if the person shared it
user.address;       // only when shared
user.name; user.picture;   // only when profile was shared
user.credentials;   // the shared credentials, each with its expiry
user.has("citizen"); user.has("org:<org account id>");
user.expiresAt;     // unix seconds
\`\`\`

- The token is an ES256 JWT (\`typ\` \`miniapp+jwt\`) signed by the community's identity service
  (public keys at the issuer's well-known JWKS URL), valid for 10 minutes and only for your app
  (audience \`miniapp:<slug>\`). Claims: \`sub\` (pseudonym or address), \`addr\`, \`name\`, \`picture\`,
  \`creds\`, \`exp\`. Fetch a new one when it expires; do not cache it longer.
- The same token authorises calls to Röbel's routes (\`/api/mini-apps/rewards\`, \`/data\` user
  scope, \`/notifications\`, \`/muenzen-balance\`) as \`Authorization: Bearer <token>\`.
- Alternative that does not depend on Röbel's issuer: \`sdk.auth.signIn({ nonce })\` returns a
  sign-in message signed by the person's own account. Verify it with
  \`verifySignIn(token, { domain: "<your domain>", nonce })\`, which returns \`{ address }\`.
  Always use a fresh nonce from your server. A plain \`ecrecover\` check is not enough: these
  accounts are smart accounts (ERC-1271), some not yet deployed, some passkey Safes, and
  migrated accounts sign in a wrapped format — \`verifySignIn\` handles all of them.
- Both work in the Röbel app from version 3.10.0. Check \`sdk.supports("auth.getToken")\` first.`;

export const CREDENTIALS_CHAPTER = `## Credentials

A credential is something a person holds: a built-in (\`citizen\`, \`attester\`, \`guest\`) or a type
from the community's credential register (a membership, a role, a badge), issued by an org.

References (in \`identity.credentials\`, \`audience.anyOf\` and every call below):

- \`citizen\`, \`attester\`, \`guest\` — the built-ins.
- \`type:<typeId>\` — one register type (\`0x\` + 64 hex). Find type ids in the public type
  directory: \`GET https://www.roebel.app/api/credentials/types\` (and \`/api/credentials/types/<typeId>\`).
- \`org:<org account id>\` — any credential of that org. The id is the uuid in the org's page
  address \`/account/<id>\`.

Calls (manifest version "2"; every call can reject \`unsupported\` on an older app):

\`\`\`js
if (sdk.supports("credentials.list")) {
  const list = await sdk.credentials.list();     // [{ type, kind, org?, name, imageUrl?, validUntil?, recognised }]
  const isMember = await sdk.credentials.has("org:3f2504e0-4f89-41d3-9a0c-0305e82c3301");
  const { granted } = await sdk.credentials.request(["citizen"]); // shows the consent sheet
  const off = sdk.credentials.onChange((next) => render(next));   // grant, withdrawal, expiry
}
\`\`\`

- Only types listed in the reviewed manifest can be requested. \`granted\` says what the person
  shared; whether they hold it right now is what \`list()\` / \`has()\` answer.
- A private credential is answered as "holds it" only — no further detail.
- Mock mode: \`window.__NETIZEN_MOCK__ = { credentials: [{ type: "citizen", kind: "builtin", name: "Bürger:in", recognised: true }] }\`
  (the default is one \`citizen\`).
- On your server, read public credentials straight from the chain, without the app:
  \`holdsCredential("citizen" | "attester" | "type:0x…", account)\` from
  \`@netizen-labs/miniapp-verify\`, which also exports the contract ABIs (\`ABIS\`,
  \`CREDENTIAL_REGISTRY_ABI\`, …) and \`ADDRESSES\`. Private holdings are not on chain; use the
  user token for those.`;

export const WALLET_CHAPTER = `## Wallet (EIP-1193 provider)

\`const provider = await sdk.wallet.getEthereumProvider();\` — Gnosis Chain (id 100) only.

- Reads, answered by the host against the community's RPC (no RPC of your own needed):
  \`eth_call\`, \`eth_getBalance\`, \`eth_getLogs\`, \`eth_getTransactionReceipt\`,
  \`eth_getTransactionByHash\`, \`eth_blockNumber\`, \`eth_estimateGas\`, \`eth_gasPrice\`,
  \`eth_maxPriorityFeePerGas\`, \`eth_getCode\`, \`eth_getTransactionCount\`, \`eth_getBlockByNumber\`
  (transaction hashes only), plus \`eth_chainId\`, \`net_version\`, \`eth_accounts\`,
  \`eth_requestAccounts\`, \`wallet_getCapabilities\`, \`wallet_getCallsStatus\`.
  Limits: 300 requests per minute (burst 30), 10 s timeout, 64 KB request / 1 MB response;
  \`eth_getLogs\` needs an address (up to 5) or a blockHash, both block bounds, at most 10,000
  blocks and at most 1,000 results.
- Signing, each with a confirmation sheet: \`eth_sendTransaction\`, \`personal_sign\`, \`eth_sign\`,
  \`eth_signTypedData(_v3/_v4)\`, and \`wallet_sendCalls\` (EIP-5792: 1 to 10 calls, one
  confirmation, one fingerprint). The sheet names the mini app and each contract by its declared
  label, shows what is signed and warns on anything not declared in the manifest.
- \`wallet_switchEthereumChain\` / \`wallet_addEthereumChain\` to anything but Gnosis fail with 4902.
- Errors (SDK 0.4.0): numeric EIP-1193 codes — 4001 rejected by the person, 4100 not allowed,
  4200 unsupported method, 4902 unsupported chain, -32602 invalid params, -32603 internal, or the
  RPC's own code. The bridge's string code is in \`error.data.bridgeCode\`.
- \`sdk.roebel.pay({ to, amount, memo? })\` → \`{ txHash }\`: a Röbel Münzen payment to a named
  recipient, confirmed by the person on the host's own sheet.
- Events: \`sdk.on("walletChanged" | "back" | "visibilityChanged" | "themeChanged" | "credentialsChanged", cb)\`.
  Call \`sdk.actions.ready({ handlesBack: true })\` to receive \`back\` and handle the back gesture
  yourself (otherwise the host closes the app).
- All of this works in the Röbel app from version 3.10.0; ask \`sdk.supports()\` first.`;

export const GASLESS_CHAPTER = `## Gasless transactions (declared contracts)

A version-2 manifest declares the contracts and functions the app calls:

\`\`\`json
"contracts": [
  { "address": "0x…", "label": "Vereinskasse", "functions": ["checkIn(uint256)", "vote(uint256,bool)"] }
]
\`\`\`

- Up to 8 contracts, 1–16 canonical function signatures each, \`label\` 1–40 characters (shown on
  the confirmation sheet instead of the address). Röbel's own contracts and the account
  infrastructure cannot be declared.
- After review, the Röbel team grants the app a gas budget. Until then the declared calls are
  not sponsored.
- On an independent account (passkey or 12 words) a version-2 app may send only its declared
  calls, with no value attached; they are gasless, charged to the app's budget plus a small daily
  allowance per person. Anything else is refused before a sheet is shown ("Diese Aktion ist für
  diese Mini-App nicht freigegeben."). Accounts on the old sign-in keep their current behaviour.
- When a budget is used up the call rejects \`budget_exceeded\` with one of three texts:
  - the app's budget: "Das Gas-Budget dieser Mini-App ist aufgebraucht."
  - the person's daily allowance: "Du hast dein Tageslimit für Mini-Apps erreicht. Morgen geht es weiter."
  - the community's daily total: "Mini-Apps sind heute ausgelastet. Bitte versuch es morgen wieder."
  Show the message; do not retry in a loop.`;

export const ISSUER_CHAPTER = `## Mini apps as issuers (badges)

Recipe for a mini app that hands out badges such as "10 Trainings absolviert":

1. The org creates a badge type in the credential register.
2. The org appoints your mini app server's own key as a delegate for exactly that one type.
3. Your server decides who earned the badge (its own data, or a verified user token) and issues
   it with that key. The person sees the badge in the app and can share it with other apps.

No bridge method is involved: the issuing happens between your server and the register. The org
can withdraw the delegation at any time, and the key can issue nothing but that type.

This needs the credential register. It is not available before the register is deployed on
Gnosis; until then \`holdsCredential("type:…")\` answers that \`type:\` references are unsupported.`;

export const STORE_CHAPTER = `## Store: audience and org

A version-2 manifest says whom the app is for and which org it belongs to:

\`\`\`json
"audience": { "mode": "recommended", "anyOf": ["citizen", "org:3f2504e0-4f89-41d3-9a0c-0305e82c3301"] },
"org": "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
\`\`\`

- \`audience.anyOf\`: 1–8 credential references. \`recommended\` — people who hold one see the app
  under "Für dich" and may get one suggestion on their start page. \`required\` — everyone else
  sees the app locked, with the reason and the way in.
- Matching happens on the phone against the credentials held there. The store always loads every
  live app; nothing about the match is sent or logged.
- \`org\`: the org's account id. The org confirms the binding (an owner or admin, under
  Verwaltung). Only then is the app listed on the org's page and under "Meine Vereine", and the
  lock text names the org. A new manifest version that changes \`org\` needs a new confirmation.
- A lock in the app is a courtesy, not security: the app can still be opened in a browser.
  Check the credential on your server (user token or \`holdsCredential\`).
- An app without \`audience\` behaves as before: open to everyone.`;


/** The chapters in reading order, with the one-line description llms.txt shows. */
export const DOCS_CHAPTERS = [

  { id: "identity", text: IDENTITY_CHAPTER, summary: "Identity and consent: manifest version 2 identity, consent sheet, pseudonym, context.user, withdrawal" },

  { id: "verify", text: VERIFY_CHAPTER, summary: "Verify the person on your server: user token, verifyUserToken, signIn + verifySignIn" },

  { id: "credentials", text: CREDENTIALS_CHAPTER, summary: "Credentials: reference syntax, type directory, sdk.credentials.*, mock, holdsCredential" },

  { id: "wallet", text: WALLET_CHAPTER, summary: "Wallet: provider methods and limits, Gnosis only, error codes, roebel.pay, events" },

  { id: "gasless", text: GASLESS_CHAPTER, summary: "Gasless transactions: declared contracts, review, gas budget, budget errors" },

  { id: "issuer", text: ISSUER_CHAPTER, summary: "Mini apps as issuers: badges through an org delegate key (needs the credential register)" },

  { id: "store", text: STORE_CHAPTER, summary: "Store: audience, org binding, Für dich, Meine Vereine, locks" },

] as const;

export type DocsChapterId = (typeof DOCS_CHAPTERS)[number]["id"];
