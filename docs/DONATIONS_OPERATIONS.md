# Gemeinschaftskasse Contributions — Go-Live Runbook

**Scope:** operational steps to activate the fiat contribution rails built 2026-07-15/16 (see `docs/superpowers/plans/2026-07-15-fiat-donations-financial-platform.md` and `docs/MONERIUM_FIAT_TREASURY_RESEARCH.md`). Code is fully deployed-ready; everything below is configuration.

**Wording rule (until a gemeinnütziger e.V. exists):** all public copy says "Unterstützen / Unterstützungsbeitrag", never "Spende" with tax implication. Stripe ToS + Spendenrecht background in the research doc §5/§6.

## 0. Prerequisites

- [ ] Monerium **Business (KYB)** profile approved — ⚠️ the profile's legal-entity name must EXACTLY match the Stripe account's legal entity, or Stripe payouts to the IBAN will fail name-matching.
- [ ] Supabase migration applied: `apps/expo/supabase/migrations/donations_ledger.sql` (via Supabase MCP — creates `donations`, `donation_references`, `monerium_events`).

## 1. Monerium (once KYB completes)

1. **Link the treasury Safe** `0x3A08c86Efc5ff38CC35d850F1D4d564e497bFDEa` (Gnosis) to the profile — Safe supports ERC-1271 offchain/onchain signing; the Safe web UI flow via Monerium's app or `POST /addresses`.
2. **Issue the IBAN** bound to that address + `gnosis` chain (`POST /ibans`, async). Every incoming SEPA EUR then auto-mints EURe **V2** into the Safe.
3. **Create the webhook subscription:**
   ```bash
   # generate the signing secret (whsec_ + base64 of 32 random bytes)
   echo "whsec_$(openssl rand -base64 32)"
   # POST https://api.monerium.app/webhooks  (OAuth client-credentials token)
   # { "url": "https://roebel.app/api/monerium/webhook",
   #   "secret": "whsec_…",
   #   "types": ["order.created", "order.updated"] }
   ```
   Monerium immediately sends `subscription.created` — our endpoint acks it automatically.
4. **Sandbox first (optional but recommended):** `api.monerium.dev` can simulate incoming bank transfers that mint test EURe on Chiado — point a preview deployment's `MONERIUM_WEBHOOK_SECRET` at a sandbox subscription and verify a `donations` row appears.

## 2. Stripe

1. Dashboard → Settings → **Payout bank account**: add the Monerium IBAN. If the dashboard validation or a test payout fails (EMI IBANs carry a documented "higher payout failure" risk), fall back to: payouts → house bank → standing SEPA forward to the Monerium IBAN.
2. Dashboard → **Payout statement descriptor**: set to `ROEBEL BEITRAG` (our Monerium webhook skips memos matching /stripe/i to avoid double-counting the aggregated payout — verify the actual arriving memo contains "STRIPE" or adjust `STRIPE_PAYOUT_MEMO` in `apps/web/src/app/api/monerium/webhook/route.ts`).
3. Dashboard → Developers → **Webhooks → Add endpoint**: `https://roebel.app/api/donate/webhook`, events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`. Copy the signing secret.
4. After e.V. + Gemeinnützigkeit: apply for Stripe's **nonprofit program** (requires ≥80% donation volume) and flip copy to "Spende".

## 3. Vercel env (apps/web)

| Var | Value |
|---|---|
| `MONERIUM_WEBHOOK_SECRET` | the `whsec_…` from step 1.3 |
| `STRIPE_WEBHOOK_SECRET_DONATIONS` | signing secret from step 2.3 |
| `DONATION_IBAN` / `DONATION_BIC` / `DONATION_RECIPIENT_NAME` | optional env fallbacks — prefer app_settings |

## 4. app_settings (Supabase)

```sql
insert into app_settings (key, value) values
  ('donations_enabled', 'true'),
  ('donation_iban', 'EE__ ____ ____ ____ __'),
  ('donation_bic', '____'),
  ('donation_recipient_name', '<exact account holder name>')
on conflict (key) do update set value = excluded.value;
```

`donations_enabled` is the kill switch — **missing key counts as DISABLED**. The expo screen and `/spenden` show "Bald verfügbar" until this is set.

## 5. Smoke test

1. `GET /api/monerium/webhook` and `GET /api/donate/webhook` → both `has_secret: true`.
2. `GET /api/donate/config` → `enabled: true`, IBAN present.
3. Card: €1 checkout on `/spenden` → `donations` row settles (webhook log), thank-you page bounces back.
4. SEPA: send €1 with your `RBL-XXXXXX` code (get it on `/spenden` or the app's Unterstützen screen) → EURe V2 mints into the Safe within seconds (SCT Inst), `donations` row settles with your name, `/treasury` history shows the inflow.
5. Verify the Stripe payout (T+3) arrives on the IBAN and is **skipped** by the Monerium webhook (`monerium_events.error = 'stripe_payout_skip'`).

## 6. Known behaviors / gotchas

- Transfers without a valid `RBL-` code still mint and are ledgered as "Anonym" — nothing is lost.
- First-time senders / large amounts can be held for Monerium manual compliance review (research doc §4); ≥€15,000 requires supporting documents.
- The public ledger (`/api/donate/recent`, `/spenden`) never exposes wallet addresses, bank memos, or payment ids.
- Legal posture today: contributions are Schenkungen to the project operator; track §30 ErbStG notification duties and the €20k/donor/10yr threshold; founding the e.V. (7 members, ~€120, ~2–4 months) is the Phase-2 priority (research doc §6).
