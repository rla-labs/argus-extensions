#!/bin/sh
# Run by Argus's extension test (`pnpm test:docker-extensions`) in a project's folder,
# confined, as the project's own shell runs ImageMagick. Fails on the first error.
set -eu

mkdir -p i/out
magick -size 1600x1000 gradient:'#1e3a8a-#f59e0b' i/photo.png
magick i/photo.png -resize 800x i/out/small.jpg
magick i/photo.png -resize 400x400^ -gravity center -extent 400x400 i/out/square.webp
magick i/photo.png -quality 80 i/out/photo.avif
magick i/photo.png -gravity southeast -pointsize 48 -fill white -annotate +20+20 'Argus ăîșț' i/out/marked.png
magick montage i/out/small.jpg i/out/square.webp -tile 2x1 -geometry +4+4 i/out/sheet.png
magick mogrify -path i/out -format png i/out/small.jpg
test "$(magick identify -format '%w' i/out/small.jpg)" = 800
test "$(magick identify -format '%wx%h' i/out/square.webp)" = 400x400
for file in i/out/photo.avif i/out/marked.png i/out/sheet.png i/out/small.png; do test -s "${file}"; done
# The policy: a drawing script, a URL and a PDF are refused.
printf 'viewbox 0 0 10 10\n' > i/x.mvg
magick mvg:i/x.mvg i/out/x.png 2>/dev/null && { echo "MVG was not refused" >&2; exit 1; }
magick 'https://example.com/a.png' i/out/y.png 2>/dev/null && { echo "a URL was not refused" >&2; exit 1; }
magick i/photo.png i/out/z.pdf 2>/dev/null && { echo "PDF was not refused" >&2; exit 1; }
echo "images smoke: ok"
