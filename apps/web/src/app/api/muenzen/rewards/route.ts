// GET /api/muenzen/rewards — earn/sink analytics + the operational data behind
// the Belohnungen & Senken tab: reward_config, reward_claims aggregates, lootbox
// sales, reward_events with attendance, and the referral funnel. Most RCRC rails
// are empty today (new economy) so aggregates degrade gracefully.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, isFresh, jsonError } from "@/lib/muenzen/api";
import { cached, TTL } from "@/lib/muenzen/cache";
import { resolveIdentities } from "@/lib/muenzen/identity";
import { attoToNumber, actionLabel } from "@/lib/muenzen/constants";

export const dynamic = "force-dynamic";

function dayKey(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "—";
}

export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const fresh = isFresh(req);

  try {
    const data = await cached(
      "rewards",
      TTL.supabase,
      async () => {
        const supabase = createAdminClient();
        const [cfgRes, claimsRes, chargesRes, lootRes, keysRes, eventsRes, refRes] =
          await Promise.all([
            supabase.from("reward_config").select("*").order("action"),
            supabase
              .from("reward_claims")
              .select("id, wallet, action, reference_id, amount_atto, status, error, created_at")
              .order("created_at", { ascending: false })
              .limit(2000),
            supabase
              .from("muenzen_charges")
              .select("id, wallet, kind, reference_id, amount_atto, status, created_at")
              .order("created_at", { ascending: false })
              .limit(2000),
            supabase.from("lootboxes").select("*").order("display_order"),
            supabase.from("user_lootbox_keys").select("lootbox_id, key_count, total_purchased, total_used"),
            supabase.from("reward_events").select("*").order("starts_at", { ascending: false }),
            supabase.from("referral_redemptions").select("*"),
          ]);

        const claims = claimsRes.data ?? [];
        const charges = chargesRes.data ?? [];

        // ── Earn analytics ───────────────────────────────────────────────
        const paid = claims.filter((c) => c.status === "paid");
        const byActionMap = new Map<string, { count: number; rcrc: number }>();
        for (const c of paid) {
          const e = byActionMap.get(c.action) ?? { count: 0, rcrc: 0 };
          e.count += 1;
          e.rcrc += attoToNumber(c.amount_atto);
          byActionMap.set(c.action, e);
        }
        const byAction = [...byActionMap.entries()].map(([action, v]) => ({
          action,
          label: actionLabel(action),
          count: v.count,
          rcrc: v.rcrc,
        }));

        const byStatusMap = new Map<string, number>();
        for (const c of claims) byStatusMap.set(c.status, (byStatusMap.get(c.status) ?? 0) + 1);
        const byStatus = [...byStatusMap.entries()].map(([status, count]) => ({ status, count }));

        const earnDailyMap = new Map<string, { rcrc: number; count: number }>();
        for (const c of paid) {
          const k = dayKey(c.created_at);
          const e = earnDailyMap.get(k) ?? { rcrc: 0, count: 0 };
          e.rcrc += attoToNumber(c.amount_atto);
          e.count += 1;
          earnDailyMap.set(k, e);
        }
        const earnDaily = [...earnDailyMap.entries()]
          .map(([date, v]) => ({ date, ...v }))
          .sort((a, b) => a.date.localeCompare(b.date));

        const topEarnerMap = new Map<string, { rcrc: number; count: number }>();
        for (const c of paid) {
          const w = String(c.wallet ?? "").toLowerCase();
          const e = topEarnerMap.get(w) ?? { rcrc: 0, count: 0 };
          e.rcrc += attoToNumber(c.amount_atto);
          e.count += 1;
          topEarnerMap.set(w, e);
        }
        const topEarnersRaw = [...topEarnerMap.entries()]
          .map(([address, v]) => ({ address, ...v }))
          .sort((a, b) => b.rcrc - a.rcrc)
          .slice(0, 10);

        const errored = claims
          .filter((c) => c.status === "failed")
          .slice(0, 20)
          .map((c) => ({
            id: c.id,
            wallet: String(c.wallet ?? "").toLowerCase(),
            action: c.action,
            error: c.error,
            createdAt: c.created_at ? Date.parse(c.created_at) : null,
          }));

        // ── Spend / sink analytics ───────────────────────────────────────
        const settled = charges.filter((c) => c.status === "settled" || c.status === "paid");
        const spendDailyMap = new Map<string, { rcrc: number; count: number }>();
        const perLootboxMap = new Map<string, { rcrc: number; sales: number }>();
        let spendTotal = 0;
        for (const c of settled) {
          const v = attoToNumber(c.amount_atto);
          spendTotal += v;
          const k = dayKey(c.created_at);
          const e = spendDailyMap.get(k) ?? { rcrc: 0, count: 0 };
          e.rcrc += v;
          e.count += 1;
          spendDailyMap.set(k, e);
          const ref = String(c.reference_id ?? "");
          const p = perLootboxMap.get(ref) ?? { rcrc: 0, sales: 0 };
          p.rcrc += v;
          p.sales += 1;
          perLootboxMap.set(ref, p);
        }
        const spendDaily = [...spendDailyMap.entries()]
          .map(([date, v]) => ({ date, ...v }))
          .sort((a, b) => a.date.localeCompare(b.date));

        const chargeStatusMap = new Map<string, number>();
        for (const c of charges) chargeStatusMap.set(c.status, (chargeStatusMap.get(c.status) ?? 0) + 1);
        const chargesByStatus = [...chargeStatusMap.entries()].map(([status, count]) => ({ status, count }));

        // ── Lootboxes (config + outstanding keys) ────────────────────────
        const keyAgg = new Map<string, { outstanding: number; purchased: number; used: number }>();
        for (const k of keysRes.data ?? []) {
          const id = String(k.lootbox_id);
          const e = keyAgg.get(id) ?? { outstanding: 0, purchased: 0, used: 0 };
          e.outstanding += k.key_count ?? 0;
          e.purchased += k.total_purchased ?? 0;
          e.used += k.total_used ?? 0;
          keyAgg.set(id, e);
        }
        const lootboxes = (lootRes.data ?? []).map((l) => {
          const agg = keyAgg.get(String(l.id)) ?? { outstanding: 0, purchased: 0, used: 0 };
          const sale = perLootboxMap.get(String(l.id));
          return {
            id: l.id,
            name: l.name,
            description: l.description,
            imageUrl: l.image_url,
            priceAtto: String(l.muenzen_price_atto ?? "0"),
            price: attoToNumber(l.muenzen_price_atto),
            coinsPerKey: l.coins_per_key,
            guaranteedRewardType: l.guaranteed_reward_type,
            isPublished: l.is_published,
            displayOrder: l.display_order,
            keysOutstanding: agg.outstanding,
            totalPurchased: agg.purchased,
            totalUsed: agg.used,
            rcrcRevenue: sale?.rcrc ?? 0,
            rcrcSales: sale?.sales ?? 0,
          };
        });

        // ── Events (config + attendance) ─────────────────────────────────
        const attendanceMap = new Map<string, number>();
        for (const c of paid) {
          if (c.action === "event_attend" && c.reference_id) {
            attendanceMap.set(String(c.reference_id), (attendanceMap.get(String(c.reference_id)) ?? 0) + 1);
          }
        }
        const now = Date.now();
        const events = (eventsRes.data ?? []).map((e) => {
          const starts = e.starts_at ? Date.parse(e.starts_at) : null;
          const expires = e.expires_at ? Date.parse(e.expires_at) : null;
          const live = Boolean(e.active) && (!starts || now >= starts) && (!expires || now <= expires);
          return {
            id: e.id,
            label: e.label,
            startsAt: e.starts_at,
            expiresAt: e.expires_at,
            active: e.active,
            live,
            createdBy: e.created_by,
            createdAt: e.created_at,
            attendance: attendanceMap.get(String(e.id)) ?? 0,
          };
        });

        // ── Referral funnel ──────────────────────────────────────────────
        const refs = refRes.data ?? [];
        const referral = {
          redemptions: refs.length,
          referrers: new Set(refs.map((r) => String(r.referrer_wallet ?? "").toLowerCase())).size,
          awardedReferrer: refs.reduce((s, r) => s + (r.coins_awarded_referrer ?? 0), 0),
          awardedReferred: refs.reduce((s, r) => s + (r.coins_awarded_referred ?? 0), 0),
        };

        // Name resolution for the people-facing tables.
        const idMap = await resolveIdentities([
          ...topEarnersRaw.map((t) => t.address),
          ...errored.map((e) => e.wallet),
        ]);
        const topEarners = topEarnersRaw.map((t) => ({ ...t, name: idMap.get(t.address)?.name ?? null }));
        const erroredNamed = errored.map((e) => ({ ...e, name: idMap.get(e.wallet)?.name ?? null }));

        const config = (cfgRes.data ?? []).map((c) => ({
          action: c.action,
          label: actionLabel(c.action),
          amount: attoToNumber(c.amount_atto),
          amountAtto: String(c.amount_atto ?? "0"),
          enabled: c.enabled,
          perReference: c.per_reference,
          cooldownHours: c.cooldown_hours,
          dailyCap: c.daily_cap,
          description: c.description,
        }));

        return {
          config,
          earn: {
            byAction,
            byStatus,
            daily: earnDaily,
            errored: erroredNamed,
            topEarners,
            totalPaid: paid.reduce((s, c) => s + attoToNumber(c.amount_atto), 0),
            claimCount: claims.length,
          },
          spend: {
            daily: spendDaily,
            chargesByStatus,
            totalRevenue: spendTotal,
            settledCount: settled.length,
          },
          lootboxes,
          events,
          referral,
          generatedAt: now,
        };
      },
      fresh,
    );

    return NextResponse.json(data);
  } catch (e) {
    return jsonError(e);
  }
}
