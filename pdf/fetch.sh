#!/bin/sh
# Install pdf's programs into this folder: pdftool, qpdf, PDFium and ironpress, built on
# glibc 2.28 by build/build.sh in this repository's CI and published as the release
# pdf-bin-2.0.0. The archive for this machine is downloaded and checked against the
# sha-256 recorded here. Nothing is installed on the system, and nothing is fetched at
# run time. Run by Argus at /ext install, in the command sandbox: it writes only in this
# folder.
set -eu

RELEASE=pdf-bin-2.0.0
case "$(uname -m)" in
  x86_64 | amd64) ARCH=x86_64; SHA256=2437d3ed160d6ae9c6f8f338f6ddb12fa409ce7b169d19e464346506d720a89a ;;
  aarch64 | arm64) ARCH=aarch64; SHA256=0815da9d455c1416614a87cceb5ef003cadc58023d40bf298d81841eea4ac170 ;;
  *) echo "pdf: no build for $(uname -m)" >&2; exit 1 ;;
esac

archive=.pdf-bin.tar.gz
curl -fsSL --proto '=https' --retry 2 -o "${archive}" \
  "https://github.com/rla-labs/argus-extensions/releases/download/${RELEASE}/pdf-bin-linux-${ARCH}.tar.gz"
if ! echo "${SHA256}  ${archive}" | sha256sum -c - >/dev/null 2>&1; then
  rm -f "${archive}"
  echo "pdf: the archive does not match its recorded sha-256; nothing installed" >&2
  exit 1
fi
rm -rf bin lib libexec licenses
tar -xzf "${archive}" --no-same-owner
rm -f "${archive}"
bin/pdftool --version >/dev/null
bin/qpdf --version >/dev/null
