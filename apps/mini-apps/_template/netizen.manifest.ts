import type { MiniAppManifest } from "@netizen-labs/miniapp-sdk";

/**
 * Netizen Mini App manifest — the single row the registry validates against.
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
};

export default manifest;
