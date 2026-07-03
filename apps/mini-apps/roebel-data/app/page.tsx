"use client";

// The whole mini app is a single client-rendered page: the App shell owns the
// tab state (Town / Economy / Governance) and all the Netizen SDK wiring
// (ready(), wallet, analytics). No server components — every view reads live
// on-chain data client-side. Kept in src/App.tsx so the port stayed a move,
// not a rewrite.
import App from "../src/App";

export default function Page() {
  return <App />;
}
