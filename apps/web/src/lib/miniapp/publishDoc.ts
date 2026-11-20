// The one-page agent recipe served at /mini-apps/publish.md. A builder tells
// their agent: "Lies <base>/mini-apps/publish.md und veröffentliche diese App
// im Röbel Mini App Store." Keep it short and imperative.
export function buildPublishMd(base: string): string {
  return `# Publish a mini app to the Röbel Mini App Store

You are an AI agent helping a builder publish their web app as a Röbel mini app.
The app stays on the builder's own hosting. Röbel only indexes a manifest file.
Röbel is a small town in Germany; app UI copy must be **German**.

## 1. Add the SDK and signal readiness
The host shows a splash screen until the app calls \`sdk.actions.ready()\`.

npm (React/Vite/Next):
\`\`\`bash
npm install @netizen-labs/miniapp-sdk
\`\`\`
\`\`\`ts
import { sdk } from "@netizen-labs/miniapp-sdk";
// after the first screen has rendered:
sdk.actions.ready();
\`\`\`

Plain HTML:
\`\`\`html
<script type="module">
  import { sdk } from "${base}/sdk/miniapp-sdk.mjs";
  sdk.actions.ready();
</script>
\`\`\`
Full SDK reference: ${base}/mini-apps/llms-full.txt

## Every person may decline — build fallbacks
The Röbel app opens every mini app with a connect dialog ("Verbinden mit …"). The person can
uncheck "Name und Bild", "Öffentliche ID" (the account) and any credential, or close it. So:
- \`sdk.getContext().user\` can be \`null\`; \`displayName\`/\`avatarUrl\` can be missing.
- \`sdk.wallet.getAccount()\` can be \`null\` — then signing, sign-in and \`roebel.pay\` reject
  with \`unauthorized\`. Disable only that feature and explain in one German sentence that it can
  be enabled on the app's page under "Zugriff".
- Use \`user.id\` as the per-person key (address or a per-app pseudonym; not always \`0x…\`).
- Start in a useful signed-out state. Details: ${base}/mini-apps/llms-full.txt (chapter "The connect dialog").

## User token
\`sdk.auth.getToken()\` returns \`{ token }\` or \`null\` (handle \`null\`). The token
is valid for 10 minutes and for this app only. A server that calls
${base}/api/mini-apps/rewards, /data (user scope), /notifications or
/muenzen-balance must send it as \`Authorization: Bearer <token>\`. A wallet
address alone will stop working. Verify it on your own server with
\`verifyUserToken\` from \`@netizen-labs/miniapp-verify\`. \`auth.getToken\`,
\`auth.signIn\` and \`roebel.pay\` work in the Röbel app from version 3.10.0;
ask \`sdk.supports()\` first.

## 2. Allow embedding
The app runs inside an iframe/WebView. Do not send \`X-Frame-Options: DENY|SAMEORIGIN\`,
and if you set a CSP, use \`frame-ancestors *\`.

## 3. Deploy
Any https host works (Vercel, Netlify, Lovable, own server). Use the production URL,
on the default port, with no login wall in front of the app.

## 4. Add the manifest
Serve this JSON at \`https://<your-app-domain>/.well-known/roebel-miniapp.json\`.
For Next.js, Vite and Lovable that means the file \`public/.well-known/roebel-miniapp.json\`.

\`\`\`json
{
  "owner": "0x…",
  "miniapp": {
    "version": "1",
    "name": "App-Name (max. 32 Zeichen)",
    "homeUrl": "https://<your-app-domain>/",
    "iconUrl": "https://<your-app-domain>/icon.png",
    "description": "Ein Satz auf Deutsch (max. 200 Zeichen).",
    "category": "games",
    "tags": ["stadt"],
    "screenshots": [],
    "permissions": [],
    "primaryColor": "#00498B"
  }
}
\`\`\`
- \`owner\`: the builder's Röbel wallet address. If you don't know it, **ask the builder**.
  They find it after logging in at ${base}/dashboard/mini-apps → "Per URL hinzufügen" (it shows the address to copy).
- \`homeUrl\` must be on the same domain as the manifest.
- \`category\`: community, governance, finance, utility, games, education, news, culture, environment.
- \`permissions\` (only what you use): wallet, rewards, notifications, circles, share.
- \`iconUrl\`: square PNG, ideally 1024×1024.
- Optional \`slug\` (a–z, 0–9, "-"); otherwise one is derived from the name.

Version 2 (identity, gasless contracts, audience, org; details: ${base}/mini-apps/llms-full.txt):
\`\`\`json
{
  "owner": "0x…",
  "miniapp": {
    "version": "2",
    "name": "Vereinsheim",
    "homeUrl": "https://<your-app-domain>/",
    "iconUrl": "https://<your-app-domain>/icon.png",
    "description": "Trainingszeiten und Check-in für Mitglieder.",
    "category": "community",
    "tags": ["verein"],
    "screenshots": [],
    "permissions": ["wallet"],
    "primaryColor": "#00498B",
    "identity": {
      "profile": true,
      "address": false,
      "credentials": [{ "type": "org:3f2504e0-4f89-41d3-9a0c-0305e82c3301", "reason": "Nur Mitglieder sehen den Trainingsplan." }]
    },
    "contracts": [{ "address": "0x1111111111111111111111111111111111111111", "label": "Check-in", "functions": ["checkIn(uint256)"] }],
    "audience": { "mode": "required", "anyOf": ["org:3f2504e0-4f89-41d3-9a0c-0305e82c3301"] },
    "org": "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
  }
}
\`\`\`
The org confirms \`org\` in the app; a lock is a courtesy, so check credentials on your server.

## 5. Validate, then register
\`\`\`bash
curl -s "${base}/api/mini-apps/validate?url=https://<your-app-domain>"
curl -s -X POST ${base}/api/mini-apps/register \\
  -H 'content-type: application/json' \\
  -d '{"url":"https://<your-app-domain>"}'
\`\`\`
Fix every error from \`validate\` before registering, and tell the builder about any warnings.
\`register\` returns \`dashboardUrl\`. Give that link to the builder. The app is
"In Prüfung" until the Röbel team approves it.

## Updating later
Change the manifest, deploy, and call \`register\` again (or wait for the daily re-index).
Changes to a live app go live after review; the current version stays visible until then.
MCP alternative: tool \`register_app_url\` on ${base}/api/mcp (only \`nz_\` API keys are accepted).
`;
}
