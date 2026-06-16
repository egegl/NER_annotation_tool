#!/usr/bin/env bash
#
# launch_annotator.sh
# ---------------------------------------------------------------------------
# Launcher for the BMI Annotation Tool on the cluster.
#
# Run this AFTER `git pull`: it reinstalls dependencies when they change,
# rebuilds the app so your pulled code actually goes live, then starts the
# server connected to the shared database.
#
# Usage:
#   git pull
#   ./launch_annotator.sh [port]
#
# Environment overrides:
#   DATA_DIR=/some/path     where the shared SQLite database lives
#   SKIP_BUILD=1            start the existing build without rebuilding
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

# ---- 5. Build --------------------------------------------------------------
# Always rebuild after a pull so the new code is served. This is the key
# difference from a build that only runs when .next is missing: an existing
# .next from a previous version would otherwise serve stale code.
if [ "${SKIP_BUILD:-0}" = "1" ]; then
    echo ">> SKIP_BUILD=1 set; using existing build."
    if [ ! -d .next ]; then
        echo "ERROR: no .next build found, but SKIP_BUILD=1 was set." >&2
        exit 1
    fi
else
    echo ">> Building the app..."
    npm run build
fi

# ---- 6. Launch -------------------------------------------------------------
mkdir -p "$DATA_DIR"
export INSECURE_COOKIES=true

cat <<EOF

============================================================
  Data dir: $DATA_DIR

  Open this in a browser ON THE SAME node (e.g. inside a
  Cluster Desktop session):

      http://localhost:${PORT}

  Log in using the credentials provided by your lab admin.

  (Ctrl-C to stop)
============================================================

EOF

exec node_modules/.bin/next start -p "$PORT"
