#!/usr/bin/env bash
# SessionStart hook: make a fresh checkout (or a cloud session) ready to run
# npm test / npm run test:e2e / openspec. Does nothing when already set up.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

did=()
if [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund >/dev/null 2>&1 && did+=("npm ci")
fi
if ! node -e "process.exit(require('fs').existsSync(require('playwright').chromium.executablePath()) ? 0 : 1)" 2>/dev/null; then
  if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] && [ "$(id -u)" = "0" ]; then
    npx playwright install --with-deps chromium >/dev/null 2>&1 && did+=("playwright chromium + system deps")
  else
    npx playwright install chromium >/dev/null 2>&1 && did+=("playwright chromium")
  fi
fi
if [ ${#did[@]} -gt 0 ]; then
  echo "Dostupno setup: ${did[*]} done."
fi
