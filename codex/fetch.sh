#!/bin/sh
# Install OpenAI's Codex CLI into this folder: the static program from OpenAI's npm package
# for this machine, at a pinned version, checked against the sha-512 npm publishes for it.
# Only the program and its ripgrep are kept (the package's voice libraries are not). No npm,
# nothing fetched at run time. Run by Argus at /ext install, in the command sandbox.
set -eu

VERSION=0.164.0
case "$(uname -m)" in
  x86_64 | amd64) PLATFORM=linux-x64; TRIPLE=x86_64-unknown-linux-musl; SHA512=5cb028696b06393da487397e3f81580cf4e4cc0afd5b45455c569592a945764334b286b5807ff84b4c120f9ec49371c7c248ab0041b3dbf3307a1b1e87e97932 ;;
  aarch64 | arm64) PLATFORM=linux-arm64; TRIPLE=aarch64-unknown-linux-musl; SHA512=2cbe624d08f20cbe18457e38116aa121f110e6e1a79a0c64401252c63652789f0bd4e83cde9765cd4256fcf449efaa1a570395821e875f0b8f12204d10753896 ;;
  *) echo "codex: no build for $(uname -m)" >&2; exit 1 ;;
esac

archive=.codex.tgz
curl -fsSL --proto '=https' --retry 2 -o "${archive}" \
  "https://registry.npmjs.org/@openai/codex/-/codex-${VERSION}-${PLATFORM}.tgz"
if ! echo "${SHA512}  ${archive}" | sha512sum -c - >/dev/null 2>&1; then
  rm -f "${archive}"
  echo "codex: the archive does not match its recorded sha-512; nothing installed" >&2
  exit 1
fi
rm -rf codex .codex-x
mkdir .codex-x
tar -xzf "${archive}" --no-same-owner -C .codex-x "package/vendor/${TRIPLE}/bin/codex" "package/vendor/${TRIPLE}/codex-path/rg"
mkdir -p codex/path
mv ".codex-x/package/vendor/${TRIPLE}/bin/codex" codex/codex
mv ".codex-x/package/vendor/${TRIPLE}/codex-path/rg" codex/path/rg
rm -rf .codex-x "${archive}"
chmod 0755 codex/codex codex/path/rg
codex/codex --version >/dev/null
