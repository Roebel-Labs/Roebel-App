# syntax=docker/dockerfile:1
# Mecky voice agent on LiveKit Cloud. npm (own package-lock.json): this folder is NOT in the pnpm workspace.
FROM node:22-slim
# The LiveKit native core reads the system CA store; slim images ship without it.
RUN apt-get update -qq && apt-get install --no-install-recommends -y ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
# Pre-download model files (turn detector etc.) so cold starts stay fast.
RUN npx livekit-agents download-files
COPY agent.ts tsconfig.json ./
RUN adduser --disabled-password --gecos "" --home /app --shell /sbin/nologin --uid 10001 appuser && chown -R appuser /app
USER appuser
ENV NODE_ENV=production
# Exec node directly (no npm/sh wrapper) so SIGTERM reaches the worker and sessions drain.
CMD ["node", "--import", "tsx", "agent.ts", "start"]
