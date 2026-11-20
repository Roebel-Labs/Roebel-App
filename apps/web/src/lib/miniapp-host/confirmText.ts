// The reviewer's confirmation text in the web preview (Playground): the app, the method and,
// for sends, one line per call — `<Label> · <function>` for a call the manifest declares,
// `NICHT ANGEMELDET · <address>` otherwise. The reviewer is the one person who should see the
// address. Matching uses the shared SDK rule (`findDeclaredCall`), like the Expo host and the node.
// No `server-only`, no `@/` alias: loaded by node:test.
import { callRules, findDeclaredCall, type DeclaredContract } from "@netizen-labs/miniapp-sdk/host";
import type { Eip1193RequestArgs } from "@netizen-labs/miniapp-sdk";

interface RawCall {
  to?: unknown;
  data?: unknown;
}

function callsOf(req: Eip1193RequestArgs): RawCall[] | null {
  const params = Array.isArray(req.params) ? req.params : [];
  if (req.method === "eth_sendTransaction") {
    const tx = params[0];
    return [tx && typeof tx === "object" ? (tx as RawCall) : {}];
  }
  if (req.method === "wallet_sendCalls") {
    const calls = (params[0] as { calls?: unknown } | undefined)?.calls;
    return Array.isArray(calls) ? calls.map((c) => (c && typeof c === "object" ? (c as RawCall) : {})) : [];
  }
  return null;
}

export function confirmText(
  app: { name: string; contracts?: DeclaredContract[] },
  req: Eip1193RequestArgs,
  toSelector: (signature: string) => string,
): string {
  const head = `${app.name} möchte signieren:\n${req.method}`;
  const calls = callsOf(req);
  if (!calls) return `${head}\n\nAls Prüfer:in bestätigen?`;
  const rules = callRules(app.contracts ?? [], toSelector);
  const lines = calls.map((c, i) => {
    const to = typeof c.to === "string" ? c.to : undefined;
    const data = typeof c.data === "string" ? c.data : undefined;
    const match = findDeclaredCall(rules, to, data);
    const text = match ? `${match.label} · ${match.name}` : `NICHT ANGEMELDET · ${to ?? "(neuer Vertrag)"}`;
    return calls.length > 1 ? `${i + 1}. ${text}` : text;
  });
  return `${head}\n\n${lines.join("\n")}\n\nAls Prüfer:in bestätigen?`;
}
