# Argus extension: pdf

PDFs for [Argus](https://github.com/rla-labs/argus) projects: `pdftool`, one command for
the everyday operations and for making a PDF from HTML or Markdown, and
[qpdf](https://github.com/qpdf/qpdf) for anything else.

```
/ext install https://github.com/rla-labs/argus-extensions#pdf
/ext enable <project> pdf
```

A project that enables it can run `pdftool` and `qpdf` in its shell, confined to its
folder like any other command. `/ext enable` offers the rules `pdftool info *` and
`pdftool text *` (they only read); the commands that write a file keep asking unless you
allow them.

`pdftool` reads, merges, splits, keeps or deletes pages, rotates, renders pages to PNG,
compresses, encrypts and decrypts, and sets the title and author. `pdftool from-html` and
`pdftool from-md` make a PDF, with diacritics right in the text and in the bookmarks, and
images from the input's folder (a remote image is never fetched: it is left out, and
pdftool says so). An output never replaces an input.

> Make a one-page PDF report from `notes.md`, then merge it with the three invoices in
> `inbox/` and send me page 1 as an image.

## 2.0.0: what changed

- pdftool is a native program (Rust): each command takes milliseconds, and the
  extension is about 30 MB instead of 150.
- `from-html` and `from-md` are new.
- **`pdf-python` is gone**, with the Python packages it had. A script that used it needs
  rewriting with `pdftool` or `qpdf`.
- `pdftool`'s commands and arguments are the same as in 1.x. `metadata --set` writes the
  document information (what readers show); it no longer writes XMP metadata.

## What it installs

`fetch.sh` downloads one archive for the machine's architecture from this repository's
release `pdf-bin-2.0.0` and checks it against the sha-256 recorded in `fetch.sh`. The
archive is built by `build/build.sh` in this repository's CI, on glibc 2.28, from
sources pinned by version and sha-256:

- `bin/pdftool`, from `pdftool/` here; it reads and renders with PDFium, writes with
  qpdf and converts with ironpress;
- `bin/qpdf` 12.4.2, with its native crypto, zlib and libjpeg-turbo built in;
- `lib/libpdfium.so`, PDFium chromium/8111 from
  [bblanchon/pdfium-binaries](https://github.com/bblanchon/pdfium-binaries);
- `libexec/ironpress` 1.7.0, [ironpress](https://github.com/gastongouron/ironpress)
  with our fix for non-ASCII bookmark titles (`build/ironpress-outline.patch`, sent
  upstream as gastongouron/ironpress#277). Only pdftool runs it.

Nothing is installed on the system.

| | |
|---|---|
| Size | about 30 MB |
| Needs | Linux x64 or arm64 with glibc 2.28 or newer, as Argus's Docker image and every distribution it supports |
| Network at run time | none |
| Secrets | none |

No OCR: a scanned PDF has no text to read.

## Licenses

qpdf (Apache-2.0), zlib (Zlib), libjpeg-turbo (BSD-3-Clause, IJG), PDFium (BSD-3-Clause,
Apache-2.0, and the third-party licenses it lists), ironpress (MIT; its fonts OFL-1.1),
and pdftool's Rust crates (pdfium-render, image, png, serde_json, libc: MIT or
Apache-2.0). The release archive carries their license files in `licenses/`. The rest
is under the same license as Argus (`LICENSE.md`).
