#!/bin/sh
# Fetch ImageMagick's official Linux build (7.1.2-34, the gcc x86_64 AppImage), check it
# against the sha-256 recorded here, and unpack it without FUSE. It loads five libraries
# from the system, which the Argus image has; elsewhere this script names them. Run by
# Argus at /ext install, in the command sandbox: it writes only in this folder.
set -eu

VERSION=7.1.2-34
SHA256=6e9edfd35d5f30b57c27533afe003d6085faaf8607b207426f398d11751acf93

case "$(uname -m)" in
  x86_64 | amd64) ;;
  *) echo "images: ImageMagick publishes no Linux build for $(uname -m); the images extension runs on x64 only" >&2; exit 1 ;;
esac

curl -fsSL --proto '=https' --retry 2 -o im.AppImage \
  "https://github.com/ImageMagick/ImageMagick/releases/download/${VERSION}/ImageMagick-${VERSION}-gcc-x86_64.AppImage"
if ! echo "${SHA256}  im.AppImage" | sha256sum -c - >/dev/null 2>&1; then
  rm -f im.AppImage
  echo "images: the ImageMagick build does not match its recorded sha-256; nothing installed" >&2
  exit 1
fi
chmod 700 im.AppImage
./im.AppImage --appimage-extract >/dev/null
mv squashfs-root/usr im
rm -rf squashfs-root im.AppImage im/include im/share/doc im/share/man
find im/lib -maxdepth 1 -name '*.a' -delete
find im/lib -name '*.la' -delete
# Only this extension's policy.xml (etc/), never the build's more permissive one.
rm -f im/etc/ImageMagick-7/policy.xml

missing=$(LD_LIBRARY_PATH="$(pwd)/im/lib" ldd im/bin/magick | sed -n 's/^[[:space:]]*\([^ ]*\) => not found$/\1/p' | sort -u | tr '\n' ' ')
if [ -n "${missing}" ]; then
  echo "images: ImageMagick needs ${missing}from the system." >&2
  echo "  On Debian or Ubuntu: sudo apt-get install -y libx11-6 libfontconfig1 libfreetype6 libharfbuzz0b libfribidi0 fonts-dejavu-core" >&2
  exit 1
fi
