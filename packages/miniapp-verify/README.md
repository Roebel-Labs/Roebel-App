# @netizen-labs/miniapp-verify

Server-side verification for Netizen mini apps. Use it on your own backend to check what a mini
app received from the host app:

- **`verifyUserToken`** — the user token from `sdk.auth.getToken()` (a JWT signed by the
  community's identity service).
- **`verifySignIn`** — the sign-in token from `sdk.auth.signIn()` (an EIP-4361 message signed by
  the person's account on Gnosis).
- **`verifyAccountSignature`** — any message, typed data or hash signed by a community account
  (every account type: plain key, smart account, not-yet-deployed account, passkey Safe).
- **`holdsCredential`** — an on-chain read of the built-in credentials (`citizen`, `attester`).

```sh
pnpm add @netizen-labs/miniapp-verify viem
```

`viem` (>= 2.21) is a peer dependency; `jose` comes with the package.

## `verifyUserToken(token, { issuer, slug })`

```ts
import express from "express";
import { verifyUserToken, MiniAppVerifyError } from "@netizen-labs/miniapp-verify";

const app = express();
app.get("/api/me", async (req, res) => {
  const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  try {
    const user = await verifyUserToken(token, { issuer: "https://id.roebel.app", slug: "my-app" });
    res.json({ id: user.id, citizen: user.has("citizen") });
  } catch (e) {
    res.status(401).json({ error: e instanceof MiniAppVerifyError ? e.code : "invalid" });
  }
});
```

The `jwks_uri` is discovered from `<issuer>/.well-known/openid-configuration` (pass `jwksUri` to
skip discovery). The token must have the header `typ: "miniapp+jwt"`, the issuer you name and the
audience `miniapp:<slug>`, where `slug` is your app's slug in the store: a token made for another
mini app is refused. Errors are `MiniAppVerifyError` with `code` one of `malformed`,
`bad_signature`, `expired`, `wrong_audience`, `wrong_issuer`.

The result (`MiniAppUser`):

| Field | Claim | Meaning |
| --- | --- | --- |
| `id` | `sub` | Stable for this person **in your app**. A pseudonym unless they shared their account; it differs per mini app, so you cannot match people across apps. |
| `address` | `addr` | Only when the person agreed to share their account. |
| `name`, `picture` | `name`, `picture` | Only when the person agreed to share their profile. |
| `credentials` | `creds` | Held credentials the person agreed to share: `{ type, org?, validUntil?, recognised }`. |
| `has(pattern)` | | `"citizen"`, `"type:0x…"` or `"org:<org id>"` (any type of that org). |
| `expiresAt` | `exp` | Unix seconds. Tokens live ten minutes; ask the SDK for a fresh one. |

A credential that the person holds privately is listed like any other: the token is the only
way to prove it, it cannot be read on chain.

## `verifySignIn(token, { domain })`

```ts
// Next.js route handler: app/api/sign-in/route.ts
import { verifySignIn } from "@netizen-labs/miniapp-verify";

export async function POST(req: Request) {
  const { token } = await req.json();
  const nonce = await takeNonce(req); // the nonce you passed to sdk.auth.signIn({ nonce })
  try {
    const { address } = await verifySignIn(token, { domain: "my-app.example", nonce });
    return Response.json({ address });
  } catch {
    return new Response("unauthorized", { status: 401 });
  }
}
```

The token is `"nzsi1." + base64url(JSON { address, message, signature })`. Checked: the message's
domain equals `domain`, chain id 100, the nonce (when given), `Issued At` not older than
`maxAgeSec` (default 300), the address line equals `address`, then `verifyAccountSignature`.
Extra error codes: `wrong_domain`, `wrong_chain`, `wrong_nonce`.

## `verifyAccountSignature({ address, signature, message | typedData | hash })`

```ts
import { verifyAccountSignature } from "@netizen-labs/miniapp-verify";

app.post("/api/vote", async (req, res) => {
  const { address, signature, message } = req.body;
  const ok = await verifyAccountSignature({ address, signature, message }, { rpcUrl: process.env.GNOSIS_RPC_URL });
  if (!ok) return res.status(401).end();
  // … the account signed `message`
  res.status(204).end();
});
```

Exactly one of `message` (EIP-191 text), `typedData` (EIP-712) or `hash` (bytes32). Malformed
input returns `false`; an RPC failure throws. Default RPC `https://rpc.gnosischain.com`; pass
`rpcUrl` or your own viem `client`.

## On-chain reads

```ts
import { holdsCredential, ADDRESSES, ABIS, CHAIN_ID } from "@netizen-labs/miniapp-verify";

const isCitizen = await holdsCredential("citizen", address);
```

`ADDRESSES` (`citizenNft`, `attesterNft`, `orgRegistry` on Gnosis, `CHAIN_ID = 100`) and `ABIS`
(the read functions of those contracts) are exported for your own viem calls.

## License

MIT
