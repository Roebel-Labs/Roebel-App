import { NextRequest, NextResponse } from "next/server";
import NodeIrys from "@irys/sdk";

// Hard cap per call to limit blast radius. The user can call repeatedly.
// 0.005 ETH is enough to cover ~hundreds of small text uploads.
const MAX_FUND_ETH = 0.005;

/**
 * POST /api/irys/fund
 *
 * Body: { amountEth: string | number }
 *
 * Moves Base ETH from the server wallet (IRYS_UPLOAD_PRIVATE_KEY) onto
 * the Irys node so subsequent /api/irys/upload calls have credit. Caps
 * the per-call amount at MAX_FUND_ETH for safety.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const requestedAmount = Number(body?.amountEth);

    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return NextResponse.json(
        { error: "amountEth must be a positive number" },
        { status: 400 }
      );
    }

    if (requestedAmount > MAX_FUND_ETH) {
      return NextResponse.json(
        { error: `amountEth exceeds per-call cap of ${MAX_FUND_ETH} ETH` },
        { status: 400 }
      );
    }

    const uploadPrivateKey = process.env.IRYS_UPLOAD_PRIVATE_KEY;
    if (!uploadPrivateKey) {
      return NextResponse.json(
        { error: "Server configuration error: IRYS_UPLOAD_PRIVATE_KEY not set" },
        { status: 500 }
      );
    }

    const irys = new NodeIrys({
      network: "mainnet",
      token: "base-eth",
      key: uploadPrivateKey,
    });

    const atomicAmount = irys.utils.toAtomic(requestedAmount);

    console.log(
      `💰 [API] Funding Irys node for ${irys.address}: ${requestedAmount} ETH (${atomicAmount.toString()} atomic)`
    );

    const fundTx = await irys.fund(atomicAmount);
    const newBalance = await irys.getLoadedBalance();

    console.log("✅ [API] Funding complete:", fundTx);

    return NextResponse.json({
      success: true,
      address: irys.address,
      fundedEth: requestedAmount,
      txId: fundTx.id,
      newAtomicBalance: newBalance.toString(),
      newEthBalance: irys.utils.fromAtomic(newBalance).toString(),
    });
  } catch (error) {
    console.error("❌ [API] Irys funding failed:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
