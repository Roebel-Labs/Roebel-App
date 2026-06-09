import { NextRequest, NextResponse } from "next/server";
import {
  AbiCoder,
  Interface,
  JsonRpcProvider,
  keccak256,
  toUtf8Bytes,
} from "ethers";
import { MACI_INFRA } from "@/lib/maci-config";

/**
 * GET /api/coordinator/proposal-action/[txHash]
 *
 * Given the propose() transaction hash, return the
 * (targets, values, calldatas, descriptionHash) tuple needed to call
 * Governor.queue() / Governor.execute().
 *
 * We CANNOT parse the tx input directly: the founder signs propose()
 * through thirdweb's smart-account stack, so the on-chain tx is actually
 * an ERC-4337 `handleOps` call to the EntryPoint at
 * 0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789, not a direct call to the
 * Governor. The propose() calldata is buried inside the UserOperation's
 * callData and would require decoding the bundled UserOp + the smart
 * account's `execute()` wrapper to reach.
 *
 * Instead we parse the **ProposalCreated event** emitted by the Governor
 * itself. Same data, same authority, works for EOAs and smart accounts
 * transparently, and is robust against whatever wallet plumbing changes
 * in the future.
 *
 * OZ Governor's event signature (all fields unindexed):
 *
 *   event ProposalCreated(
 *     uint256 proposalId,
 *     address proposer,
 *     address[] targets,
 *     uint256[] values,
 *     string[] signatures,
 *     bytes[] calldatas,
 *     uint256 voteStart,
 *     uint256 voteEnd,
 *     string description
 *   );
 */
const PROPOSAL_CREATED_TOPIC =
  "0x7d84a6263ae0d98d3329bd7b46bb4e8d6f98cd35a7adb45c274c8b7fd5ebd5e0";

const PROPOSAL_CREATED_IFACE = new Interface([
  "event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)",
]);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ txHash: string }> }
) {
  const { txHash } = await params;
  if (!/^0x[a-f0-9]{64}$/i.test(txHash)) {
    return NextResponse.json({ error: "invalid txHash" }, { status: 400 });
  }

  // publicnode silently returns `{ result: null }` for some receipts even
  // hours after inclusion (observed for the rotation propose tx). Treat
  // BASE_RPC_URL as the preferred endpoint but fall through to other
  // public RPCs whenever a receipt comes back null — that's strictly an
  // availability problem, the tx itself is on-chain (anyone can verify
  // on BaseScan).
  const rpcCandidates: string[] = Array.from(
    new Set(
      [
        process.env.BASE_RPC_URL,
        "https://mainnet.base.org",
        "https://1rpc.io/base",
        "https://base-rpc.publicnode.com",
      ].filter((s): s is string => typeof s === "string" && s.length > 0)
    )
  );

  let receipt = null;
  let lastErr: unknown = null;
  let usedRpc: string | null = null;
  for (const rpcUrl of rpcCandidates) {
    try {
      const provider = new JsonRpcProvider(rpcUrl, undefined, {
        batchMaxCount: 1,
      });
      const r = await provider.getTransactionReceipt(txHash);
      if (r) {
        receipt = r;
        usedRpc = rpcUrl;
        break;
      }
    } catch (err) {
      lastErr = err;
    }
  }

  if (!receipt) {
    return NextResponse.json(
      {
        error: "tx not found on any RPC",
        triedRpcs: rpcCandidates,
        lastErr:
          lastErr instanceof Error ? lastErr.message : lastErr ? String(lastErr) : null,
      },
      { status: 404 }
    );
  }

  // Attach which endpoint served the receipt to the success response so
  // it's easy to see in DevTools which RPC actually worked.
  void usedRpc;

  // Find the ProposalCreated log emitted by the CURRENT MACI Governor.
  // We don't accept a log from any other address — that would let
  // someone forge a proposalId by deploying their own contract that
  // emits the same event.
  const governorLower = MACI_INFRA.governor.toLowerCase();
  const log = receipt.logs.find(
    (l) =>
      l.address.toLowerCase() === governorLower &&
      l.topics[0]?.toLowerCase() === PROPOSAL_CREATED_TOPIC
  );

  if (!log) {
    return NextResponse.json(
      {
        error:
          "no ProposalCreated log from the current Governor in this tx — wrong tx, wrong governor, or tx reverted",
        governor: MACI_INFRA.governor,
      },
      { status: 422 }
    );
  }

  let decoded;
  try {
    decoded = PROPOSAL_CREATED_IFACE.parseLog({
      topics: log.topics as string[],
      data: log.data,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "failed to decode ProposalCreated log",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }

  if (!decoded) {
    return NextResponse.json(
      { error: "ProposalCreated decode returned null" },
      { status: 500 }
    );
  }

  // Field order per the event signature above. We use POSITIONAL access
  // (decoded.args[N]) — not named — because ethers v6's Result type
  // shadows the "values" key with Array.prototype.values(), so
  // `decoded.args.values` returns a function instead of the bigint[].
  // Positional access bypasses the prototype-method collision entirely.
  const proposalId = decoded.args[0] as bigint;
  const proposer = decoded.args[1] as string;
  const targets = decoded.args[2] as string[];
  const valuesArr = decoded.args[3] as bigint[];
  const calldatas = decoded.args[5] as string[];
  const description = decoded.args[8] as string;

  const descriptionHash = keccak256(toUtf8Bytes(description));

  // Sanity: re-derive proposalId via the canonical OZ Governor formula
  // (keccak(abi.encode(targets, values, calldatas, descriptionHash))) so
  // we never hand the client a tuple that wouldn't queue cleanly. If this
  // check fails we'd rather error than silently feed bad data into a tx.
  const recomputedId = BigInt(
    keccak256(
      AbiCoder.defaultAbiCoder().encode(
        ["address[]", "uint256[]", "bytes[]", "bytes32"],
        [targets, valuesArr, calldatas, descriptionHash]
      )
    )
  );
  if (recomputedId !== proposalId) {
    return NextResponse.json(
      {
        error: "proposalId mismatch — refusing to return mismatched calldata",
        eventProposalId: proposalId.toString(),
        recomputedProposalId: recomputedId.toString(),
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    targets,
    values: valuesArr.map((v) => v.toString()),
    calldatas,
    description,
    descriptionHash,
    proposer,
    governor: log.address,
    proposalId: proposalId.toString(),
  });
}
