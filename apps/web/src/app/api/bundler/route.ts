import { NextResponse } from "next/server";

/**
 * Server-side proxy to a higher-cap ERC-4337 bundler on Gnosis, used ONLY for
 * creating a governance proposal. `propose()` deploys a MACI Poll inline
 * (~15.7M gas), which exceeds thirdweb's hosted bundler cap of 12M gas/bundle.
 *
 * Why a proxy instead of pointing the client straight at the bundler:
 *  - The bundler API key stays SERVER-side (never shipped in the browser bundle).
 *  - No browser-origin / CORS surprises — the client calls our same-origin route.
 *  - thirdweb sends standard JSON-RPC (eth_estimateUserOperationGas,
 *    eth_sendUserOperation, eth_getUserOperationReceipt, …); we forward verbatim.
 *
 * Configure with a server-only env var (NOT NEXT_PUBLIC_):
 *   GNOSIS_BUNDLER_RPC_URL=https://api.pimlico.io/v2/100/rpc?apikey=YOUR_KEY
 */
const BUNDLER_RPC_URL = process.env.GNOSIS_BUNDLER_RPC_URL ?? "";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!BUNDLER_RPC_URL) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32000,
          message: "Bundler proxy not configured (GNOSIS_BUNDLER_RPC_URL is unset).",
        },
      },
      { status: 503 },
    );
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(BUNDLER_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[bundler-proxy] upstream request failed:", err);
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32603, message: "Bundler upstream request failed." },
      },
      { status: 502 },
    );
  }
}
