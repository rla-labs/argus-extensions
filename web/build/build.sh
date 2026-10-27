#!/bin/sh
# Build Obscura (github.com/h4ckf0r0day/obscura, Apache-2.0) for web's fetch.sh, from its
# source at a pinned tag, with no stealth features. Run by .github/workflows/web-binaries.yml
# in rust:<pinned>-bookworm (glibc 2.36, the Argus image's); writes <out>/<arch>/: bin/obscura,
# bin/obscura-worker, licenses/.
#
# V8 is Deno's prebuilt static library (rusty_v8; building V8 itself takes hours): the
# archive is downloaded here, checked against the sha-256 recorded below, and handed to
# the v8 crate's build script through $CARGO_HOME/.rusty_v8, so it downloads nothing
# itself; after the build, its output must say it took that file.
set -eu

OBSCURA=v0.2.5
OBSCURA_SHA256=af287fa7658270a68ad6f1220197eb55035614a91b14295117da78e55494958a
V8=150.4.0
case "$(uname -m)" in
  x86_64)
    ARCH=x86_64
    V8_GZ_SHA256=5869fdb7071b1f21f200a97ce97d20125877e0f31cd802ed99de2c53f488b06c
    ;;
  aarch64)
    ARCH=aarch64
    V8_GZ_SHA256=b7177d52ad3337272fe0d3b8e778239c821a95c25d5959dec62b9efd654f7dd3
    ;;
  *) echo "web: no build for $(uname -m)" >&2; exit 1 ;;
esac
out="$(pwd)/${1:?usage: build.sh <out>}/${ARCH}"
work="$(mktemp -d)"

apt-get update -qq && apt-get install -y -qq curl ca-certificates jq >/dev/null

curl -fsSL --proto '=https' -o "${work}/obscura.tar.gz" "https://codeload.github.com/h4ckf0r0day/obscura/tar.gz/refs/tags/${OBSCURA}"
echo "${OBSCURA_SHA256}  ${work}/obscura.tar.gz" | sha256sum -c -
mkdir "${work}/src" && tar -xzf "${work}/obscura.tar.gz" -C "${work}/src" --strip-components=1

url="https://github.com/denoland/rusty_v8/releases/download/v${V8}/librusty_v8_release_${ARCH}-unknown-linux-gnu.a.gz"
mkdir -p "${CARGO_HOME:-${HOME}/.cargo}/.rusty_v8"
seeded="${CARGO_HOME:-${HOME}/.cargo}/.rusty_v8/$(printf '%s' "${url}" | sed 's/[^A-Za-z0-9]/_/g')"
curl -fsSL --proto '=https' -o "${seeded}" "${url}"
echo "${V8_GZ_SHA256}  ${seeded}" | sha256sum -c -

cd "${work}/src"
cargo build --locked --profile release-dist -p obscura-cli --bins --features render
# The v8 crate's build script says which archive it took: it must be the one checked above.
grep -rqsF "Copying ${seeded}" target/release-dist/build/v8-*/output \
  || { echo "web: the build did not take the checked V8 archive" >&2; grep -hs 'Downloading\|Copying\|Looking' target/release-dist/build/v8-*/output >&2; exit 1; }

mkdir -p "${out}/bin" "${out}/licenses"
cp target/release-dist/obscura target/release-dist/obscura-worker "${out}/bin/"
cp LICENSE "${out}/licenses/obscura-LICENSE"
# Every crate linked in, with its licence (V8 is BSD-3-Clause, rusty_v8 MIT).
cargo metadata --locked --format-version 1 \
  | jq -r '.packages[] | select(.source != null) | "\(.name) \(.version)\t\(.license // "see its repository")\t\(.repository // "")"' \
  | sort > "${out}/licenses/THIRD-PARTY.tsv"
"${out}/bin/obscura" --version
