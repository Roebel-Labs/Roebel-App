// Cron (every 5 min): attesters get an in-app notice and a push for each org registration request
// that waits for their vote. Told once per request and attester (the notifications row is the marker).
import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbi, type Address, type Hex } from "viem";
import { gnosis } from "viem/chains";
import { orgIdFromUuid } from "@netizen-labs/protocol";
import { attesterNFTGnosisAddress } from "@/lib/gnosis";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotificationNotifier } from "@/lib/credentials/notify";
import {
  ORG_REQUEST_KIND,
  ORG_REQUEST_NOTIFICATION_TYPE,
  orgRequestCopy,
  planOrgRequestNotices,
  type ChainOrgRequest,
} from "@/lib/attester-tasks/org-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** NSP-14 OrgRegistry on Gnosis (deployments/org-registry.json). */
const ORG_REGISTRY = "0x320b4ea2f4E31b81245e684D08AF593DE05E9919";
/** Newest requests scanned per run (requests live 30 days; far fewer than this are ever open). */
const SCAN = 50;
/** Token ids probed for attester holders (burned ids leave gaps). */
const MAX_TOKEN_PROBE = 300;

const registryAbi = parseAbi([
  "function requestCount() view returns (uint256)",
  "function hasVoted(uint256 requestId, address attester) view returns (bool)",
  "function getRequest(uint256 requestId) view returns ((uint8 requestType, uint8 status, bytes32 orgId, address safe, address requester, string uri, uint32 approvals, uint32 rejections, uint32 requiredApprovals, uint32 requiredRejections, uint64 createdAt, uint64 expiresAt, uint64 claimGeneration))",
]);
const attesterAbi = parseAbi(["function attesterCount() view returns (uint256)", "function ownerOf(uint256 tokenId) view returns (address)"]);
const safeAbi = parseAbi(["function getOwners() view returns (address[])"]);

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const registry = (process.env.ORG_REGISTRY_ADDRESS || ORG_REGISTRY) as Address;
  const attesterNft = attesterNFTGnosisAddress as Address;
  const client = createPublicClient({ chain: gnosis, transport: http(process.env.GNOSIS_RPC_URL || "https://rpc.gnosischain.com", { timeout: 10_000 }) });

  try {
    const count = Number(await client.readContract({ address: registry, abi: registryAbi, functionName: "requestCount" }));
    if (count === 0) return NextResponse.json({ notified: 0 });
    const first = Math.max(0, count - SCAN);
    const ids = Array.from({ length: count - first }, (_, i) => first + i);
    const raw = await client.multicall({
      contracts: ids.map((id) => ({ address: registry, abi: registryAbi, functionName: "getRequest", args: [BigInt(id)] }) as const),
      allowFailure: false,
    });
    const now = Math.floor(Date.now() / 1000);
    const requests: ChainOrgRequest[] = raw.map((r, i) => ({
      id: ids[i],
      status: Number(r.status),
      orgId: r.orgId,
      safe: r.safe,
      expiresAt: Number(r.expiresAt),
    }));
    const open = requests.filter((r) => r.status === 0 && r.expiresAt > now);
    if (open.length === 0) return NextResponse.json({ notified: 0 });

    // Attester holders: ownerOf over token ids until attesterCount holders are found.
    const holders = Number(await client.readContract({ address: attesterNft, abi: attesterAbi, functionName: "attesterCount" }));
    const attesters: string[] = [];
    for (let start = 0; start < MAX_TOKEN_PROBE && attesters.length < holders; start += 50) {
      const probe = await client.multicall({
        contracts: Array.from({ length: 50 }, (_, i) => ({ address: attesterNft, abi: attesterAbi, functionName: "ownerOf", args: [BigInt(start + i)] }) as const),
        allowFailure: true,
      });
      for (const p of probe) if (p.status === "success") attesters.push((p.result as string).toLowerCase());
    }

    const votePairs = open.flatMap((r) => attesters.map((a) => ({ r, a })));
    const votes = await client.multicall({
      contracts: votePairs.map(({ r, a }) => ({ address: registry, abi: registryAbi, functionName: "hasVoted", args: [BigInt(r.id), a as Address] }) as const),
      allowFailure: true,
    });
    const voted = new Set<string>();
    votes.forEach((v, i) => {
      if (v.status === "success" && v.result) voted.add(`${votePairs[i].r.id}:${votePairs[i].a}`);
    });

    const ownerReads = await client.multicall({
      contracts: open.map((r) => ({ address: r.safe as Address, abi: safeAbi, functionName: "getOwners" }) as const),
      allowFailure: true,
    });
    const owners = new Map<number, Set<string>>();
    open.forEach((r, i) => {
      const o = ownerReads[i];
      owners.set(r.id, new Set(o.status === "success" ? (o.result as readonly string[]).map((x) => x.toLowerCase()) : []));
    });

    const supabase = createAdminClient();
    const { data: orgs } = await supabase.from("accounts").select("id, name").eq("account_type", "organisation");
    const names = new Map<string, string>();
    for (const o of (orgs ?? []) as { id: string; name: string | null }[]) {
      if (o.name) names.set((orgIdFromUuid(o.id) as Hex).toLowerCase(), o.name);
    }

    const { data: sent } = await supabase
      .from("notifications")
      .select("recipient_wallet, metadata")
      .eq("type", ORG_REQUEST_NOTIFICATION_TYPE)
      .eq("metadata->>kind", ORG_REQUEST_KIND)
      .in("metadata->>requestId", open.map((r) => String(r.id)));
    const notified = new Set<string>(
      ((sent ?? []) as { recipient_wallet: string; metadata: { requestId?: string } | null }[]).map(
        (n) => `${n.metadata?.requestId}:${n.recipient_wallet.toLowerCase()}`,
      ),
    );

    const plan = planOrgRequestNotices({ requests: open, attesters, voted, owners, notified, names, now });
    if (plan.length === 0) return NextResponse.json({ notified: 0 });

    const rows = plan.map((n) => {
      const copy = orgRequestCopy(n.orgName);
      return {
        recipient_wallet: n.wallet,
        type: ORG_REQUEST_NOTIFICATION_TYPE,
        title: copy.title,
        body: copy.body,
        metadata: { kind: ORG_REQUEST_KIND, requestId: String(n.requestId), orgName: n.orgName, route: "/verification/orgs" },
      };
    });
    const { error } = await supabase.from("notifications").insert(rows);
    if (error) {
      console.error("[cron/attester-tasks] insert failed", error.code);
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }

    const notifier = sendNotificationNotifier();
    const byRequest = new Map<number, typeof plan>();
    for (const n of plan) byRequest.set(n.requestId, [...(byRequest.get(n.requestId) ?? []), n]);
    for (const [requestId, list] of byRequest) {
      const copy = orgRequestCopy(list[0].orgName);
      await notifier.push({
        wallets: list.map((n) => n.wallet),
        // send-notification only filters known types; unknown ones go to every linked device.
        type: ORG_REQUEST_NOTIFICATION_TYPE as never,
        title: copy.title,
        body: copy.body,
        data: { type: ORG_REQUEST_NOTIFICATION_TYPE, kind: ORG_REQUEST_KIND, requestId: String(requestId) },
      });
    }
    return NextResponse.json({ notified: plan.length });
  } catch (e) {
    // Never the message: a viem error can carry a keyed RPC URL.
    console.error("[cron/attester-tasks] failed", e instanceof Error ? e.name : typeof e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
