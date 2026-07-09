// Copy-paste snippets for the "build with your own tools" paths (Claude Code/
// MCP, Lovable & Co., Netizen SDK). Plain module with NO heavy imports — it is
// bundled into the client dashboard (devdocs.ts would pull the entire prompt
// library along). Keep the values in sync with devdocs.ts / htmlPrompt.ts.

const BASE = "https://www.roebel.app";

/** MCP registration for Claude Code (works for any MCP-capable agent). */
export const MCP_SNIPPET = `claude mcp add --transport http netizen ${BASE}/api/mcp \\
  --header "Authorization: Bearer nz_DEIN_KEY"`;

/** Prompt to paste into Lovable, v0 & co. — the app then talks to the SDK. */
export const LOVABLE_PROMPT = `Baue eine Mini-App für die Röbel App (Deutschland, deutsche UI-Texte).
Lies zuerst die Plattform-Doku: ${BASE}/mini-apps/llms-full.txt
Wichtig: npm-Paket @netizen-labs/miniapp-sdk installieren, sdk.actions.ready()
nach dem ersten Rendern aufrufen, niemals Wallet-Adressen oder Krypto-Jargon
zeigen (Währung heißt "Röbel-Münzen"). Außerhalb der Röbel App läuft das SDK
automatisch im Mock-Modus — die Vorschau hier funktioniert also ganz normal.
Die App: [BESCHREIBE DEINE IDEE]`;

/** Netizen SDK — npm for hosted apps, ESM import for single-file HTML apps. */
export const SDK_SNIPPET = `npm i @netizen-labs/miniapp-sdk

// oder direkt in einer einzelnen HTML-Datei:
import { sdk } from "${BASE}/sdk/miniapp-sdk.mjs";
await sdk.actions.ready();`;
