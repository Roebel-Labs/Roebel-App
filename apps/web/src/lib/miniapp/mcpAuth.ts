// Developer MCP bearer resolution. Only `nz_` API keys are accepted — a bare
// wallet address is never a credential. Kept free of server-only / `@/` imports
// so node:test can load it.
import type { DeveloperRow } from "./types";

export async function resolveMcpDeveloper(
  bearer: string | undefined,
  deps: { verifyApiKey(key: string): Promise<DeveloperRow | null> },
): Promise<DeveloperRow | null> {
  if (!bearer || !bearer.startsWith("nz_")) return null;
  return deps.verifyApiKey(bearer);
}
