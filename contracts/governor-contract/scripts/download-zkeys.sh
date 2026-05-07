#!/usr/bin/env bash
# Downloads the MACI v2.0 production-ceremony zKey tarball and extracts it
# into ./zkeys/ inside contracts/governor-contract/. Idempotent — re-run anytime.
#
# Tarball: ~1.5 GB. Pin `tag=v2.0.0`; the prod 14-9-2-3 keyset is the one that
# survived the trusted setup ceremony.
#
# Source: https://github.com/privacy-ethereum/maci/blob/v2.5.0/.github/scripts/downloadZkeys.ts

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZKEYS_DIR="$ROOT/zkeys"
TARBALL="$ZKEYS_DIR/maci_artifacts_14-9-2-3_prod.tar.gz"
URL="https://maci-develop-fra.s3.eu-central-1.amazonaws.com/v2.0.0/maci_artifacts_14-9-2-3_prod.tar.gz"

mkdir -p "$ZKEYS_DIR"

if [ -f "$ZKEYS_DIR/ProcessMessagesNonQv_14-9-2-3/processmessagesnonqv_14-9-2-3.zkey" ] \
    && [ -f "$ZKEYS_DIR/TallyVotesNonQv_14-5-3/tallyvotesnonqv_14-5-3.zkey" ]; then
    echo "[download-zkeys] zKeys already extracted in $ZKEYS_DIR — skipping."
    exit 0
fi

if [ ! -f "$TARBALL" ]; then
    echo "[download-zkeys] Downloading $URL (~1.5 GB)…"
    curl --fail --location --output "$TARBALL" "$URL"
fi

echo "[download-zkeys] Extracting tarball into $ZKEYS_DIR…"
tar -xzf "$TARBALL" -C "$ZKEYS_DIR" --strip-components=1
rm -f "$TARBALL"

echo "[download-zkeys] Done. zKey paths:"
echo "  ProcessMessages: $ZKEYS_DIR/ProcessMessagesNonQv_14-9-2-3/processmessagesnonqv_14-9-2-3.zkey"
echo "  TallyVotes:      $ZKEYS_DIR/TallyVotesNonQv_14-5-3/tallyvotesnonqv_14-5-3.zkey"
