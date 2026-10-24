#!/bin/sh
# Build pdf's native binaries on glibc 2.28, so they run on every distribution Argus
# supports (Debian 12, Ubuntu 22.04, Rocky 9 and newer):
#
# - ironpress, HTML and Markdown to PDF, with our fix for non-ASCII outline titles
#   (ironpress-outline.patch, until upstream has it), built small;
# - qpdf, with its native crypto and zlib and libjpeg linked in: one file, no GnuTLS.
#
# Every source is pinned by version and sha-256; Rust's crates by ironpress's Cargo.lock.
# Run as root in quay.io/pypa/manylinux_2_28_<arch> (AlmaLinux 8), the repository at /src:
#   docker run --rm -v "$PWD:/src" -w /src quay.io/pypa/manylinux_2_28_x86_64 pdf/build/build.sh out
# The binaries and their licences go to <out>/<arch>/.
set -eu

RUSTUP=1.29.2
RUST=1.98.1
IRONPRESS=1.7.0
IRONPRESS_SHA256=cb193cd0e4909bf5203ab6d074594d75674a3cd034e7966114a3bc1283301e61
QPDF=12.4.2
QPDF_SHA256=8a58af5b6141319287c1883bec8bd1bd545b7567b7fc5e6ce5d25a1c85f36397
ZLIB=1.3.1
ZLIB_SHA256=9a93b2b7dfdac77ceba5a558a580e74667dd6fede4585b91eefb60f03b72df23
JPEG=3.2.0
JPEG_SHA256=6f30092cef9fb839779646608f4ee14ae3cbac989c47fa05e841b0841f09878e

ARCH=$(uname -m)
case "${ARCH}" in
  x86_64) RUSTUP_SHA256=5be191e8c70a5007074254cb74d78dbfdd25cd5a61c27de7b8e5410122ec24f4 ;;
  aarch64) RUSTUP_SHA256=a9c168dbea81a84671c6b7a5c1795cb0eb699020110d107ddfca427bd797e697 ;;
  *) echo "build: no build for ${ARCH}" >&2; exit 1 ;;
esac

here=$(cd "$(dirname "$0")" && pwd)
out=$(mkdir -p "${1:?usage: build.sh <out-dir>}/${ARCH}" && cd "$1/${ARCH}" && pwd)
work=$(mktemp -d)
mkdir -p "${out}/licenses"

# get <url> <sha256> <file>: download, and stop unless it is what was pinned.
get() {
  # AlmaLinux 8's curl retries no reset mid-transfer: a few tries here instead.
  for try in 1 2 3 4 5; do
    curl -fsSL --proto '=https' -o "${work}/$3" "$1" && break
    [ "${try}" = 5 ] && { echo "build: could not download $3" >&2; exit 1; }
    sleep 5
  done
  echo "$2  ${work}/$3" | sha256sum -c - >/dev/null || { echo "build: $3 does not match its sha-256" >&2; exit 1; }
}

# ── Rust ────────────────────────────────────────────────────────────────────
get "https://static.rust-lang.org/rustup/archive/${RUSTUP}/${ARCH}-unknown-linux-gnu/rustup-init" "${RUSTUP_SHA256}" rustup-init
chmod +x "${work}/rustup-init"
export RUSTUP_HOME="${work}/rustup" CARGO_HOME="${work}/cargo"
"${work}/rustup-init" -y --quiet --no-modify-path --profile minimal --default-toolchain "${RUST}"
PATH="${CARGO_HOME}/bin:${PATH}"

# ── ironpress ───────────────────────────────────────────────────────────────
get "https://static.crates.io/crates/ironpress/ironpress-${IRONPRESS}.crate" "${IRONPRESS_SHA256}" ironpress.crate
tar -xzf "${work}/ironpress.crate" -C "${work}"
(cd "${work}/ironpress-${IRONPRESS}" && patch -p0 --quiet < "${here}/ironpress-outline.patch")
# Small: 15 MB instead of 25, a third of it the fonts it embeds.
CARGO_PROFILE_RELEASE_OPT_LEVEL=s CARGO_PROFILE_RELEASE_LTO=fat CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1 \
  CARGO_PROFILE_RELEASE_PANIC=abort CARGO_PROFILE_RELEASE_STRIP=true \
  cargo build --quiet --release --locked --manifest-path "${work}/ironpress-${IRONPRESS}/Cargo.toml" --target-dir "${work}/target"
cp "${work}/target/release/ironpress" "${out}/ironpress"
cp "${work}/ironpress-${IRONPRESS}/LICENSE"* "${out}/licenses/ironpress-LICENSE"
for font in "${work}/ironpress-${IRONPRESS}"/assets/LICENSE-* "${work}/ironpress-${IRONPRESS}"/assets/*/LICENSE*; do
  [ -f "${font}" ] && cp "${font}" "${out}/licenses/ironpress-$(basename "$(dirname "${font}")")-$(basename "${font}")"
done

# ── qpdf, with zlib and libjpeg-turbo linked in ─────────────────────────────
deps="${work}/deps"
get "https://github.com/madler/zlib/releases/download/v${ZLIB}/zlib-${ZLIB}.tar.gz" "${ZLIB_SHA256}" zlib.tar.gz
tar -xzf "${work}/zlib.tar.gz" -C "${work}"
(cd "${work}/zlib-${ZLIB}" && CFLAGS='-O2 -fPIC' ./configure --static --prefix="${deps}" >/dev/null && make -s -j"$(nproc)" install >/dev/null)
get "https://github.com/libjpeg-turbo/libjpeg-turbo/releases/download/${JPEG}/libjpeg-turbo-${JPEG}.tar.gz" "${JPEG_SHA256}" jpeg.tar.gz
tar -xzf "${work}/jpeg.tar.gz" -C "${work}"
cmake -S "${work}/libjpeg-turbo-${JPEG}" -B "${work}/jpeg-build" -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="${deps}" -DCMAKE_INSTALL_LIBDIR=lib \
  -DENABLE_SHARED=OFF -DENABLE_STATIC=ON -DWITH_TURBOJPEG=OFF -DCMAKE_POSITION_INDEPENDENT_CODE=ON >/dev/null
cmake --build "${work}/jpeg-build" -j"$(nproc)" --target install >/dev/null
get "https://github.com/qpdf/qpdf/releases/download/v${QPDF}/qpdf-${QPDF}.tar.gz" "${QPDF_SHA256}" qpdf.tar.gz
tar -xzf "${work}/qpdf.tar.gz" -C "${work}"
cmake -S "${work}/qpdf-${QPDF}" -B "${work}/qpdf-build" -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH="${deps}" \
  -DBUILD_SHARED_LIBS=OFF -DBUILD_STATIC_LIBS=ON -DBUILD_DOC=OFF -DINSTALL_EXAMPLES=OFF \
  -DREQUIRE_CRYPTO_NATIVE=ON -DUSE_IMPLICIT_CRYPTO=OFF \
  -DCMAKE_EXE_LINKER_FLAGS='-static-libstdc++ -static-libgcc' >/dev/null
cmake --build "${work}/qpdf-build" -j"$(nproc)" --target qpdf >/dev/null
cp "${work}/qpdf-build/qpdf/qpdf" "${out}/qpdf"
strip "${out}/qpdf"
cp "${work}/qpdf-${QPDF}/LICENSE.txt" "${out}/licenses/qpdf-LICENSE.txt"
cp "${work}/qpdf-${QPDF}/NOTICE.md" "${out}/licenses/qpdf-NOTICE.md"
cp "${work}/zlib-${ZLIB}/LICENSE" "${out}/licenses/zlib-LICENSE"
cp "${work}/libjpeg-turbo-${JPEG}/LICENSE.md" "${out}/licenses/libjpeg-turbo-LICENSE.md"

# zlib and libjpeg are in qpdf itself, from deps/ (only static libraries there).
if objdump -p "${out}/qpdf" | grep -q 'NEEDED.*\(libz\|libjpeg\)'; then echo "build: qpdf links zlib or libjpeg dynamically" >&2; exit 1; fi

# Nothing newer than glibc 2.28, and nothing beyond the C library and the loader.
for bin in ironpress qpdf; do
  newest=$(objdump -T "${out}/${bin}" | grep -o 'GLIBC_[0-9.]*' | sort -uV | tail -1)
  echo "${bin}: $(du -h "${out}/${bin}" | cut -f1), needs ${newest}; $(objdump -p "${out}/${bin}" | awk '/NEEDED/ {printf "%s ", $2}')"
done
"${out}/qpdf" --version | head -1
"${out}/ironpress" --version
(cd "${out}" && sha256sum ironpress qpdf > SHA256SUMS)
rm -rf "${work}"
