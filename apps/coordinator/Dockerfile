# MACI v2 Coordinator Service for Roebel/Müritz
# Built on top of the official maci-cli@2.5.0. The container holds the
# coordinator's Babyjubjub key (mounted as a Fly secret at runtime — never baked
# into the image) plus the production-ceremony zKey artifacts.
#
# Used in three modes:
#   1. Cron / manual: `node scripts/finalize-poll.js <pollId>` runs merge → prove
#      → proveOnChain → verify for a finished poll.
#   2. Layer-1 hardening: outputs unsigned tx data; an attester multisig (Gnosis
#      Safe) confirms before broadcast.
#   3. Healthcheck: HTTP server on :8080 used by Fly for liveness probes.
#
# Image size is dominated by the zKey artifacts (~1.5GB extracted). We keep the
# tarball as a build arg so the image rebuilds cleanly on new ceremony drops.

FROM node:20-bookworm-slim AS deps

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        bash \
        git \
        build-essential \
        python3 \
        libgmp-dev \
        libsodium-dev \
        nasm \
        nlohmann-json3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Pin to the same MACI minor as the on-chain contracts.
RUN npm i -g pnpm@9 \
    && pnpm add maci-cli@2.5.0 maci-contracts@2.5.0 maci-circuits@2.5.0 \
                maci-domainobjs@2.5.0 maci-crypto@2.5.0 \
                ethers@^6.13.4 dotenv

FROM deps AS zkeys

ARG ZKEY_TARBALL=https://maci-develop-fra.s3.eu-central-1.amazonaws.com/v2.0.0/maci_artifacts_14-9-2-3_prod.tar.gz

WORKDIR /app/zkeys

RUN curl --fail --location -o /tmp/zkeys.tar.gz "$ZKEY_TARBALL" \
    && tar -xzf /tmp/zkeys.tar.gz -C /app/zkeys --strip-components=1 \
    && rm /tmp/zkeys.tar.gz

FROM deps AS runtime

WORKDIR /app

COPY --from=zkeys /app/zkeys /app/zkeys
COPY scripts/ /app/scripts/

ENV ZKEY_DIR=/app/zkeys

EXPOSE 8080

# Fly's process-group default. Override with `node scripts/finalize-poll.js <pollId>`
# for manual runs.
CMD ["node", "/app/scripts/healthcheck.js"]
