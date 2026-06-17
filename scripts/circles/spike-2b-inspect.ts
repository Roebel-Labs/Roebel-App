// Spike 2b — introspect the existing burner avatar (type + balances + trust).
import { Sdk } from "@aboutcircles/sdk";
import { circlesConfig } from "@aboutcircles/sdk-core";
import { makeRunner } from "./runner";
import { loadEnv } from "./_env";

async function main() {
  const { privKey, rpc } = loadEnv();
  const runner = makeRunner(privKey, rpc);
  await runner.init();
  const me = runner.address;
  const sdk = new Sdk(circlesConfig[100], runner as any);

  const avatar: any = await sdk.getAvatar(me);
  console.log("constructor:", avatar?.constructor?.name);
  console.log("avatar keys:", Object.keys(avatar).join(", "));
  for (const k of ["avatarType", "type", "address", "avatarInfo"]) {
    if (avatar[k] !== undefined) console.log(`  ${k}:`, typeof avatar[k] === "object" ? JSON.stringify(avatar[k]) : avatar[k]);
  }

  // Try the data API for authoritative avatar info.
  try {
    const info = await sdk.data.getAvatarInfo?.(me);
    console.log("data.getAvatarInfo:", JSON.stringify(info));
  } catch (e: any) { console.log("getAvatarInfo n/a:", e?.message); }

  // Balances (does it already hold/mint personal CRC?).
  try {
    const balances = await avatar.balances?.getTokenBalances?.();
    console.log("token balances:", JSON.stringify(balances));
  } catch (e: any) { console.log("balances n/a:", e?.message); }
}

main().catch((e) => { console.error("INSPECT FAILED:", e?.shortMessage ?? e?.message ?? e); process.exit(1); });
