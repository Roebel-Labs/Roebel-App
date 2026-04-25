import { NextResponse } from "next/server";
import NodeIrys from "@irys/sdk";

/**
 * GET /api/irys/balance
 *
 * Returns the Irys node balance for the server wallet (the wallet
 * derived from IRYS_UPLOAD_PRIVATE_KEY). Uploads draw from this
 * deposited balance, not directly from the wallet's on-chain ETH.
 */
export async function GET() {
  try {
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

    const atomicBalance = await irys.getLoadedBalance();
    const ethBalance = irys.utils.fromAtomic(atomicBalance).toString();

    return NextResponse.json({
      address: irys.address,
      atomicBalance: atomicBalance.toString(),
      ethBalance,
      token: "base-eth",
      network: "mainnet",
    });
  } catch (error) {
    console.error("❌ [API] Irys balance check failed:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
