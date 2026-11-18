#!/usr/bin/env bash
#
# deploy_llm1.sh
# ---------------------------------------------------------------------------
# Redeploy the Bozkurt Lab production instance on llm1: pull main, rebuild for
# the proxy subpath, restart the systemd user service, and check that the
# server can open the database.
#
# Usage (on llm1, as the account that owns the service):
#   bash scripts/deploy_llm1.sh           # pull, build, restart, verify
#   bash scripts/deploy_llm1.sh --check   # only verify the running service
#
# Reaching llm1 from a laptop: `ssh -t <user>@oddjobs.bmi.emory.edu ssh llm1`
# (llm1's .priv hostname only resolves inside the cluster).
#
# Why not launch_annotator.sh or a hand-run `next start`:
#   - The server must run as the `annotation-tool` systemd user service
#     (~/.config/systemd/user/annotation-tool.service). A process started by
#     hand lives in your SSH session and lacks the service's environment.
#   - better-sqlite3 was compiled with GCC 11 and needs its libstdc++
#     (GLIBCXX_3.4.29) from /opt/modules/gcc/GCC1140/lib64. The system one in
#     /lib64 is older. Without it every database call fails and the login page
#     says "The server is busy". `module load` does not work on llm1, so the
#     path is set directly, here and in the unit file.
#   - The app is served under /bmilabelapp/bozlabtool, and BASE_PATH is baked
#     in at build time. A build without it breaks every page behind the proxy.
# ---------------------------------------------------------------------------

set -euo pipefail

APP_DIR=/labs/bozkurtlab/annotation-tool/NER_annotation_tool
SERVICE=annotation-tool
BRANCH=main
BASE_PATH=/bmilabelapp/bozlabtool
PORT=8001
GCC_DIR=/opt/modules/gcc/GCC1140
# The Node the service runs (its ExecStart). A non-login shell does not load
# nvm, so put it on PATH explicitly; override if the unit changes.
NODE_BIN="${NODE_BIN:-$HOME/.nvm/versions/node/v20.20.2/bin}"
LOG_FILE="$HOME/annotation-tool.log"

die() { echo "ERROR: $*" >&2; exit 1; }

# Log in as an account that cannot exist. "Invalid credentials" proves the
# server is up AND opened the database; a page load alone does not, since the
# login page never touches it.
verify() {
    local url="http://127.0.0.1:${PORT}${BASE_PATH}/api/auth/login/" reply=""
    echo ">> Checking $url"
    for _ in $(seq 1 15); do
        reply="$(curl -s -X POST -H 'Content-Type: application/json' \
            --data '{"email":"deploy-check@example.invalid","password":"x"}' "$url" || true)"
        if [[ "$reply" == *"Invalid credentials"* ]]; then
            echo ">> OK: server is up and the database opens."
            return 0
        fi
        sleep 1
    done
    echo "ERROR: login check failed. Last reply: ${reply:-<none>}" >&2
    echo "       systemd says: $(systemctl --user is-active "$SERVICE" 2>&1 || true)" >&2
    echo "       Last lines of $LOG_FILE:" >&2
    tail -n 15 "$LOG_FILE" >&2 || true
    exit 1
}

if [ "${1:-}" = "--check" ]; then
    verify
    exit 0
fi

[ -d "$GCC_DIR/lib64" ] || die "$GCC_DIR/lib64 not found. Are you on llm1?"
[ -x "$NODE_BIN/node" ] || die "no node at $NODE_BIN. Set NODE_BIN to the service's Node bin dir."
systemctl --user cat "$SERVICE" >/dev/null 2>&1 \
    || die "systemd user service '$SERVICE' not found for $(whoami)."

export PATH="$NODE_BIN:$GCC_DIR/bin:$PATH"
export LD_LIBRARY_PATH="$GCC_DIR/lib64${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

cd "$APP_DIR"
current="$(git rev-parse --abbrev-ref HEAD)"
[ "$current" = "$BRANCH" ] || die "checkout is on '$current', expected '$BRANCH'."
# package-lock.json is ignored: npm can rewrite it without any code change.
if [ -n "$(git status --porcelain | grep -v 'package-lock\.json' || true)" ]; then
    die "uncommitted changes in $APP_DIR. Commit or stash them first."
fi

echo ">> Pulling $BRANCH"
git pull --ff-only
echo ">> Now at $(git log --oneline -1)"

if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
    echo ">> Dependencies changed; npm install (compiles better-sqlite3 with GCC 11)"
    npm install
    touch node_modules
fi

# The build replaces .next under the running server, so pages may error for
# the minute or so until the restart below.
echo ">> Building with BASE_PATH=$BASE_PATH"
BASE_PATH="$BASE_PATH" npm run build

echo ">> Restarting $SERVICE"
systemctl --user restart "$SERVICE"
verify
