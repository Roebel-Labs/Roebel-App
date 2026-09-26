// Pack 'money' (risk 'money', spec §3.1/§4): Röbel Münzen transfers. The
// server resolves the recipient to a wallet and puts it only into the
// approval card's signRequest; the device signs with the user's smart wallet
// and reports back via /api/chat/actions/:id/complete. Never grantable, never
// executed server-side. The wallet never appears in summary/preview/output.
import { z } from "zod";
import { ToolInputError } from "../errors";
import { resolveRecipient } from "../recipients";
import type { ResolvedRecipient } from "../recipients";
import type { HarnessContext, HarnessTool, SignRequest, ToolRegistry } from "../types";

export const MAX_TRANSFER = 100;

/**
 * Validates a Röbel Münzen amount: > 0, ≤ 100, at most 2 decimals. Accepts
 * numbers and strings with "," or "." as decimal separator. Returns the
 * German display form ("12,5") that the app's parseTalerAmount understands.
 */
export function parseMuenzenAmount(raw: unknown): { ok: true; value: number; display: string } | { ok: false; error: string } {
  let s: string;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { ok: false, error: "Bitte gib einen gültigen Betrag an." };
    s = String(raw);
  } else if (typeof raw === "string") {
    s = raw.trim().replace(/\s+/g, "");
  } else {
    return { ok: false, error: "Bitte gib einen Betrag an." };
  }
  s = s.replace(/(röbel)?münzen$/i, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, error: "Bitte gib einen gültigen Betrag an, z. B. 5 oder 2,50." };
  const [, frac = ""] = s.split(".");
  if (frac.replace(/0+$/, "").length > 2) return { ok: false, error: "Höchstens zwei Nachkommastellen, z. B. 2,50." };
  const value = Number(s);
  if (!(value > 0)) return { ok: false, error: "Der Betrag muss größer als 0 sein." };
  if (value > MAX_TRANSFER) return { ok: false, error: `Über den Chat gehen höchstens ${MAX_TRANSFER} Röbel Münzen pro Überweisung.` };
  const display = String(Math.round(value * 100) / 100).replace(".", ",");
  return { ok: true, value, display };
}

function amountOrThrow(raw: unknown) {
  const a = parseMuenzenAmount(raw);
  if (!a.ok) throw new ToolInputError(a.error);
  return a;
}

async function adminDb() {
  const { createAdminClient } = await import("../../../supabase/admin");
  return createAdminClient();
}

/** Resolver seam (tests swap it). */
export const moneyDeps = {
  resolve: async (query: string, ctx: HarnessContext): Promise<ResolvedRecipient> =>
    resolveRecipient(await adminDb(), query, ctx.wallet),
};

const input = z.object({
  recipient: z.string().min(1).max(80).describe("Benutzername (@name) oder genauer Anzeigename der Person in der Röbel-App"),
  amount: z.union([z.number(), z.string().max(20)]).describe("Betrag in Röbel Münzen, > 0, höchstens 100, max. 2 Nachkommastellen"),
});
type Input = z.infer<typeof input>;

export const transferMuenzen: HarnessTool<Input> = {
  name: "transfer_muenzen",
  pack: "money",
  risk: "money",
  description:
    "Sendet Röbel Münzen an eine Person in der Röbel-App (Empfänger per @Benutzername oder genauem Anzeigenamen). " +
    "Höchstens 100 pro Überweisung. Der Mensch bestätigt und signiert auf seinem Gerät. " +
    "Gibt es mehrere Personen mit dem Namen, frag nach dem genauen @Benutzernamen.",
  inputSchema: input,
  summarize: ({ recipient, amount }) => {
    const a = parseMuenzenAmount(amount);
    const name = recipient.trim().replace(/^@+/, "");
    return `${a.ok ? a.display : String(amount)} Röbel Münzen an ${name.slice(0, 60)} senden`;
  },
  preview: async ({ recipient, amount }, ctx) => {
    const a = amountOrThrow(amount);
    const to = await moneyDeps.resolve(recipient, ctx);
    return {
      kind: "transfer",
      fields: [
        { label: "An", value: to.name },
        { label: "Betrag", value: `${a.display} Röbel Münzen` },
      ],
      body: "Du bestätigst die Überweisung auf deinem Gerät.",
    };
  },
  signRequest: async ({ recipient, amount }, ctx): Promise<SignRequest> => {
    const a = amountOrThrow(amount);
    const to = await moneyDeps.resolve(recipient, ctx);
    return { kind: "muenzen_transfer", toName: to.name, amount: a.display, toWallet: to.wallet };
  },
  // Money is executed on the device (approve → sign → /complete), never here.
  execute: async () => {
    throw new ToolInputError("Überweisungen werden auf dem Gerät des Menschen signiert.");
  },
};

export function register(registry: ToolRegistry): void {
  registry.registerTool(transferMuenzen);
}
