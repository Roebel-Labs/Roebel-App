# Rebuilding the Röbel node as a relay + index node

The CPX42 was deleted on 2026-09-03. This is the runbook that brings the public
record back on a box that costs roughly a twentieth of what the old one did.

Everything here is operational. The code side is already done and on
`feat/relay-only-node`: the manifest declares relay + index only, and the
renderer emits a bundle with no Nextcloud, Matrix or buzz in it.

## What survived

`~/Documents/privat/side_projects/netizen-node-export/2026-09-03` — 344 MB,
20 files, `shasum -a 256 -c SHA256SUMS` verifies **all 20 OK** (re-checked
2026-09-04).

| File | What it holds |
|---|---|
| `backup-.../strfry-events.jsonl.gz` | **227 signed events**, 50 authors, 2026-02-17 → 2026-09-02 |
| `backup-.../members.txt` | the 33-entry relay write allow-list |
| `backup-.../pg-indexer.dump` | the derived index (do not restore — see step 6) |
| `roebel.env` | every secret the old box held. **Never commit this file.** |

Nostr events are self-authenticating and citizen keys are device-held, so the
227 events can be republished to a new relay and stay valid. Nobody lost an
identity when the box went away.

## Target

Hetzner **CX23** — 2 vCPU / 4 GB / 40 GB NVMe. The whole stack measured 2.3 GiB
RAM and ~13 GB disk *including* Nextcloud, Matrix and buzz; without them the
relay and index need well under 1 GB and ~100 KB of data. Confirm the price in
your own console before creating it.

## Steps

### 1. Create the box

Ubuntu 24.04 or newer, Falkenstein, Docker installed. Note the IPv4.

Add a Hetzner **Cloud Firewall** allowing only 22, 80 and 443. `ufw` is useless
here — Docker writes its own iptables rules and bypasses it.

### 2. DNS at IONOS (not Vercel, not Hetzner)

Repoint **two** records at the new IP:

- `relay` → new IP
- `index` → new IP

**Delete four**: `buzz`, `cloud`, `chat`, `matrix`. They still point at
`178.105.19.80`, an address you no longer control. Hetzner reassigns released
IPs — the old Nürnberg address `46.225.180.233` already serves a stranger's
site. Leaving those records is a subdomain-takeover risk on `*.roebel.app`, and
deleting them costs nothing.

### 3. Secrets

`SECRETS.md` in the rendered bundle now lists all ten, including the four that
are compose-interpolated and used to be invisible on this checklist. All of them
exist in the export's `roebel.env`; only `POSTGRES_PASSWORD` may be freshly
invented.

Put them in `/opt/netizen/roebel/.env` on the box. Never pass them through the
CLI.

> `SUPABASE_SERVICE_KEY` is the one that silently matters. Without it
> `relay-sync` crash-loops, the CitizenNFT allow-list stays empty, and **nobody
> can publish to the relay** — the relay looks up and is functionally dead. This
> is what happened last time.

### 4. Render and deploy

There is no `netizen` binary on `PATH`, and the manifest path must be absolute:

```bash
cd packages/cli
node_modules/.bin/tsx src/cli.ts doctor /abs/path/to/packages/protocol/examples/roebel.netizen.json
node_modules/.bin/tsx src/cli.ts up     /abs/path/to/packages/protocol/examples/roebel.netizen.json \
  --host root@<new-ip> --identity ~/.ssh/id_ed25519
```

The SSH key is passphrase-protected — `ssh-add` it first.

`netizen up` rsyncs with `--delete`. `strfry-policy/members.txt` and
`ops/status.json` are generated state and are already excluded; if that ever
regresses, every deploy revokes write access town-wide.

### 5. Restore the 227 events

A fresh Docker volume is root-owned and strfry runs as uid 1000, so chown it
before first start or you get `mdb_env_open: Permission denied`:

```bash
docker run --rm --user 0 -v roebel_strfry_db:/d alpine chown -R 1000:1000 /d
```

Then import. The binary is at `/app/strfry`, not on `PATH`:

```bash
gzcat strfry-events.jsonl.gz | docker compose exec -T strfry /app/strfry import
```

`import` writes to LMDB directly, so it bypasses the members-only write policy —
you do not need to be on the allow-list to restore your own history.

Restore the allow-list by copying `members.txt` into `strfry-policy/`. Note the
rendered bundle uses `members.txt`; the old box read `citizens.txt`. A fresh
render means `members.txt` is correct.

### 6. Let the index rebuild itself

Do **not** restore `pg-indexer.dump`. The index is a derived view: the indexer
re-reads the relay and the federation mirror, re-verifies every signature, and
keys on the event hash. Restoring a dump would reintroduce whatever state the old
box had; rebuilding proves the protocol is the source of truth, which is the rule
this design exists to hold.

It ingests every 120 s. Give it one interval, then check `/stats`.

### 7. Verify

```bash
curl -s https://index.roebel.app/stats
curl -s -H 'Accept: application/nostr+json' https://relay.roebel.app   # NIP-11
```

Expect 227 events and the relay's name, "Röbel / Müritz Relay". Until both
answer, the app's "view proof" links stay dead.

## Known gaps this rebuild does not close

- **Offsite backups.** `ops/status.json` reports `"offsite":"unconfigured"`
  until a Hetzner Storage Box is bought and `BACKUP_RESTIC_REPOSITORY` /
  `BACKUP_RESTIC_PASSWORD` are set. Until then dumps never leave the box — which
  is precisely how a deletion becomes data loss.
- **The export is the only copy** of the pre-deletion state, on a Mac that was at
  2.6 GB free. Put a second copy somewhere else before anything else on this list.
- `docs/NOSTR_RELAY_SETUP.md` still shows the compact
  `info { name = "x"; }` strfry config form, which strfry's parser **rejects**.
  Keys must be on their own lines.
