// The `contracts` section of a version-2 manifest: the contracts a mini app calls,
// with the functions it calls on them. After review the passkey sponsor accepts
// exactly these calls for that app (sponsor mode "miniapp"); the confirm sheet
// names them by their label. Pure (viem only): loaded by node:test, no `@/` alias.
//
// Röbel's own contracts and the account infrastructure can never be declared: a
// sponsored call there could move Röbel Münzen, change identity NFTs, or change an
// account's owners or guardians. Röbel Münzen payments go through `roebel.pay`.
import type { DeclaredContract } from "@netizen-labs/miniapp-sdk";
import { callRules, type CallRule } from "@netizen-labs/miniapp-sdk/host";
import { formatEther, isAddress, parseAbiItem, parseEther, toFunctionSelector, type AbiFunction, type Hex } from "viem";
import { formatAbiItem } from "viem/utils";
import { MINIAPP_FORBIDDEN_TARGETS, isMiniAppForbiddenTarget } from "../passkey/sponsor-policy";
import { MiniAppError } from "./types";

export const MAX_CONTRACTS = 8;
export const MAX_FUNCTIONS = 16;
const MAX_LABEL_LENGTH = 40;
const CONTRACT_KEYS = ["address", "label", "functions"];

/**
 * Every address a manifest may not declare: the sponsor policy's mode-F list (Röbel's
 * everyday contracts, org-Safe and account infrastructure, CitizenNFTv2, the zero
 * address), lowercased. Defined in sponsor-policy.ts so the policy and the validator
 * share it without a circular import.
 */
export const FORBIDDEN_CONTRACTS: readonly Hex[] = MINIAPP_FORBIDDEN_TARGETS;

/** True for a forbidden address, including the configured CredentialRegistry. */
export function isForbiddenContract(address: string): boolean {
  return isMiniAppForbiddenTarget(address);
}

function fail(message: string): never {
  throw new MiniAppError("invalid_params", message);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** A canonical function signature (`name(type,…)`, no spaces, canonical types), or null. */
function canonicalSignature(sig: string): string | null {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*\([^\s]*\)$/.test(sig)) return null;
  try {
    const item = parseAbiItem(`function ${sig}`) as AbiFunction;
    if (item.type !== "function") return null;
    const canonical = formatAbiItem(item);
    return canonical === sig ? canonical : null;
  } catch {
    return null;
  }
}

/** Validate + normalise a `contracts` section. Throws MiniAppError('invalid_params'). */
export function validateContracts(input: unknown): DeclaredContract[] {
  if (!Array.isArray(input)) fail("contracts muss eine Liste sein.");
  if (input.length > MAX_CONTRACTS) fail(`contracts: höchstens ${MAX_CONTRACTS} Verträge erlaubt.`);
  const seen = new Set<string>();
  return input.map((entry, i) => {
    if (!isPlainObject(entry)) fail(`contracts[${i}] muss ein Objekt mit address, label und functions sein.`);
    for (const key of Object.keys(entry)) {
      if (!CONTRACT_KEYS.includes(key)) {
        fail(`contracts[${i}].${key} ist unbekannt (erlaubt: ${CONTRACT_KEYS.join(", ")}).`);
      }
    }
    const raw = typeof entry.address === "string" ? entry.address.trim() : "";
    if (!/^0x[0-9a-fA-F]{40}$/.test(raw) || !isAddress(raw, { strict: false })) {
      fail(`contracts[${i}].address muss eine Adresse (0x + 40 Hex-Zeichen) sein.`);
    }
    const address = raw.toLowerCase();
    if (isForbiddenContract(address)) {
      fail(`contracts[${i}].address ist ein Vertrag von Röbel und kann nicht angemeldet werden.`);
    }
    if (seen.has(address)) fail(`contracts: ${address} ist doppelt.`);
    seen.add(address);

    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    if (!label || label.length > MAX_LABEL_LENGTH) {
      fail(`contracts[${i}].label muss 1–${MAX_LABEL_LENGTH} Zeichen lang sein.`);
    }

    const fns = entry.functions;
    if (!Array.isArray(fns) || fns.length === 0 || fns.length > MAX_FUNCTIONS) {
      fail(`contracts[${i}].functions muss 1–${MAX_FUNCTIONS} Funktionen enthalten.`);
    }
    const seenFns = new Set<string>();
    const functions = fns.map((f) => {
      const sig = typeof f === "string" ? f.trim() : String(f);
      const canonical = canonicalSignature(sig);
      if (!canonical) {
        fail(`contracts[${i}].functions: "${sig}" ist keine gültige Signatur (z. B. "checkIn(uint256)").`);
      }
      if (seenFns.has(canonical)) fail(`contracts[${i}].functions: "${canonical}" ist doppelt.`);
      seenFns.add(canonical);
      return canonical;
    });
    return { address, label, functions };
  });
}

/** The shared call rules for a validated declaration (viem's selector function). */
export function rulesFor(contracts: DeclaredContract[]): CallRule[] {
  return callRules(contracts, (sig) => toFunctionSelector(`function ${sig}`));
}

/**
 * The sponsor rules of a stored `mini_apps` row: only a LIVE app with manifest_version '2'
 * and at least one declared contract that still validates; else null. `gasBudgetWei` is the
 * budget granted at review (0 when the column is missing).
 */
export function sponsorRules(row: {
  status?: string | null;
  manifest_version?: string | null;
  contracts?: unknown;
  gas_budget_wei?: string | number | null;
}): { rules: CallRule[]; gasBudgetWei: bigint } | null {
  if (row.status !== "live" || row.manifest_version !== "2") return null;
  if (!Array.isArray(row.contracts) || row.contracts.length === 0) return null;
  let contracts: DeclaredContract[];
  try {
    contracts = validateContracts(row.contracts);
  } catch {
    return null;
  }
  let gasBudgetWei = 0n;
  try {
    const raw = row.gas_budget_wei;
    if (raw !== null && raw !== undefined && /^[0-9]+$/.test(String(raw))) gasBudgetWei = BigInt(String(raw));
  } catch {
    gasBudgetWei = 0n;
  }
  return { rules: rulesFor(contracts), gasBudgetWei };
}

/** Admin input "0.05" (or "0,05") xDAI → wei. Throws MiniAppError('invalid_params'). */
export function xdaiToWei(input: string): bigint {
  const s = String(input ?? "").trim().replace(",", ".");
  if (!/^[0-9]{1,6}(\.[0-9]{1,18})?$/.test(s)) {
    fail("Gas-Budget muss eine Zahl in xDAI sein (höchstens 18 Nachkommastellen, unter 1.000.000).");
  }
  return parseEther(s);
}

/** wei (bigint or decimal string) → xDAI string for display. */
export function weiToXdai(wei: bigint | string | number | null | undefined): string {
  try {
    return formatEther(BigInt(String(wei ?? 0)));
  } catch {
    return "0";
  }
}
