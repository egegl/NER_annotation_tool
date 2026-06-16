#!/usr/bin/env bash
#
# launch_annotator.sh
# ---------------------------------------------------------------------------
# Launcher for the BMI Annotation Tool on the cluster.
#
# Run this AFTER `git pull`: it reinstalls dependencies when they change,
# rebuilds the app when the code changed so your pulled code actually goes live,
# then starts the server connected to the shared database.
#
# The rebuild is skipped when the current commit is already built and the
# working tree is clean, so re-launching without a new pull is near-instant.
#
# IMPORTANT — run ONE shared server, not one per person.
#   The SQLite database in DATA_DIR must only ever be opened by a single server
#   process. SQLite's file locking is unreliable across hosts on a network
#   filesystem, so several people each launching their own server against the
#   shared database causes login errors and risks corrupting annotations.
#   Instead, one person launches this once; everyone else opens the printed
#   http://<hostname>:<port> URL in their browser. The server binds to all
#   interfaces (0.0.0.0) so other nodes on the cluster network can reach it.
#
# Usage:
#   git pull
#   ./launch_annotator.sh [port]
#
# Environment overrides:
#   DATA_DIR=/some/path     where the shared SQLite database lives
#   SKIP_BUILD=1            start the existing build, even if the code changed
# ---------------------------------------------------------------------------

set -eo pipefail

# ---- 0. Configuration ------------------------------------------------------
PORT="${1:-3000}"

# Shared data folder (the SQLite db lives here, outside the code directory).
export DATA_DIR="${DATA_DIR:-/labs/bozkurtlab/annotation-tool/data}"

# ---- 1. Locate the project -------------------------------------------------
# This script lives in the project root, so the project dir IS the script dir.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"

if [ ! -f "$PROJECT_DIR/package.json" ]; then
    echo "ERROR: no package.json found next to this script." >&2
    echo "       Run it from inside the annotation-tool project directory." >&2
    exit 1
fi
echo ">> Project: $PROJECT_DIR"

cd "$PROJECT_DIR"

# ---- 2. Verify Node.js environment -----------------------------------------
if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: 'node' command not found in PATH." >&2
    echo "       Ask your lab admin to install Node.js (via NVM) or set up your" >&2
    echo "       environment correctly." >&2
    exit 1
fi
echo ">> Using node: $(command -v node) ($(node -v))"

# ---- 3. Load GCC (for better-sqlite3) --------------------------------------
# better-sqlite3 is a native module and needs a C/C++ toolchain to compile.
if command -v module >/dev/null 2>&1; then
    module load bmi/gcc-11.4.0 >/dev/null 2>&1 || true
fi

# ---- 4. Install dependencies (only when they changed) ----------------------
# Reinstall if node_modules is missing or package-lock.json is newer than it.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
    echo ">> Installing npm dependencies..."
    npm install
    touch node_modules
else
    echo ">> Dependencies up to date; skipping npm install."
fi

# ---- 5. Build (skip when the current commit is already built) --------------
# We stamp each successful build with the git commit it was built from
# (.next/.built-commit). On the next launch we rebuild only when that stamp is
# missing/stale or the working tree has uncommitted changes — so re-running the
# launcher without a fresh `git pull` is near-instant, while a pull (new HEAD)
# or local edits still force a rebuild and never serve stale code.
STAMP_FILE="$PROJECT_DIR/.next/.built-commit"

# The commit we'd build from, but only when the tree is clean. A dirty tree
# leaves this empty, which forces a rebuild (uncommitted edits aren't a commit).
# package-lock.json is ignored: `npm install` can rewrite it on a different
# machine/npm version without the source code actually changing, which would
# otherwise mark the tree dirty and defeat the build-skip on every launch.
BUILD_COMMIT=""
if git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    DIRTY="$(git -C "$PROJECT_DIR" status --porcelain | grep -v 'package-lock\.json' || true)"
    if [ -z "$DIRTY" ]; then
        BUILD_COMMIT="$(git -C "$PROJECT_DIR" rev-parse HEAD)"
    fi
fi

if [ "${SKIP_BUILD:-0}" = "1" ]; then
    echo ">> SKIP_BUILD=1 set; using existing build."
    if [ ! -d .next ]; then
        echo "ERROR: no .next build found, but SKIP_BUILD=1 was set." >&2
        exit 1
    fi
elif [ -n "$BUILD_COMMIT" ] && [ -d .next ] && [ -f "$STAMP_FILE" ] \
     && [ "$(cat "$STAMP_FILE")" = "$BUILD_COMMIT" ]; then
    echo ">> Build already up to date for commit ${BUILD_COMMIT:0:12}; skipping build."
else
    echo ">> Building the app..."
    npm run build
    # Stamp the build so the next launch can detect it's current. Skipped when
    # the tree is dirty or not a git checkout (BUILD_COMMIT empty), so those
    # always rebuild next time.
    if [ -n "$BUILD_COMMIT" ]; then
        echo "$BUILD_COMMIT" > "$STAMP_FILE"
        echo ">> Stamped build as commit ${BUILD_COMMIT:0:12}."
    fi
fi

# ---- 6. Launch -------------------------------------------------------------
mkdir -p "$DATA_DIR"
export INSECURE_COOKIES=true

# Best-effort fully-qualified hostname so the banner shows a URL other nodes can
# reach. Falls back to the short hostname if -f isn't supported.
HOSTNAME_FQDN="$(hostname -f 2>/dev/null || hostname)"

cat <<EOF

============================================================
  Data dir: $DATA_DIR

  This is the SHARED server. Run only one of these against
  the shared database. Share this URL with the other
  annotators (they open it in their own browser — they do
  NOT run this script):

      http://${HOSTNAME_FQDN}:${PORT}

  On this same machine you can also use:

      http://localhost:${PORT}

  Log in using the credentials provided by your lab admin.

  (Ctrl-C to stop)
============================================================

EOF

# Bind to 0.0.0.0 so annotators on other cluster nodes can reach this single
# shared server over the network, rather than each launching their own.
exec node_modules/.bin/next start -H 0.0.0.0 -p "$PORT"
