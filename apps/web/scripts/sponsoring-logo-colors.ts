#!/usr/bin/env -S npx tsx
// Precomputes the Logo-Spot background for every org logo: the dominant edge colour (see
// logoEdgeColor in src/lib/sponsoring.ts). Writes public/sponsoring/logo-colors.json
// ({ [avatar_url]: "#RRGGBB" | null }), which the app fetches from the website, so a rerun +
// deploy updates colours without an app update. Logos not in the file show on white.
//   cd apps/web && npx tsx scripts/sponsoring-logo-colors.ts
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
import { logoEdgeColor } from "../src/lib/sponsoring";

const root = path.join(__dirname, "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env.local"), "utf8").split("\n")
    .filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
// sharp is only a transitive dependency of next (not linked into apps/web): resolve it from pnpm's hidden hoist.
const require = createRequire(path.join(root, "..", "..", "node_modules", ".pnpm", "node_modules", "_"));
const sharp = require("sharp") as typeof import("sharp");

async function main() {
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: orgs, error } = await db.from("accounts").select("name, avatar_url").eq("account_type", "organisation").not("avatar_url", "is", null);
  if (error) throw error;

  const out: Record<string, string | null> = {};
  for (const o of orgs ?? []) {
    const url = o.avatar_url as string;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const { data, info } = await sharp(buf).resize(48, 48, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      out[url] = logoEdgeColor(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), info.width, info.height);
      console.log(`${(out[url] ?? "transparent").padEnd(12)} ${o.name}`);
    } catch (err) {
      console.log(`SKIP         ${o.name}: ${(err as Error).message}`);
    }
  }
  const file = path.join(root, "public", "sponsoring", "logo-colors.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
  console.log(`\n${Object.keys(out).length} colours → ${path.relative(root, file)}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
