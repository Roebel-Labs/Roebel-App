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
MCP alternative: tool \`register_app_url\` on ${base}/api/mcp.
`;
}
