#!/bin/sh
# Fetch the pinned OfficeCLI release for this machine, and check it against the
# hash recorded here (from the release's SHA256SUMS). Run by Argus at /ext install,
# in the command sandbox: it writes only in this folder.
set -eu

VERSION=1.0.158
case "$(uname -m)" in
  x86_64 | amd64)
    ASSET=officecli-linux-x64
    SHA256=9ee41d5558caea7bcd5aab1b3e76b2bd70f0535f09cf65dda3668130510cc719
    ;;
  aarch64 | arm64)
    ASSET=officecli-linux-arm64
    SHA256=b1d5e74d93a8471a47b037cc7774ac29c559940e226f99b9fdf788966cc395b8
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
