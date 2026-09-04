#!/usr/bin/env bash
#
# Create the Hetzner Cloud box a Netizen node runs on, so provisioning stops
# being a manual trip through the web console.
#
#   HCLOUD_TOKEN=... ./provision-hetzner.sh --dry-run
#   HCLOUD_TOKEN=... ./provision-hetzner.sh --ssh-key max@roebel.app
#
# It creates: a firewall allowing only 22/80/443, and one server with Docker
# preinstalled via cloud-init. It prints the IPv4 and nothing else on success,
# so it composes: IP=$(./provision-hetzner.sh --ssh-key ...).
#
# Deliberately NOT idempotent about the server: creating a second box by
# accident costs money every month until someone notices. It refuses if a
# server with the same name already exists, and tells you what to do instead.
#
# Docker bypasses ufw's iptables rules, so the Cloud Firewall is the only
# packet filter that actually holds on this box. It is created before the
# server and attached at create time — never "attach it afterwards", which
# leaves a window where the box is up and open.

set -uo pipefail

API="https://api.hetzner.cloud/v1"
NAME="${NODE_NAME:-roebel-relay}"
TYPE="${SERVER_TYPE:-cx23}"
IMAGE="${IMAGE:-ubuntu-24.04}"
LOCATION="${LOCATION:-fsn1}"
FIREWALL_NAME="${FIREWALL_NAME:-netizen-node}"
SSH_KEY=""
DRY_RUN=0

die() { echo "error: $*" >&2; exit 1; }
note() { echo "  $*" >&2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --ssh-key) SSH_KEY="${2:-}"; shift 2 ;;
    --type) TYPE="${2:-}"; shift 2 ;;
    --name) NAME="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

[ -n "${HCLOUD_TOKEN:-}" ] || die "HCLOUD_TOKEN is not set (Hetzner Console → Security → API tokens, Read & Write)"

api() { # api <method> <path> [body]
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -X "$method" "$API$path" \
      -H "Authorization: Bearer $HCLOUD_TOKEN" \
      -H "Content-Type: application/json" -d "$body"
  else
    curl -sS -X "$method" "$API$path" -H "Authorization: Bearer $HCLOUD_TOKEN"
  fi
}

# jq is not guaranteed on a fresh Mac; keep the parsing dependency-free.
jsonq() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null; }

# --- preflight ------------------------------------------------------------
# Hetzner renames and retires server types (CX22 became CX23 in 2026). Ask the
# API what exists rather than trusting a constant in a script, and fail with the
# real list instead of a 404 from the create call.
note "checking token and server type '$TYPE'…"
TYPES_JSON="$(api GET /server_types?per_page=100)"
echo "$TYPES_JSON" | grep -q '"error"' && die "API rejected the token: $(echo "$TYPES_JSON" | jsonq 'd["error"]["message"]')"

AVAILABLE="$(echo "$TYPES_JSON" | jsonq '" ".join(sorted(t["name"] for t in d["server_types"]))')"
case " $AVAILABLE " in
  *" $TYPE "*) : ;;
  *) die "server type '$TYPE' is not offered. Available: $AVAILABLE" ;;
esac

# Report the real monthly price before spending money. Nested quoting inside a
# command substitution is easy to get subtly wrong, so this goes through env vars.
PRICE="$(TYPE="$TYPE" LOCATION="$LOCATION" python3 -c '
import json, os, sys
d = json.load(sys.stdin)
t = next((t for t in d["server_types"] if t["name"] == os.environ["TYPE"]), None)
p = next((p for p in (t or {}).get("prices", []) if p["location"] == os.environ["LOCATION"]), None)
print(p["price_monthly"]["gross"][:5] if p else "?")
' <<< "$TYPES_JSON")"
note "type $TYPE in $LOCATION: ~€${PRICE}/month gross"

if [ -n "$SSH_KEY" ]; then
  KEYS_JSON="$(api GET /ssh_keys)"
  echo "$KEYS_JSON" | jsonq '" ".join(k["name"] for k in d["ssh_keys"])' | grep -qw -- "$SSH_KEY" \
    || die "ssh key '$SSH_KEY' not found in this project. Known: $(echo "$KEYS_JSON" | jsonq '" ".join(k["name"] for k in d["ssh_keys"])')"
else
  note "WARNING: no --ssh-key given; Hetzner will email a root password instead"
fi

EXISTING="$(api GET "/servers?name=$NAME" | jsonq 'len(d["servers"])')"
[ "${EXISTING:-0}" = "0" ] || die "a server named '$NAME' already exists — delete it first, or pass --name. Refusing to create a second billable box."

# --- cloud-init -----------------------------------------------------------
# Only Docker and the bits `netizen up` assumes. Everything else the node needs
# is rendered by the installer, not baked into an image, so the box stays
# reproducible from the manifest.
USER_DATA=$(cat <<'CLOUDINIT'
#cloud-config
package_update: true
packages: [ca-certificates, curl, rsync, fail2ban]
runcmd:
  - install -m 0755 -d /etc/apt/keyrings
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  - chmod a+r /etc/apt/keyrings/docker.asc
  - echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
  - apt-get update
  - apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  - systemctl enable --now docker
  - sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  - systemctl restart ssh || systemctl restart sshd
  - mkdir -p /opt/netizen
CLOUDINIT
)

FW_RULES='[
  {"direction":"in","protocol":"tcp","port":"22","source_ips":["0.0.0.0/0","::/0"]},
  {"direction":"in","protocol":"tcp","port":"80","source_ips":["0.0.0.0/0","::/0"]},
  {"direction":"in","protocol":"tcp","port":"443","source_ips":["0.0.0.0/0","::/0"]}
]'

if [ "$DRY_RUN" = "1" ]; then
  echo "DRY RUN — would create:" >&2
  echo "  firewall : $FIREWALL_NAME (22/80/443 in)" >&2
  echo "  server   : $NAME  type=$TYPE image=$IMAGE location=$LOCATION ssh_key=${SSH_KEY:-<none>}" >&2
  echo "  cost     : ~€${PRICE}/month gross" >&2
  exit 0
fi

# --- firewall (idempotent: reuse if it already exists) ---------------------
FW_ID="$(api GET "/firewalls?name=$FIREWALL_NAME" | jsonq 'd["firewalls"][0]["id"] if d["firewalls"] else ""')"
if [ -z "$FW_ID" ]; then
  note "creating firewall $FIREWALL_NAME…"
  FW_ID="$(api POST /firewalls "{\"name\":\"$FIREWALL_NAME\",\"rules\":$FW_RULES}" | jsonq 'd["firewall"]["id"]')"
  [ -n "$FW_ID" ] || die "firewall creation failed"
else
  note "reusing existing firewall $FIREWALL_NAME ($FW_ID)"
fi

# --- server ---------------------------------------------------------------
# `python3 -` reads the program from stdin, so user_data cannot also arrive on
# stdin — it goes through the environment instead.
BODY="$(NAME="$NAME" TYPE="$TYPE" IMAGE="$IMAGE" LOCATION="$LOCATION" \
        FW_ID="$FW_ID" SSH_KEY="$SSH_KEY" USER_DATA="$USER_DATA" python3 -c '
import json, os
body = {
    "name": os.environ["NAME"],
    "server_type": os.environ["TYPE"],
    "image": os.environ["IMAGE"],
    "location": os.environ["LOCATION"],
    "firewalls": [{"firewall": int(os.environ["FW_ID"])}],
    "user_data": os.environ["USER_DATA"],
    "public_net": {"enable_ipv4": True, "enable_ipv6": True},
    "labels": {"managed-by": "netizen"},
}
if os.environ.get("SSH_KEY"):
    body["ssh_keys"] = [os.environ["SSH_KEY"]]
print(json.dumps(body))
')"
[ -n "$BODY" ] || die "could not build the create request"

note "creating server $NAME ($TYPE, $LOCATION)…"
CREATE="$(api POST /servers "$BODY")"
IP="$(echo "$CREATE" | jsonq 'd["server"]["public_net"]["ipv4"]["ip"]')"
if [ -z "$IP" ]; then
  die "server creation failed: $(echo "$CREATE" | jsonq 'd.get("error",{}).get("message", json.dumps(d)[:400])')"
fi

note "created. cloud-init still needs a minute to finish installing Docker."
note "next: netizen up <abs manifest> --host root@$IP --identity ~/.ssh/id_ed25519"
echo "$IP"
