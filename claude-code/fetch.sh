#!/bin/sh
# Install Claude Code into this folder: the native program from Anthropic's npm package for
# this machine, at a pinned version, checked against the sha-512 npm publishes for it. No
# npm, no Node package is installed, and nothing is fetched at run time (auto-update is
# off). Run by Argus at /ext install, in the command sandbox: it writes only in this folder.
set -eu

VERSION=2.1.310
case "$(uname -m)" in
  x86_64 | amd64) PLATFORM=linux-x64; SHA512=0aece926b3016ea691dfed5288bac1b4f577c3f705bdca817e17bd90db24cd9d859ba2976bbbf497bb4cf8b9fa97940b6fbf56a14d0271a7179d8b6cca06dee8 ;;
  aarch64 | arm64) PLATFORM=linux-arm64; SHA512=880ba41a21a6b089dab2e5b7e28e04c43f06aa1ddbfc23d4a7a923c6c588053f2d141ad5171b5619f23bc1f472de8c16adbb917a404268740532223675d594a4 ;;
  *) echo "claude-code: no build for $(uname -m)" >&2; exit 1 ;;
esac

archive=.claude-code.tgz
curl -fsSL --proto '=https' --retry 2 -o "${archive}" \
  "https://registry.npmjs.org/@anthropic-ai/claude-code-${PLATFORM}/-/claude-code-${PLATFORM}-${VERSION}.tgz"
if ! echo "${SHA512}  ${archive}" | sha512sum -c - >/dev/null 2>&1; then
  rm -f "${archive}"
  echo "claude-code: the archive does not match its recorded sha-512; nothing installed" >&2
  exit 1
fi
rm -rf claude .claude-code-x
mkdir .claude-code-x
tar -xzf "${archive}" --no-same-owner -C .claude-code-x
mkdir claude
mv .claude-code-x/package/claude claude/claude
mv .claude-code-x/package/LICENSE.md claude/LICENSE.md
rm -rf .claude-code-x "${archive}"
chmod 0755 claude/claude
claude/claude --version >/dev/null
