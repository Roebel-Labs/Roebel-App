# Röbel auto-invite worker (Fly)

A tiny always-on Fly worker that, every 10 minutes, trusts every **CitizenNFTv2**
holder the Röbel Münzen group doesn't trust yet — so each newly-verified citizen can
**receive (and mint) Röbel Münzen** with zero manual work. This is the "auto-invite"
that makes the rewards economy reach new citizens.

It signs with the group **service** key (`group.service()` = the burner `0xd502…`,
verified on-chain). `trustBatchWithConditions` is `onlyOwnerOrService`, so this key is
sufficient — no Safe signing needed.

## What it needs (that's all)
- **`SERVICE_PRIVKEY`** — the group service key = your **burner** `0xd502…` private key.
- **`GNOSIS_RPC_URL`** — a Gnosis RPC. The public default works; a dedicated RPC (e.g.
  from a provider) is more reliable for the event scan.
- A little **xDAI** in the burner for gas (already funded; each trust tx is a few cents).

## Deploy (one time)
```bash
cd scripts/circles/fly-auto-invite

# 1) create the app (uses fly.toml; don't deploy yet)
fly launch --no-deploy --copy-config --name roebel-auto-invite

# 2) set the secrets (NEVER commit these)
fly secrets set \
  SERVICE_PRIVKEY=0x<YOUR_BURNER_PRIVATE_KEY> \
  GNOSIS_RPC_URL=https://rpc.gnosischain.com \
  -a roebel-auto-invite

# 3) ship it
fly deploy
```

## Operate
```bash
fly logs -a roebel-auto-invite          # watch it run (prints citizens=.. toTrust=.. each cycle)
fly secrets set INTERVAL_SECONDS=300 -a roebel-auto-invite   # scan more often
fly scale count 1 -a roebel-auto-invite # exactly one machine (it's a singleton worker)
```

## Tuning
- `INTERVAL_SECONDS` (default 600) — how often it scans for new citizens.
- `FROM_BLOCK` (default 46867000) — event-scan lower bound (just below the Gnosis v2 deploy).

## Notes
- It's **idempotent**: each cycle only trusts citizens not already trusted, so re-running is safe.
- Source of truth is `scripts/circles/auto-invite-bot.ts`; `bot.mjs` is the standalone
  (env-only, no relative imports) copy packaged for Fly. Keep them in sync if you change logic.
- This handles **group trust** (receive/mint Röbel Münzen). It does NOT do the Circles
  `registerHuman` invite (the 96-CRC quota) — that's a separate, optional path.
