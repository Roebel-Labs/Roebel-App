// The one place the web host decides whether a mini app's wallet call may reach
// the connected wallet. Uses the shared SDK rule (`classifyWalletMethod`):
//   read        → forwarded as is
//   sign        → forwarded only after an explicit confirmation
//   unsupported → refused, never forwarded
// Thrown errors are `{ code, message }` so the host bridge keeps their code.
// No `server-only`, no `@/` alias: loaded by node:test.
import { classifyWalletMethod } from "@netizen-labs/miniapp-sdk/host";
import type { Eip1193RequestArgs } from "@netizen-labs/miniapp-sdk";

export interface WalletGatePorts {
  confirm(req: Eip1193RequestArgs): Promise<boolean>;
  forward(req: Eip1193RequestArgs): Promise<unknown>;
}

export async function gateWalletRequest(req: Eip1193RequestArgs, p: WalletGatePorts): Promise<unknown> {
  const kind = classifyWalletMethod(req.method);
  if (kind === "unsupported") {
    throw { code: "unsupported", message: `Wallet-Methode "${req.method}" wird nicht unterstützt.` };
  }
  if (kind === "sign" && !(await p.confirm(req))) {
    throw { code: "user_rejected", message: "Vom Nutzer abgelehnt." };
  }
  return p.forward(req);
}
