#!/usr/bin/env bash
set -euo pipefail

PLAYWRIGHT_VERSION="1.63.0"
PORT="${PICA_WEB_SMOKE_PORT:-4173}"
BASE_URL="http://127.0.0.1:${PORT}"

# Keep Playwright as a CI-only smoke dependency for this development branch.
# The normal frozen dependency install has already completed before this script runs.
pnpm add -D "@playwright/test@${PLAYWRIGHT_VERSION}" --ignore-workspace-root-check
pnpm exec playwright install --with-deps chromium

python3 -m http.server "${PORT}" --bind 127.0.0.1 --directory web \
    >"${RUNNER_TEMP:-/tmp}/pica-web-smoke-http.log" 2>&1 &
server_pid=$!
cleanup() {
    kill "${server_pid}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

ready=0
for _ in $(seq 1 50); do
    if curl --fail --silent --show-error "${BASE_URL}/" >/dev/null; then
        ready=1
        break
    fi
    sleep 0.2
done

if [[ "${ready}" != "1" ]]; then
    cat "${RUNNER_TEMP:-/tmp}/pica-web-smoke-http.log" || true
    echo "Static Web smoke server did not become ready." >&2
    exit 1
fi

PICA_WEB_SMOKE_URL="${BASE_URL}" \
    pnpm exec playwright test test/e2e/web-smoke.spec.mjs test/e2e/localization-layout.spec.mjs test/e2e/onboarding.spec.mjs \
    --config=playwright.smoke.config.mjs \
    --workers=1 \
    --reporter=line
