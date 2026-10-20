---
name: media
description: Cut, join, convert, compress and inspect audio and video with ffmpeg and ffprobe; extract audio, thumbnails, GIFs, subtitles. Use for any audio or video file.
---

# Audio and video with ffmpeg

`ffmpeg` and `ffprobe` (7.0.2, static) are installed in your shell. Never install them,
and never download a codec.

## Rules

- **Look before you touch:** `ffprobe -v error -show_entries format=duration,size:stream=index,codec_type,codec_name,width,height,r_frame_rate,channels,sample_rate -of json in.mp4`.
- **Write only in your folder.** `/tmp` is small and is not kept. Never overwrite the
  original: write `out/…` and keep the input.
- **Anything longer than a few seconds runs in the background:** call `bash` with
  `run_in_background: true` and follow it with `job_output` (a foreground command that
  outlives its time limit moves to the background by itself; `job_output` follows it
  too). Run it with `nice -n 10 ffmpeg …` so the server stays responsive.
- **Always `-v error`** (or `-hide_banner -loglevel warning`): ffmpeg's normal output is
  thousands of lines.
- **`-n`** refuses to overwrite; **`-y`** only on a file you made in this task.
- Check the result with `ffprobe` before you say it is done, then send it with
  `send_file` (a chat takes 50 MB; a bigger file goes as a download link by itself).

## Recipes

| Need | Command |
|---|---|
| Cut, no re-encode (fast; cuts on keyframes) | `ffmpeg -v error -ss 00:01:00 -i in.mp4 -t 30 -c copy out/cut.mp4` |
| Cut, exact | `ffmpeg -v error -ss 00:01:00 -i in.mp4 -t 30 -c:v libx264 -crf 20 -preset veryfast -c:a aac out/cut.mp4` |
| Join files of the same format | write `list.txt` with lines `file 'a.mp4'`, then `ffmpeg -v error -f concat -safe 0 -i list.txt -c copy out/joined.mp4` |
| Extract the audio | `ffmpeg -v error -i in.mp4 -vn -c:a libmp3lame -q:a 2 out/audio.mp3` |
| Normalize loudness (speech, -16 LUFS) | `ffmpeg -v error -i in.wav -af loudnorm=I=-16:TP=-1.5:LRA=11 out/norm.wav` |
| A thumbnail at 3 s | `ffmpeg -v error -ss 3 -i in.mp4 -frames:v 1 -q:v 2 out/thumb.jpg` |
| A GIF, 10 fps, 480 wide | `ffmpeg -v error -i in.mp4 -vf "fps=10,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" out/clip.gif` |
| Compress for the web or a chat | `ffmpeg -v error -i in.mp4 -c:v libx264 -crf 28 -preset slow -vf "scale='min(1280,iw)':-2" -c:a aac -b:a 96k -movflags +faststart out/small.mp4` |
| Fit a size (e.g. 45 MB) | bitrate = 45 × 8192 / duration in s − 96 (kbit/s), then `-c:v libx264 -b:v <rate>k -pass 1 -an -f null /dev/null` and `-pass 2 -c:a aac -b:a 96k out/fit.mp4` |
| Burn subtitles | `ffmpeg -v error -i in.mp4 -vf subtitles=subs.srt -c:a copy out/subbed.mp4` |
| Vertical 1080×1920 from 16:9 | `ffmpeg -v error -i in.mp4 -vf "crop=ih*9/16:ih,scale=1080:1920" -c:a copy out/vertical.mp4` |
| Speed up 2× | `ffmpeg -v error -i in.mp4 -vf setpts=0.5*PTS -af atempo=2.0 out/fast.mp4` |
| Images to a video, 1 per 3 s | `ffmpeg -v error -framerate 1/3 -i img%03d.jpg -c:v libx264 -r 30 -pix_fmt yuv420p out/slides.mp4` |
| Audio over a still image | `ffmpeg -v error -loop 1 -i cover.jpg -i audio.mp3 -c:v libx264 -tune stillimage -c:a aac -shortest -pix_fmt yuv420p out/video.mp4` |

`libx264`, `libx265`, `libvpx` (VP9), `libaom` (AV1), `libmp3lame`, `libopus`,
`libvorbis`, `libass` (subtitles) and `libwebp` are in this build. `ffmpeg -encoders`
lists them all.
