#!/bin/sh
# Install Python 3.12 and the PDF libraries (pikepdf, pypdf, pypdfium2, Pillow) into this
# folder, with no system Python and no network at run time. uv 0.13.1 is downloaded and
# checked against the sha-256 recorded here; uv checks the Python build it downloads
# against its own pinned hashes; every package comes from requirements.txt, by version
# and hash, as a wheel only. Run by Argus at /ext install, in the command sandbox: it
# writes only in this folder.
set -eu

PYTHON=3.12.12
case "$(uname -m)" in
  x86_64 | amd64) UV_ARCH=x86_64; UV_SHA256=6c86040a8f045ab9adc9e3ec4cdafa03fd00e9a988ed2bf28971c7fc2d0debd0 ;;
  aarch64 | arm64) UV_ARCH=aarch64; UV_SHA256=345a8308e4d1835cdfaadf692836fd3137a6d45864773f05ad7bf59442b1ba16 ;;
  *) echo "pdf: no Python build for $(uname -m)" >&2; exit 1 ;;
esac

here=$(pwd)
mkdir -p .build
curl -fsSL --proto '=https' --retry 2 -o .build/uv.tar.gz \
  "https://github.com/astral-sh/uv/releases/download/0.13.1/uv-${UV_ARCH}-unknown-linux-musl.tar.gz"
if ! echo "${UV_SHA256}  .build/uv.tar.gz" | sha256sum -c - >/dev/null 2>&1; then
  rm -rf .build
  echo "pdf: uv does not match its recorded sha-256; nothing installed" >&2
  exit 1
fi
tar -xzf .build/uv.tar.gz -C .build --strip-components=1

# Everything uv writes stays here: no home, no user config.
export HOME="${here}/.build" UV_CACHE_DIR="${here}/.build/cache" UV_NO_CONFIG=1 UV_PYTHON_INSTALL_DIR="${here}/.build/python"
.build/uv python install "${PYTHON}" --no-bin --quiet
mv .build/python/cpython-"${PYTHON}"-linux-* python
# The Python is the extension's own: uv marks it as managed, and the packages go into it.
.build/uv pip install --quiet --python python/bin/python3 --break-system-packages --require-hashes --only-binary :all: -r requirements.txt

# The folder is moved after install: nothing may point at where it was built.
rm -rf .build python/lib/python3.12/test python/lib/python3.12/idlelib python/lib/python3.12/tkinter
find python -type l -lname '/*' -delete
find python -name '__pycache__' -type d -prune -exec rm -rf {} +
python/bin/python3 -I -B -c 'import pikepdf, pypdf, pypdfium2, PIL'
