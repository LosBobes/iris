#!/usr/bin/env bash
#
# dev-setup.sh — warm a fresh dev container so the per-surface checks
# (go vet / go test, npm run lint / test / build) start immediately instead of
# paying for toolchain and dependency downloads on the first run.
#
# What it does (idempotent, safe to re-run):
#   1. Go: fetches the toolchain go.mod asks for (GOTOOLCHAIN=auto), downloads
#      modules, and pre-compiles the packages and test binaries into the build
#      cache (go vet primes the same cache go test uses).
#   2. Web: `npm ci` in apps/web (skipped when node_modules matches the lockfile).
#   3. --seed: migrates and seeds a demo SQLite DB at iris-api/data/iris.db
#      (logins admin/admin123, operater/operater123 in org "demo").
#
# Usage:
#   scripts/dev-setup.sh           # Go + web deps and build cache
#   scripts/dev-setup.sh --seed    # ...plus a demo database
#   scripts/dev-setup.sh --go-only | --web-only
#
# Suitable as a cloud environment setup script:
#   cd /home/user/iris 2>/dev/null && bash scripts/dev-setup.sh || true
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DO_GO=1
DO_WEB=1
DO_SEED=0
for arg in "$@"; do
  case "$arg" in
    --seed) DO_SEED=1 ;;
    --go-only) DO_WEB=0 ;;
    --web-only) DO_GO=0 ;;
    -h | --help)
      sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

step() { echo "→ $*"; }
elapsed() { echo "✓ $1 ($((SECONDS - $2))s)"; }

setup_go() {
  if ! command -v go >/dev/null 2>&1; then
    echo "✗ go not found on PATH; skipping iris-api" >&2
    return 1
  fi
  local t=$SECONDS
  cd "$ROOT/iris-api"
  # A local Go older than go.mod's `go` line downloads the matching toolchain.
  export GOTOOLCHAIN="${GOTOOLCHAIN:-auto}"
  step "Go toolchain: $(go version)"
  step "go mod download"
  go mod download
  step "go build ./... && go vet ./... (warms the build + test cache)"
  go build ./...
  go vet ./...
  cd "$ROOT"
  elapsed "iris-api ready" "$t"
}

setup_web() {
  if ! command -v npm >/dev/null 2>&1; then
    echo "✗ npm not found on PATH; skipping apps/web" >&2
    return 1
  fi
  local t=$SECONDS
  cd "$ROOT/apps/web"
  # npm writes this after a successful install; if it is newer than the lockfile
  # the tree already matches it.
  if [[ -f node_modules/.package-lock.json && node_modules/.package-lock.json -nt package-lock.json ]]; then
    step "apps/web node_modules up to date; skipping npm ci"
  else
    step "npm ci (apps/web)"
    # The pre-installed Chromium is used; never download Playwright browsers.
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --no-audit --no-fund
  fi
  cd "$ROOT"
  elapsed "apps/web ready" "$t"
}

seed_demo() {
  local t=$SECONDS
  cd "$ROOT/iris-api"
  mkdir -p data
  export DATABASE_PATH="${DATABASE_PATH:-./data/iris.db}"
  step "irisctl migrate + seed-demo → iris-api/${DATABASE_PATH#./}"
  go run ./cmd/irisctl migrate
  go run ./cmd/irisctl seed-demo
  cd "$ROOT"
  elapsed "demo database ready" "$t"
}

status=0
if ((DO_GO)); then setup_go || status=1; fi
if ((DO_WEB)); then setup_web || status=1; fi
if ((DO_SEED)); then seed_demo || status=1; fi
exit "$status"
