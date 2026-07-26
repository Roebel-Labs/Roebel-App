FROM node:20-slim AS base
RUN corepack enable
WORKDIR /app

# Workspace context first (layer caching + lets pnpm resolve the workspace)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/roebel-id/package.json apps/roebel-id/

# Install only this app's dependencies within the workspace
RUN pnpm install --filter @roebel/roebel-id... --frozen-lockfile

# App source + build
COPY apps/roebel-id apps/roebel-id
RUN pnpm --filter @roebel/roebel-id build

EXPOSE 3010
CMD ["node", "apps/roebel-id/dist/index.js"]
