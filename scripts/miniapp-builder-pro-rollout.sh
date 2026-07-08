#!/usr/bin/env bash
# Mini-App Builder Pro — operator rollout steps (run manually, needs your auth).
# Everything else shipped in code; these three steps need YOUR credentials.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── 1/3 · Publish @netizen-labs/miniapp-sdk@0.2.0 to npm ──────────────────"
echo "Needs: npm login as the netizen-labs owner (npm whoami)."
read -r -p "Publish now? [y/N] " yn
if [[ "${yn:-n}" == "y" ]]; then
  (cd packages/miniapp-sdk && npm publish)
else
  echo "skipped — run later: cd packages/miniapp-sdk && npm publish"
fi

echo
echo "── 2/3 · Apply the developer_api_keys migration ──────────────────────────"
echo "Via Supabase MCP (claude /mcp → supabase → apply_migration) or the"
echo "dashboard SQL editor (project wwbeqhkslxdxhktqzqti):"
echo "    supabase/migrations/20260708_developer_api_keys.sql"
echo "Until applied: API-key creation returns 503; MCP works via wallet-bearer fallback."

echo
echo "── 3/3 · Still-open gates from earlier sessions ──────────────────────────"
echo "· Deploy edge fn miniapp-grant-reward (rewards settle on-chain) — Supabase MCP"
echo "· Vercel env KIE_API_KEY (NB2 image generation in dashboard/editor)"
echo
echo "Verify after deploy:"
echo "  curl -s https://www.roebel.app/mini-apps/llms-full.txt | head -5"
echo "  curl -s https://www.roebel.app/sdk/miniapp-sdk.mjs | head -2"
echo "  claude mcp add --transport http netizen https://www.roebel.app/api/mcp --header \"Authorization: Bearer nz_KEY\""
