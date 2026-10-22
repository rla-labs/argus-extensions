#!/bin/sh
# Fetch the pinned OfficeCLI release for this machine, and check it against the
# hash recorded here (from the release's SHA256SUMS); then Chrome Headless Shell, for
# OfficeCLI's screenshots and office-pdf, checked the same way. Run by Argus at
# /ext install, in the command sandbox: it writes only in this folder.
set -eu

VERSION=1.0.158
# The same Chrome Headless Shell as the browser extension: Playwright's revision 1247.
CHROME_VERSION=155.0.8059.12
case "$(uname -m)" in
  x86_64 | amd64)
    ASSET=officecli-linux-x64
    SHA256=9ee41d5558caea7bcd5aab1b3e76b2bd70f0535f09cf65dda3668130510cc719
    CHROME=linux64
    CHROME_SHA256=aeb9283943ef1f21864ea42ad1201b89f5bcf6a84c3e3d0d641529d251914bed
    ;;
  aarch64 | arm64)
    ASSET=officecli-linux-arm64
    SHA256=b1d5e74d93a8471a47b037cc7774ac29c559940e226f99b9fdf788966cc395b8
    CHROME=linux-arm64
    CHROME_SHA256=a06e379e7ffa1713894292eb6ff8e01f4fe603669bb100d857437d965f646c03
    ;;
  *)
    echo "office: OfficeCLI has no Linux build for $(uname -m)" >&2
    exit 1
    ;;
esac

mkdir -p bin
curl -fsSL --proto '=https' --retry 2 -o bin/officecli.part \
  "https://github.com/iOfficeAI/OfficeCLI/releases/download/v${VERSION}/${ASSET}"
if ! echo "${SHA256}  bin/officecli.part" | sha256sum -c - >/dev/null 2>&1; then
  rm -f bin/officecli.part
  echo "office: ${ASSET} ${VERSION} does not match its recorded sha-256; nothing installed" >&2
  exit 1
fi
mv bin/officecli.part bin/officecli
chmod 755 bin/officecli

# Chrome Headless Shell. The image has no unzip: extract-zip, from the lockfile, keeps
# the files' modes.
command -v node >/dev/null && command -v npm >/dev/null || { echo "office: node and npm are needed" >&2; exit 1; }
npm_config_cache="$(pwd)/.npm-cache" npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error
rm -rf .npm-cache
curl -fsSL --proto '=https' --retry 2 -o chromium.zip "https://cdn.playwright.dev/builds/cft/${CHROME_VERSION}/${CHROME}/chrome-headless-shell-${CHROME}.zip"
if ! echo "${CHROME_SHA256}  chromium.zip" | sha256sum -c - >/dev/null 2>&1; then
  rm -f chromium.zip
  echo "office: chromium.zip does not match its recorded sha-256; nothing installed" >&2
  exit 1
fi
node -e "require('extract-zip')('chromium.zip', { dir: process.cwd() + '/unpacked' }).catch((error) => { console.error('office: ' + error.message); process.exit(1) })"
rm chromium.zip
mv "unpacked/chrome-headless-shell-${CHROME}" chromium
rmdir unpacked
test -x chromium/chrome-headless-shell || { echo "office: chrome-headless-shell is missing from the archive" >&2; exit 1; }
