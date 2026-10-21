# Argus extension: pdf

PDFs for [Argus](https://github.com/rla-labs/argus) projects: `pdftool`, one command for
the everyday operations, and `pdf-python`, a private Python 3.12 with
[pikepdf](https://github.com/pikepdf/pikepdf), [pypdf](https://github.com/py-pdf/pypdf),
[pypdfium2](https://github.com/pypdfium2-team/pypdfium2) and Pillow for anything else.

```
/ext install https://github.com/rla-labs/argus-extensions#pdf
/ext enable <project> pdf
```

A project that enables it can run `pdftool` and `pdf-python` in its shell, confined to
its folder like any other command. `/ext enable` offers the rules `pdftool info *` and
`pdftool text *` (they only read); the commands that write a file keep asking unless you
allow them.

`pdftool` reads, merges, splits, keeps or deletes pages, rotates, renders pages to PNG,
compresses, encrypts and decrypts, and sets the title and author. An output never
replaces an input.

> Merge the three invoices in `inbox/` into one PDF and send me page 1 as an image.

## What it installs

`fetch.sh` downloads [uv](https://github.com/astral-sh/uv) 0.13.1 (sha-256 checked), which
installs Python 3.12.12 (a python-build-standalone build, checked by uv against its own
hashes) into the extension's folder, then the packages of `requirements.txt`, by version
and hash, as wheels only. uv is then removed. Nothing is installed on the system.

| | |
|---|---|
| Size | about 150 MB |
| Needs | Linux x64 or arm64 |
| Network at run time | none |
| Secrets | none |

No OCR: a scanned PDF has no text to read.

## Licenses

pikepdf and qpdf (MPL-2.0, Apache-2.0), pypdf (BSD-3-Clause), pypdfium2 and PDFium
(Apache-2.0, BSD-3-Clause), Pillow (MIT-CMU), lxml (BSD-3-Clause), Python (PSF), uv
(MIT/Apache-2.0). This repository does not contain them: the admin's install downloads
them from their publishers. The rest is under the same license as Argus (`LICENSE.md`).
