// Addresses for the proposal lifecycle. Mirrors packages/blockchain/src/index.ts
// (a test asserts equality) — kept as literals so tsx tests load without aliases.
export const CHAIN_ID = 100;
export const GOVERNOR = "0x5F5e499Dc1872c2Ce19a4b50cd10f680e78E3Ba3" as const;
export const ATTESTER_NFT = "0xC587F383696D3c9DF7A6eE03A9160E40Ae1cdb82" as const;
export const ATTESTER_SAFE = "0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa" as const;
export const EURE = "0x420CA0f9B9b604cE0fd9C18EF134C705e5Fa3430" as const;
export const FUNDER = "0x5ac82fD7f576c86aed8d174074bA707eC1979D9B" as const;

/** MACI vote options as used by the Tally contract. */
export const VOTE_OPTION = { against: 0n, for: 1n, abstain: 2n } as const;

export type Asset = "EURe" | "EURC" | "MUENZEN" | "XDAI";
export type Rail = "funder_muenzen" | "funder_xdai" | "safe_eure" | "manual_safe" | "safe_eurc_base";
export type LineRole = "empfaenger" | "aufgabe" | "wahlhelfer" | "plattform";
export type LineStatus = "geplant" | "sendend" | "vorgeschlagen" | "gesendet" | "bestaetigt" | "unklar" | "fehlgeschlagen";
export type Stage = "abstimmung" | "auszaehlung" | "angenommen" | "abgelehnt" | "in_umsetzung" | "umgesetzt";
