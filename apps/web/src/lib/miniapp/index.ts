// Public entry for the Netizen Mini App data layer. Import from
// `@/lib/miniapp` in server routes + the AI-builder agent.
export * from "./types";
export * from "./data";
export { validateManifest, CATEGORIES, PERMISSIONS, DEFAULT_PRIMARY_COLOR } from "./manifest";
export { issueMuenzenOnChain } from "./muenzen";
