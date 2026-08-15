#!/usr/bin/env bash
# Thin wrapper around scripts/release.mjs so Git Bash / Linux / macOS can
# still run ./scripts/release.sh --minor. The implementation is Node because
# this repo's other helpers are .mjs and the default Windows shell is PowerShell.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$ROOT/scripts/release.mjs" "$@"
