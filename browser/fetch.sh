#!/bin/sh
# Fetch Playwright MCP from its lockfile (the npm packages checked by the lockfile's
# integrity hashes) and Chrome Headless Shell, the browser it drives, checked against
# the sha-256 recorded here. Run by Argus at /ext install, in the command sandbox: it
# writes only in this folder.
set -eu

# The headless shell of Playwright 1.64.0-alpha's revision 1247, which @playwright/mcp
# 0.0.83 expects, from Playwright's CDN.
VERSION=155.0.8059.12
case "$(uname -m)" in
  x86_64 | amd64) PLATFORM=linux64; SHA256=aeb9283943ef1f21864ea42ad1201b89f5bcf6a84c3e3d0d641529d251914bed ;;
  aarch64 | arm64) PLATFORM=linux-arm64; SHA256=a06e379e7ffa1713894292eb6ff8e01f4fe603669bb100d857437d965f646c03 ;;
  *) echo "browser: no Chrome Headless Shell for $(uname -m)" >&2; exit 1 ;;
esac
command -v node >/dev/null && command -v npm >/dev/null || { echo "browser: node and npm are needed" >&2; exit 1; }

# Only what runs: no dev dependencies, no install scripts (Playwright's would download a
# browser unchecked), the npm cache inside this folder.
npm_config_cache="$(pwd)/.npm-cache" npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error
rm -rf .npm-cache

curl -fsSL --proto '=https' --retry 2 -o chromium.zip "https://cdn.playwright.dev/builds/cft/${VERSION}/${PLATFORM}/chrome-headless-shell-${PLATFORM}.zip"
if ! echo "${SHA256}  chromium.zip" | sha256sum -c - >/dev/null 2>&1; then
  rm -f chromium.zip
  echo "browser: chromium.zip does not match its recorded sha-256; nothing installed" >&2
  exit 1
fi
# The image has no unzip: extract-zip, from the lockfile, keeps the files' modes.
node -e "require('extract-zip')('chromium.zip', { dir: process.cwd() + '/unpacked' }).catch((error) => { console.error('browser: ' + error.message); process.exit(1) })"
rm chromium.zip
mv "unpacked/chrome-headless-shell-${PLATFORM}" chromium
rmdir unpacked
test -x chromium/chrome-headless-shell || { echo "browser: chrome-headless-shell is missing from the archive" >&2; exit 1; }
