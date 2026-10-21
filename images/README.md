# Argus extension: images

Images for [Argus](https://github.com/rla-labs/argus) projects:
[ImageMagick](https://imagemagick.org) 7.1.2 under a restrictive security policy, and a
skill with the recipes an agent needs (resize, crop, convert, compress for the web,
watermark, contact sheets, whole folders).

```
/ext install https://github.com/rla-labs/argus-extensions#images
/ext enable <project> images
```

A project that enables it can run `magick` in its shell, confined to its folder like any
other command. `/ext enable` offers the rule `magick identify *` (it only reads); the
commands that write keep asking unless you allow them (`/rule <project> magick *`).

> Make web versions of the photos in `inbox/`, at most 1600 px, with our logo in a corner.

## What it installs

`fetch.sh` downloads ImageMagick's official Linux build (7.1.2-34, the x86_64 AppImage),
checks it against the sha-256 recorded in the script, and unpacks it without FUSE. A
mismatch installs nothing.

| | |
|---|---|
| Size | about 77 MB |
| Needs | **Linux x64 only**: ImageMagick publishes no Linux arm64 build. And five system libraries, which the Argus image has: `libx11-6 libfontconfig1 libfreetype6 libharfbuzz0b libfribidi0`, plus `fonts-dejavu-core` for text. On a native install without them, `/ext install` says what to install. |
| Network at run time | none |
| Secrets | none |

## The security policy

`etc/policy.xml` is the only policy ImageMagick reads (the build's own is removed):

- no delegates: ImageMagick never runs another program;
- refused: MVG and MSL (drawing and scripting), URL, HTTP(S), FTP, EPHEMERAL, TEXT, `@file`
  lists, and PostScript, PDF and XPS;
- at most 16,000 pixels a side, 128 megapixels, 512 MB of memory, 1 GB mapped, 2 GB of
  disk, 2 threads and 2 minutes for one command.

## Licenses

ImageMagick is under the ImageMagick License (`third-party/imagemagick/`), an
Apache-style license. This repository does not contain it: the admin's install downloads
it from its publisher. The rest is under the same license as Argus (`LICENSE.md`).
