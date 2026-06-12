#!/usr/bin/env bash
#
# start_annotation_tool.sh
# ---------------------------------------------------------------------------
# Modified launcher for the BMI Annotation Tool.
# Prioritizes an existing `node` environment (e.g., via NVM or Conda).
# 
# Usage:
#   ./start_annotation_tool.sh [optional_node_module] [project_dir] [port]
# ---------------------------------------------------------------------------

set -eo pipefail

# ---- args ------------------------------------------------------------------
NODE_MODULE="${1:-}"                 
PROJECT_DIR_ARG="${2:-}"             
PORT="${3:-3000}"

# ---- 0. locate the project -------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "$PROJECT_DIR_ARG" ]; then
    PROJECT_DIR="$PROJECT_DIR_ARG"
elif [ -f "$SCRIPT_DIR/../package.json" ]; then
    PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)" 
else
    PROJECT_DIR="$HOME/NER_annotation_tool"
    echo ">> WARNING: guessing project dir: $PROJECT_DIR (pass it as arg 2 to override)." >&2
fi

if [ ! -f "$PROJECT_DIR/package.json" ]; then
    echo "ERROR: no package.json at $PROJECT_DIR -- not the project directory." >&2
    exit 1
fi
echo ">> Project: $PROJECT_DIR"

# ---- 1. Try Loading a Specific Module (If Provided) -------------------------
if [ -n "$NODE_MODULE" ]; then
    echo ">> Loading requested Node.js module: $NODE_MODULE"
    # Make the `module` command available
    if ! command -v module >/dev/null 2>&1; then
        for init in /etc/profile.d/modules.sh /usr/share/Modules/init/bash /usr/share/lmod/lmod/init/bash; do
            [ -f "$init" ] && source "$init" && break
        done
    fi
    module load "$NODE_MODULE" || echo "WARNING: Failed to load module $NODE_MODULE" >&2
fi

# ---- 2. Verify Node.js Environment ------------------------------------------
if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: 'node' command not found in PATH." >&2
    echo "       Since your cluster lacks bmi/nodejs modules, please install Node using NVM:" >&2
    echo "       curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash" >&2
    echo "       nvm install 20" >&2
    exit 1
fi

echo ">> Using node: $(command -v node) ($(node -v))  npm $(npm -v)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"

if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "ERROR: Node $NODE_MAJOR is too old; Next.js 15 needs Node >= 18.18." >&2
    exit 1
fi

cd "$PROJECT_DIR"

# ---- 3. install dependencies + build (once, then reused) -------------------
if [ "${FORCE_BUILD:-0}" = "1" ] || [ ! -d node_modules ]; then
    echo ">> Installing npm dependencies (needs network)..."
    
    # Check if GCC module is available as a fallback for compilation steps
    if module avail bmi/gcc 2>&1 | grep -q 'bmi/gcc'; then
        echo ">> Loading GCC module just in case better-sqlite3 requires compilation..."
        module load bmi/gcc-11.4.0 || true
    fi
    
    npm install
fi

if [ "${FORCE_BUILD:-0}" = "1" ] || [ ! -d .next ]; then
    echo ">> Building the app (npm run build)..."
    npm run build
fi

# ---- 4. data directory + seed an admin account -----------------------------
export DATA_DIR="${DATA_DIR:-$HOME/.local/share/bmi-annotation-tool}"
mkdir -p "$DATA_DIR"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@demo.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-demodemo}"
echo ">> Data directory: $DATA_DIR"
echo ">> Ensuring admin account: $ADMIN_EMAIL"

# Create the DB using the seed script
node scripts/seed_db.mjs --email "$ADMIN_EMAIL" --password "$ADMIN_PASSWORD" --role admin

# ---- 5. launch -------------------------------------------------------------
export INSECURE_COOKIES=true

cat <<EOF

============================================================
  Open this in a browser ON THE SAME node (e.g. inside a
  Cluster Desktop session):

      http://localhost:${PORT}

  Admin login:   ${ADMIN_EMAIL}
  Password:      ${ADMIN_PASSWORD}

  (Ctrl-C to stop)
============================================================

EOF

exec node_modules/.bin/next start -p "$PORT"