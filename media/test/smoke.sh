#!/bin/sh
# Run by Argus's extension test (`pnpm test:docker-extensions`) in a project's folder,
# confined, as the project's own shell runs ffmpeg. Fails on the first error.
set -eu

mkdir -p out
ffmpeg -v error -f lavfi -i testsrc2=size=1280x720:rate=30 -f lavfi -i sine=frequency=440 \
  -t 10 -c:v libx264 -preset veryfast -c:a aac -shortest in.mp4
ffmpeg -v error -ss 2 -i in.mp4 -t 4 -c copy out/cut.mp4
ffmpeg -v error -i in.mp4 -vn -c:a libmp3lame -q:a 4 out/audio.mp3
ffmpeg -v error -ss 3 -i in.mp4 -frames:v 1 out/thumb.jpg
ffmpeg -v error -t 2 -i in.mp4 -vf "fps=10,scale=320:-1" out/clip.gif
duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 out/cut.mp4)
case "${duration}" in 3.* | 4.* | 5.*) ;; *) echo "unexpected cut duration ${duration}" >&2; exit 1 ;; esac
for file in out/audio.mp3 out/thumb.jpg out/clip.gif; do test -s "${file}"; done
echo "media smoke: ok"
