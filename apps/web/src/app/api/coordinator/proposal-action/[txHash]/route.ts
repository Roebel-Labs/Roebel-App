import { NextRequest, NextResponse } from "next/server";
import { Interface, JsonRpcProvider, keccak256, toUtf8Bytes } from "ethers";

/**
 * GET /api/coordinator/proposal-action/[txHash]
 *
 * Given the propose() transaction hash, fetch the on-chain tx, decode the
 * propose() input, and return the (targets, values, calldatas, descriptionHash)
 * tuple needed to call Governor.queue() / Governor.execute().
 *
 * We don't store the propose() arguments in Supabase (only the resulting
 * proposalId / Irys CID), so we reconstruct them on demand. This is the
 * authoritative source — straight from the chain, no possibility of drift.
 *
 * Public — the data here is already on-chain. Founder-gating is enforced
 * at the queue/execute step by Governor.queue itself (msg.sender must
 * have the PROPOSER role, which on OZ Governor is any address). Anyone
 * with this data could queue any Succeeded proposal anyway.
 */
const GOVERNOR_IFACE = new Interface([
  "function propose(address[] targets, uint256[] values, bytes[] calldatas, string description) returns (uint256)",
]);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ txHash: string }> }
) {
  const { txHash } = await params;
  if (!/^0x[a-f0-9]{64}$/i.test(txHash)) {
    return NextResponse.json({ error: "invalid txHash" }, { status: 400 });
  }

  const rpcUrl = process.env.BASE_RPC_URL ?? "https://base-rpc.publicnode.com";
  const provider = new JsonRpcProvider(rpcUrl, undefined, { batchMaxCount: 1 });

  let tx;
  try {
    tx = await provider.getTransaction(txHash);
  } catch (err) {
    return NextResponse.json(
      {
        error: "rpc getTransaction failed",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }

  if (!tx) {
    return NextResponse.json({ error: "tx not found" }, { status: 404 });
  }

  let decoded;
  try {
    decoded = GOVERNOR_IFACE.parseTransaction({
      data: tx.data,
      value: tx.value,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "tx is not a propose() call",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 422 }
    );
  }

  if (!decoded || decoded.name !== "propose") {
    return NextResponse.json(
      { error: "tx is not a propose() call", got: decoded?.name },
      { status: 422 }
    );
  }

  const [targets, values, calldatas, description] = decoded.args as unknown as [
    string[],
    bigint[],
    string[],
    string,
  ];

  const descriptionHash = keccak256(toUtf8Bytes(description));

  return NextResponse.json({
    targets,
    values: values.map((v) => v.toString()),
    calldatas,
    description,
    descriptionHash,
    proposer: tx.from,
    governor: tx.to,
  });
}
