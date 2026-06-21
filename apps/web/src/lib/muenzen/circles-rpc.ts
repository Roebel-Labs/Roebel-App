// Circles RPC (rpc.aboutcircles.com) access for the Röbel Münzen console. Server-only.
// Ports the proven query shapes from the Expo app (lib/circles-profile.ts,
// lib/roebel-taler.ts, hooks/useRoebelTalerHistory.ts) to the web side.
import "server-only";
import { ADDR, GROUP_TOKEN_ID } from "./constants";

const CIRCLES_RPC = process.env.CIRCLES_RPC_URL || "https://rpc.aboutcircles.com/";
const PROFILE_GET = "https://rpc.aboutcircles.com/profiles/get?cid=";

function lower(a: string): string {
  return a.toLowerCase();
}

function safeBig(v: unknown): bigint {
  try {
    return BigInt(String(v ?? "0").split(".")[0] || "0");
  } catch {
    return 0n;
  }
}

async function rpc(method: string, params: unknown[]): Promise<any> {
  const res = await fetch(CIRCLES_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`Circles RPC ${method} → HTTP ${res.status}`);
  const json = await res.json();
  if (json?.error) throw new Error(json.error.message || `Circles RPC ${method} error`);
  return json?.result;
}

/** Generic circles_query → array of row objects (column-name keyed). */
export async function circlesQuery(
  query: Record<string, unknown>,
): Promise<Record<string, any>[]> {
  let result: any;
  try {
    result = await rpc("circles_query", [query]);
  } catch {
    return [];
  }
  const columns: string[] = result?.columns ?? [];
  const rows: any[][] = result?.rows ?? [];
  return rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])));
}

export interface CirclesTransfer {
  from: string;
  to: string;
  value: bigint;
  timestamp: number; // epoch ms
  txHash: string;
}

/**
 * All Röbel Münzen (group-token) transfers, newest first. This is the full
 * on-chain money flow — mints (from = 0x0), rewards (from = funder), spends
 * (to = funder) and peer sends.
 */
export async function getGroupTransfers(limit = 1000): Promise<CirclesTransfer[]> {
  const rows = await circlesQuery({
    Namespace: "V_CrcV2",
    Table: "Transfers",
    Columns: [],
    Filter: [
      {
        // The Transfers view is NOT filterable by `tokenAddress` (computed
        // output column) — the RPC rejects it with -32602 and the query then
        // silently returns []. Filter by the ERC-1155 token id, which is
        // uint256(groupAddress), passed as a decimal string.
        Type: "FilterPredicate",
        FilterType: "Equals",
        Column: "id",
        Value: GROUP_TOKEN_ID.toString(),
      },
    ],
    Order: [{ Column: "blockNumber", SortOrder: "Desc" }],
    Limit: limit,
  });
  return rows
    .map((r) => ({
      from: lower(String(r.from ?? "")),
      to: lower(String(r.to ?? "")),
      value: safeBig(r.value),
      timestamp: Number(r.timestamp ?? 0) * 1000,
      txHash: String(r.transactionHash ?? ""),
    }))
    .filter((t) => t.value > 0n);
}

export interface GroupHolder {
  holder: string;
  atto: bigint; // demurraged group-token balance
}

/**
 * Live RCRC holders from the dedicated `V_CrcV2.GroupTokenHoldersBalance` view
 * (the source of truth — no dependency on the bounded transfer log). Each row is
 * a holder with a positive demurraged group-token balance.
 */
export async function getGroupHolders(): Promise<GroupHolder[]> {
  const rows = await circlesQuery({
    Namespace: "V_CrcV2",
    Table: "GroupTokenHoldersBalance",
    Columns: [],
    Filter: [
      { Type: "FilterPredicate", FilterType: "Equals", Column: "group", Value: lower(ADDR.group) },
    ],
    Order: [],
    Limit: 1000,
  });
  return rows
    .map((r) => ({
      holder: lower(String(r.holder ?? "")),
      atto: safeBig(r.demurragedTotalBalance ?? r.totalBalance ?? "0"),
    }))
    .filter((h) => h.holder && h.atto > 0n);
}

/**
 * Live RCRC circulation from `V_CrcV2.GroupTokenSupply.demurragedTotalSupply`
 * (atto). This is the on-chain truth for UMLAUF — independent of the transfer
 * log. Returns 0n if the view has no row for the group.
 */
export async function getGroupSupplyAtto(): Promise<bigint> {
  const rows = await circlesQuery({
    Namespace: "V_CrcV2",
    Table: "GroupTokenSupply",
    Columns: [],
    Filter: [
      { Type: "FilterPredicate", FilterType: "Equals", Column: "group", Value: lower(ADDR.group) },
    ],
    Order: [],
    Limit: 1,
  });
  if (!rows.length) return 0n;
  return safeBig(rows[0].demurragedTotalSupply ?? rows[0].totalSupply ?? "0");
}

export interface TrustEdge {
  truster: string;
  trustee: string;
}

/** Addresses that `truster` trusts (e.g. the group's trusted citizens). */
export async function trusteesOf(truster: string, limit = 200): Promise<string[]> {
  const rows = await circlesQuery({
    Namespace: "V_Crc",
    Table: "TrustRelations",
    Columns: ["trustee"],
    Filter: [
      { Type: "FilterPredicate", FilterType: "Equals", Column: "truster", Value: lower(truster) },
    ],
    Order: [],
    Limit: limit,
  });
  return rows.map((r) => lower(String(r.trustee ?? ""))).filter(Boolean);
}

/** Addresses that trust `trustee` (e.g. who invited a citizen). */
export async function trustersOf(trustee: string, limit = 200): Promise<string[]> {
  const rows = await circlesQuery({
    Namespace: "V_Crc",
    Table: "TrustRelations",
    Columns: ["truster"],
    Filter: [
      { Type: "FilterPredicate", FilterType: "Equals", Column: "trustee", Value: lower(trustee) },
    ],
    Order: [],
    Limit: limit,
  });
  return rows.map((r) => lower(String(r.truster ?? ""))).filter(Boolean);
}

export interface TokenBalance {
  tokenAddress: string;
  atto: bigint;
}

/**
 * All Circles token balances held by an address, via circles_getTokenBalances.
 * Used to total the collateral (personal CRC) locked in the group vault — the
 * GroupCollateralByToken RPC view is empty for BaseGroups, so we read the vault
 * directly (see project memory).
 */
export async function getTokenBalances(address: string): Promise<TokenBalance[]> {
  let result: any;
  try {
    result = await rpc("circles_getTokenBalances", [lower(address)]);
  } catch {
    return [];
  }
  const arr: any[] = Array.isArray(result) ? result : [];
  return arr.map((b) => ({
    tokenAddress: lower(String(b?.tokenAddress ?? b?.tokenId ?? "")),
    atto: safeBig(b?.attoCircles ?? b?.attoCrc ?? b?.balance ?? "0"),
  }));
}

/**
 * Sum of the personal-CRC balances locked in the group vault = collateral
 * backing the RCRC supply. Excludes any group-token balance (that would be RCRC
 * the vault happens to hold, not collateral). `GroupCollateralByToken` is empty
 * for BaseGroups, so we read the vault directly (see project memory).
 */
export async function getVaultCollateralAtto(): Promise<bigint> {
  const group = lower(ADDR.group);
  const balances = await getTokenBalances(ADDR.vault);
  return balances
    .filter((b) => b.tokenAddress !== group)
    .reduce((sum, b) => sum + b.atto, 0n);
}

export interface CirclesAvatar {
  name: string | null;
  imageUrl: string | null;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function digestToCidV0(hex: string): string {
  const h = hex.replace(/^0x/, "");
  const bytes = [0x12, 0x20];
  for (let i = 0; i < h.length; i += 2) bytes.push(parseInt(h.slice(i, i + 2), 16));
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  let num = 0n;
  for (const b of bytes) num = num * 256n + BigInt(b);
  let out = "";
  while (num > 0n) {
    out = B58[Number(num % 58n)] + out;
    num /= 58n;
  }
  return "1".repeat(zeros) + out;
}

/**
 * Best-effort Circles avatar name + image for a batch of addresses (on-chain
 * Avatars row → optional IPFS profile for the display name/image). Capped and
 * resilient — failures resolve to nulls.
 */
export async function getAvatarsBatch(
  addresses: string[],
  withImages = false,
): Promise<Map<string, CirclesAvatar>> {
  const uniq = [...new Set(addresses.map(lower).filter(Boolean))].slice(0, 80);
  const map = new Map<string, CirclesAvatar>();
  await Promise.all(
    uniq.map(async (a) => {
      try {
        const rows = await circlesQuery({
          Namespace: "V_CrcV2",
          Table: "Avatars",
          Columns: [],
          Filter: [{ Type: "FilterPredicate", FilterType: "Equals", Column: "avatar", Value: a }],
          Order: [],
          Limit: 1,
        });
        if (!rows.length) {
          map.set(a, { name: null, imageUrl: null });
          return;
        }
        let name: string | null = (rows[0].name as string) ?? null;
        let imageUrl: string | null = null;
        const digest = rows[0].cidV0Digest as string | undefined;
        if (withImages && digest && digest !== "0x" + "0".repeat(64)) {
          try {
            const cid = digestToCidV0(digest);
            const p = await fetch(`${PROFILE_GET}${cid}`).then((r) => r.json());
            name = p?.name ?? name;
            imageUrl = p?.imageUrl || p?.previewImageUrl || null;
          } catch {
            /* keep on-chain name */
          }
        }
        map.set(a, { name, imageUrl });
      } catch {
        map.set(a, { name: null, imageUrl: null });
      }
    }),
  );
  return map;
}
