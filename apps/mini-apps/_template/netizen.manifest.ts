import type { MiniAppManifest } from "@netizen-labs/miniapp-sdk";

/**
 * Netizen Mini App manifest — the template's own TypeScript source for the manifest.
 *
 * The registry does NOT read this file: it reads the JSON at
 * `public/.well-known/roebel-miniapp.json` (served as /.well-known/roebel-miniapp.json). Keep the
 * two in sync; the JSON also carries `owner` (your Röbel account address).
 *
 * The AI builder rewrites these fields per prompt. When you customize this app:
 *  - pick a unique, url-safe `slug`,
 *  - keep `name` ≤ 32 chars and `description` ≤ 200,
 *  - point `homeUrl` at this app's deployed URL,
 *  - request ONLY the `permissions[]` you actually use — the host refuses any
 *    bridge method whose permission wasn't declared + admin-approved.
 *
 * See packages/miniapp-sdk/src/types.ts (MiniAppManifest) and DESIGN.md §6.
 */
export const manifest: MiniAppManifest = {
  slug: "template",
  name: "Vorlage Mini-App",
  iconUrl: "https://mini.roebel.app/template/icon-1024.png", // 1024×1024 PNG
  homeUrl: "https://mini.roebel.app/template",
  description:
    "Die Vorlage für Röbel Mini-Apps: begrüßt dich, zeigt deinen Röbel-Münzen-Stand und vergibt eine Beispiel-Belohnung.",
  category: "utility",
  tags: ["vorlage", "beispiel", "belohnung"],
  screenshots: [],
  permissions: ["wallet", "circles", "rewards"],
  primaryColor: "#00498B",
  // Version 2: what the app may ask the person to share (consent sheet on first open).
  version: "2",
  identity: {
    profile: true,
    address: false,
    credentials: [{ type: "citizen", reason: "Zeigt Bürger:innen einen eigenen Bereich." }],
  },
};

export default manifest;
