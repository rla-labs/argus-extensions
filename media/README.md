# Argus extension: media

Audio and video for [Argus](https://github.com/rla-labs/argus) projects: static
`ffmpeg` and `ffprobe` 7.0.2, and a skill with the recipes an agent needs.

```
/ext install https://github.com/rla-labs/argus-extensions#media
/ext enable <project> media
```

A project that enables it can run `ffmpeg` and `ffprobe` in its shell, confined to its
folder like any other command. `/ext enable` offers the rule `ffprobe *` (it only
reads); `ffmpeg` keeps asking unless you allow it (`/rule <project> ffmpeg *`).

## What it installs

`fetch.sh` downloads John Van Sickle's static builds of ffmpeg 7.0.2, as
[eugeneware/ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) `b6.1.1`
publishes them, for the machine (x64 or arm64), and checks each against the sha-256
recorded in the script. A mismatch installs nothing.

| | |
|---|---|
| Size | about 160 MB (x64) |
| Network at run time | none |
| Secrets | none |

**A long render ties up the server's CPU.** The skill runs renders as background jobs,
with `nice`.

## Licenses

The ffmpeg builds are GPL v3 (`third-party/ffmpeg/`). This repository does not contain
them: the admin's install downloads them from their publisher. The rest of this
repository is under the same license as Argus (`LICENSE.md`).
