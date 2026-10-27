#!/bin/sh
# Install web's programs into this folder: obscura and obscura-worker, built from Obscura's
# source (v0.2.5, no stealth) by build/build.sh in this repository's CI and published as the
# release web-bin-1.0.0. The archive for this machine is downloaded and checked against the
# sha-256 recorded here. Nothing is installed on the system, and nothing is fetched at run
# time. Run by Argus at /ext install, in the command sandbox: it writes only in this folder.
set -eu

RELEASE=web-bin-1.0.0
case "$(uname -m)" in
  x86_64 | amd64) ARCH=x86_64; SHA256=71b2cca0eb61595f4f8e0788fec172617e8f31bae273a8fd272034b52050d4c5 ;;
  aarch64 | arm64) ARCH=aarch64; SHA256=803567854e5e5ca3d3db3a41f86ccd669a5bf545980ef320b98b355649aa586c ;;
  *) echo "web: no build for $(uname -m)" >&2; exit 1 ;;
esac

archive=.web-bin.tar.gz
curl -fsSL --proto '=https' --retry 2 -o "${archive}" \
  "https://github.com/rla-labs/argus-extensions/releases/download/${RELEASE}/web-bin-linux-${ARCH}.tar.gz"
if ! echo "${SHA256}  ${archive}" | sha256sum -c - >/dev/null 2>&1; then
  rm -f "${archive}"
  echo "web: the archive does not match its recorded sha-256; nothing installed" >&2
  exit 1
fi
rm -rf bin licenses
tar -xzf "${archive}" --no-same-owner
rm -f "${archive}"
bin/obscura --version >/dev/null
