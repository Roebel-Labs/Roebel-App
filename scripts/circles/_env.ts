// Tiny .env loader for the spike scripts (avoids a dotenv dependency and keeps
// the burner key out of the process command line). Reads scripts/circles/.env.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export function loadEnv(): { privKey: `0x${string}`; rpc: string } {
  // Prefer real env vars if already set; otherwise parse the local .env file.
  let privKey = process.env.SPIKE_PRIVKEY;
  let rpc = process.env.GNOSIS_RPC_URL;
  if (!privKey || !rpc) {
    const raw = readFileSync(join(here, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
      if (!m) continue;
      if (m[1] === "SPIKE_PRIVKEY" && !privKey) privKey = m[2];
      if (m[1] === "GNOSIS_RPC_URL" && !rpc) rpc = m[2];
    }
  }
  if (!privKey) throw new Error("SPIKE_PRIVKEY missing");
  if (!rpc) throw new Error("GNOSIS_RPC_URL missing");
  if (!privKey.startsWith("0x")) privKey = `0x${privKey}`;
  return { privKey: privKey as `0x${string}`, rpc };
}
