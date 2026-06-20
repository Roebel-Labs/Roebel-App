// Generates the Röbel Münzen FUNDER hot wallet (the cashier that pays civic rewards).
// Run it LOCALLY; it prints the address + private key to YOUR terminal only. Never commit
// or paste the key anywhere except the Supabase secret.
//
//   pnpm exec tsx scripts/circles/gen-funder-wallet.ts
//
// Then:
//   1) Set the secret (Supabase Dashboard → Edge Functions → Secrets, or CLI):
//        FUNDER_PRIVKEY = 0x<the printed key>
//   2) Seed the funder with Röbel Münzen (from the Stadtkasse Safe or your wallet) +
//      a little xDAI for gas, sending to the printed ADDRESS.
//   3) Top it up periodically; keep only a small float there (Safe holds the reserve).
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const pk = generatePrivateKey();
const account = privateKeyToAccount(pk);

console.log("\n  Röbel Münzen Funder wallet");
console.log("  ──────────────────────────");
console.log("  address     :", account.address);
console.log("  FUNDER_PRIVKEY:", pk);
console.log("\n  ⚠  Hot key. Put it ONLY in the Supabase secret FUNDER_PRIVKEY.");
console.log("     Keep just a small float here; the Safe is the reserve. Rotate if exposed.\n");
