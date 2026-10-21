#!/bin/sh
# Fetch Pretty Mermaid (imxv/Pretty-mermaid-skills, MIT) at a pinned commit, its
# dependencies from its lockfile, and the Inter font, each checked against a hash:
# the tarball and the font by the sha-256 recorded here, the npm packages by the
# integrity hashes of the lockfile. Run by Argus at /ext install, in the command
# sandbox: it writes only in this folder.
set -eu

COMMIT=e234ab73c2992f03c36db04fd55ebb90abca9c45
TARBALL_SHA256=e1d8e02a36ea1a32a56b8a9f14b38ba1a88247048b7696113b83ed885bb596fd
# Inter 4.1 (tag commit e3a3d4c), the variable TrueType file.
FONT_SHA256=4989b125924991b90d05b2d16e0e388c48f7d5bb8b30539bbf9c755278d0ccaf

case "$(uname -m)" in
  x86_64 | amd64 | aarch64 | arm64) ;;
  *) echo "diagrams: no prebuilt PNG renderer (resvg) for $(uname -m)" >&2; exit 1 ;;
esac
command -v node >/dev/null && command -v npm >/dev/null || { echo "diagrams: node and npm are needed" >&2; exit 1; }

check() {
  if ! echo "$1  $2" | sha256sum -c - >/dev/null 2>&1; then
    rm -f "$2"
    echo "diagrams: $2 does not match its recorded sha-256; nothing installed" >&2
    exit 1
  fi
}

curl -fsSL --proto '=https' --retry 2 -o app.tar.gz "https://github.com/imxv/Pretty-mermaid-skills/archive/${COMMIT}.tar.gz"
check "${TARBALL_SHA256}" app.tar.gz
mkdir -p app
tar -xzf app.tar.gz -C app --strip-components=1
rm app.tar.gz

mkdir -p fonts
curl -fsSL --proto '=https' --retry 2 -o fonts/InterVariable.ttf "https://raw.githubusercontent.com/rsms/inter/e3a3d4c57d5ecc01453a575621882a384c1995a3/docs/font-files/InterVariable.ttf"
check "${FONT_SHA256}" fonts/InterVariable.ttf

# Only what runs: no dev dependencies, no install scripts, the npm cache inside this folder.
(cd app && npm_config_cache="$(pwd)/../.npm-cache" npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error)
rm -rf .npm-cache

# resvg finds no system font in a slim image, so a PNG had no text: it is given Inter.
# One line of the pinned png.mjs, checked to have changed.
sed -i "s|font: { loadSystemFonts: true },|font: { loadSystemFonts: false, fontFiles: [process.env.DIAGRAMS_FONT], defaultFontFamily: 'Inter Variable', sansSerifFamily: 'Inter Variable' },|" app/scripts/png.mjs
grep -q 'DIAGRAMS_FONT' app/scripts/png.mjs || { echo "diagrams: could not give the PNG renderer its font" >&2; exit 1; }

# The references the skill points to.
cp app/references/DIAGRAM_TYPES.md app/references/THEMES.md skills/diagrams/
