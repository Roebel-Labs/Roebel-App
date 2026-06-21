// GET /api/muenzen/wallets — system-wallet balances + treasury for the
// Wallets & Kasse tab. Documents the multisig reserve, hot funder, collateral
// vault, invite bot and (optional) operator, each with live balances + health.
import { NextResponse } from "next/server";
import { requireAdmin, isFresh, jsonError } from "@/lib/muenzen/api";
import { cached, TTL } from "@/lib/muenzen/cache";
import { walletAssets } from "@/lib/muenzen/gnosis";
import { loadCollateral, loadTransfers } from "@/lib/muenzen/economy";
import { resolveIdentities } from "@/lib/muenzen/identity";
import {
  SYSTEM_WALLETS,
  ADDR,
  XDAI_EUR,
  MUENZE_EUR,
  FUNDER_LOW_RCRC,
  OPERATOR_LOW_CRC,
  COLLATERAL_DRIFT_TOLERANCE,
  attoToNumber,
  type WalletMeta,
} from "@/lib/muenzen/constants";

export const dynamic = "force-dynamic";

interface Health {
  level: "ok" | "warning";
  note: string;
}

export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const fresh = isFresh(req);

  try {
    const data = await cached(
      "wallets",
      TTL.chain,
      async () => {
        const operatorAddr = process.env.MUENZEN_OPERATOR_ADDRESS?.trim();
        const list: WalletMeta[] = [...SYSTEM_WALLETS];
        if (operatorAddr) {
          list.splice(2, 0, {
            key: "operator",
            address: operatorAddr,
            label: "Operator (Einlade-Treibstoff)",
            role: "Server-Schlüssel · finanziert Touristen-/Event-Einladungen",
            kind: "operator",
            description:
              "Hält persönliche CRC, um neue Menschen einzuladen (registerHuman). Muss mit CRC versorgt bleiben.",
            watch: "personalCrc",
          });
        }

        const [collateral, transfers] = await Promise.all([
          loadCollateral(fresh),
          loadTransfers(fresh),
        ]);

        // Last on-chain RCRC activity per wallet (epoch ms).
        const lastActivity = new Map<string, number>();
        for (const t of transfers) {
          for (const a of [t.from, t.to]) {
            const prev = lastActivity.get(a) ?? 0;
            if (t.timestamp > prev) lastActivity.set(a, t.timestamp);
          }
        }

        const identities = await resolveIdentities(list.map((w) => w.address));

        const wallets = await Promise.all(
          list.map(async (w) => {
            const assets = await walletAssets(w.address);
            const rcrc = attoToNumber(assets.rcrc);
            const personalCrc = attoToNumber(assets.personalCrc);
            const xdai = attoToNumber(assets.xdai);
            const eure = attoToNumber(assets.eure);
            const euro = xdai * XDAI_EUR + eure + rcrc * MUENZE_EUR;

            let health: Health | null = null;
            if (w.kind === "hot" && rcrc < FUNDER_LOW_RCRC) {
              health = { level: "warning", note: "Float niedrig – aus der Reserve nachfüllen" };
            } else if (w.kind === "hot") {
              health = { level: "ok", note: "Float ausreichend" };
            } else if (w.kind === "operator") {
              health =
                personalCrc < OPERATOR_LOW_CRC
                  ? { level: "warning", note: "CRC-Budget niedrig – Einladungen gefährdet" }
                  : { level: "ok", note: "CRC-Budget ausreichend" };
            } else if (w.kind === "vault") {
              health =
                collateral.ratio < 1 - COLLATERAL_DRIFT_TOLERANCE
                  ? { level: "warning", note: "Unterdeckung gegenüber Umlauf" }
                  : { level: "ok", note: "Vollständig gedeckt" };
            }

            const id = identities.get(w.address.toLowerCase());
            return {
              key: w.key,
              address: w.address,
              label: w.label,
              role: w.role,
              kind: w.kind,
              description: w.description,
              watch: w.watch ?? null,
              name: id?.name ?? null,
              assets: { rcrc, personalCrc, xdai, eure },
              euro,
              health,
              lastActivity: lastActivity.get(w.address.toLowerCase()) ?? null,
            };
          }),
        );

        const reserveEuro = wallets
          .filter((w) => w.kind === "reserve")
          .reduce((s, w) => s + w.euro, 0);
        const funder = wallets.find((w) => w.kind === "hot");

        return {
          wallets,
          collateral,
          treasury: {
            reserveEuro,
            funderRcrc: funder?.assets.rcrc ?? 0,
            totalEuro: wallets.reduce((s, w) => s + w.euro, 0),
          },
          operatorConfigured: Boolean(operatorAddr),
          hubAddress: ADDR.hub,
          generatedAt: Date.now(),
        };
      },
      fresh,
    );

    return NextResponse.json(data);
  } catch (e) {
    return jsonError(e);
  }
}
