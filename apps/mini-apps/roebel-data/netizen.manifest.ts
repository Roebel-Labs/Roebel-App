import type { MiniAppManifest } from "@netizen/miniapp-sdk";

/**
 * Röbel Circles — the Netizen mini app registry entry.
 *
 * The first-party proof-of-concept: the town's on-chain economy dashboard
 * (Town / Economy / Governance) plus citizen tools (invite neighbours, create
 * event QR codes). Ported from the standalone Circles mini app.
 *
 * Permissions (only what the app actually uses):
 *  - wallet   → EIP-1193 signing for the invite + event-QR flows (host confirm sheet)
 *  - circles  → read the connected user's Röbel-Münzen balance
 *  - rewards  → grantReward when a citizen shares the town / sends an invite
 *  - share    → native share sheet for the referral link
 */
export const manifest: MiniAppManifest = {
  slug: "roebel-data",
  name: "Röbel Circles",
  iconUrl: "https://mini.roebel.app/roebel-data/icon-1024.png", // 1024×1024 PNG
  homeUrl: "https://mini.roebel.app/roebel-data",
  description:
    "Die Wirtschaft von Röbel, live on-chain: Röbel-Münzen-Vorrat, Deckung, Vertrauensnetz und Governance — plus Werkzeuge, um Nachbarn einzuladen und Event-QR-Codes zu erstellen.",
  category: "community",
  tags: ["röbel", "wirtschaft", "münzen", "governance", "einladen"],
  screenshots: [],
  permissions: ["wallet", "circles", "rewards", "share"],
  primaryColor: "#00498B",
};

export default manifest;
