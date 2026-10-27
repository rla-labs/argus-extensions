#!/bin/sh
# Run by Argus's extension test (`pnpm test:docker-extensions`) in a project's folder,
# confined: the end-to-end test against a fake OpenAI API and a fake Argus host channel,
# with the Codex fetch.sh installed. No account, no network.
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
ARGUS_CODEX_BIN="${here}/../codex/codex" E2E_TMP="${TMPDIR:-/tmp}" node "${here}/e2e.mjs"
