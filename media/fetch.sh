#!/bin/sh
# Fetch the pinned static ffmpeg and ffprobe for this machine (John Van Sickle's
# 7.0.2 builds, as eugeneware/ffmpeg-static b6.1.1 publishes them) and check each
# against the sha-256 recorded here. Run by Argus at /ext install, in the command
# sandbox: it writes only in this folder.
set -eu

RELEASE=b6.1.1
case "$(uname -m)" in
  x86_64 | amd64)
    ARCH=x64
    FFMPEG_SHA256=bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa
    FFPROBE_SHA256=25d9b6ccb05e3d9de9e04e31e2506d8dd7f9f0418981965ac6df12e8d3afd067
    ;;
  aarch64 | arm64)
    ARCH=arm64
    FFMPEG_SHA256=754a678672298bc68156adff58aa7385a592c2b30b1d0ae8750c45c915c4bac0
    FFPROBE_SHA256=2ab6aba60ee84412dff9188720703376cb4e7aaf7e0b5e43aa8249f2acae5bf8
    ;;
  *)
    echo "media: no static ffmpeg for $(uname -m)" >&2
    exit 1
    ;;
esac

mkdir -p bin
fetch() {
  name=$1
  sha=$2
  curl -fsSL --proto '=https' --retry 2 -o "bin/${name}.gz" \
    "https://github.com/eugeneware/ffmpeg-static/releases/download/${RELEASE}/${name}-linux-${ARCH}.gz"
  if ! echo "${sha}  bin/${name}.gz" | sha256sum -c - >/dev/null 2>&1; then
    rm -f "bin/${name}.gz"
    echo "media: ${name}-linux-${ARCH}.gz does not match its recorded sha-256; nothing installed" >&2
    exit 1
  fi
  gunzip -f "bin/${name}.gz"
  chmod 755 "bin/${name}"
}
fetch ffmpeg "${FFMPEG_SHA256}"
fetch ffprobe "${FFPROBE_SHA256}"
