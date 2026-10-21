# Argus extensions

First-party extensions for [**Argus Agent**](https://github.com/rla-labs/argus), the
self-hosted system for long-running AI agents. An extension gives a project's agent
programs it can run from its shell and a skill that teaches it how to use them,
installed once by the admin and enabled per project.

| Extension | What a project's agent can do with it | Programs | Size |
|---|---|---|---|
| [**office**](office/) | Create, read, check and edit Word, Excel and PowerPoint files, existing documents included: reports, invoices, spreadsheets with formulas and charts, slide decks | `officecli` ([OfficeCLI](https://github.com/iOfficeAI/OfficeCLI) 1.0.158) | ~35 MB |
| [**media**](media/) | Cut, join, convert and compress audio and video; extract audio, thumbnails, GIFs and subtitles; inspect any media file | `ffmpeg`, `ffprobe` 7.0.2 (static) | ~160 MB |
| [**diagrams**](diagrams/) | Flowcharts, sequence, state, class and ER diagrams and XY charts, from Mermaid to SVG, PNG or text, in 15 themes, with no browser | `render-mermaid`, `batch-mermaid`, `list-mermaid-themes` ([Pretty Mermaid](https://github.com/imxv/Pretty-mermaid-skills)) | ~22 MB |
| [**pdf**](pdf/) | Read a PDF's text and pages, merge, split, keep or delete pages, rotate, render pages to PNG, compress, protect with a password; any other operation in a short Python script | `pdftool`, `pdf-python` (pikepdf, pypdf, pypdfium2 on a private Python 3.12) | ~150 MB |
| [**images**](images/) | Resize, crop, convert (JPEG, PNG, WebP, AVIF, HEIC, TIFF, GIF), compress for the web, watermark, contact sheets, whole folders | `magick` ([ImageMagick](https://imagemagick.org) 7.1.2), **x64 only** | ~77 MB |

Each needs **Argus 0.7.0 or later**, on Linux x64 or arm64 (`images`: x64 only), with the command sandbox
(Landlock) available; `argus doctor` says whether it is.

## Install

From Telegram or the web chat, as the admin:

```
/ext install https://github.com/rla-labs/argus-extensions#office
/ext enable <project> office
```

`#office` names the extension's folder in this repository; use `#media`, `#diagrams`, …
for the others.
Argus shows what the extension brings and asks before anything runs. After
`/ext enable`, the project's next conversation has the programs and the skill
(`/reset <project>` starts one now).

`/ext enable` also offers the extension's suggested approval rules as buttons
(`officecli *`, `ffprobe *`). Until you press one, every run of the program asks first,
like any other command.

Then just ask the project for what you need:

> Turn `inbox/sales.csv` into an Excel file with a total row and a chart per region.

> Cut the first 30 seconds of `inbox/talk.mp4`, compress it under 50 MB and make a thumbnail.

### Pinning a version

```
/ext install https://github.com/rla-labs/argus-extensions#office@v1.0.0
/ext update office            # the same source and ref again
/ext update office@v1.1.0     # another tag
/ext remove office
```

Without `@`, an extension follows `main`. Tags (`v1.0.0`, …) cover the whole
repository, and each extension records its own `version` in its `extension.yaml`.

## How they stay safe

- **Pinned and checked.** Each extension downloads its program at install from its
  publisher, at one fixed version, and checks it against a sha-256 recorded in its
  `fetch.sh`. A mismatch installs nothing.
- **Installed confined.** The install runs in Argus's command sandbox. It can write only
  in the extension's own folder, and cannot read the database, the keys or any project.
- **Read-only and hashed.** Argus installs the extension read-only and records a hash of
  every file. It checks that hash at every start, and an extension that changed is not
  used.
- **Per project.** Only a project that enabled an extension can run its programs, and
  they are confined to that project's folder like any other command. Other projects
  cannot run them, not even by their path.
- **Offline at run time.** No program needs the network or any secret once it is
  installed.

## Limits

- **office:** no screenshots or PDF export yet, because both need a browser.
- **pdf:** no OCR; a scanned PDF has no text to read.
- **images:** x64 only.
- **media:** a long render keeps the server's CPU busy. The skill runs renders as
  background jobs, with `nice`.

## Writing your own

An extension is a folder with an `extension.yaml`: programs (`bin`), skills, MCP
servers, install commands and instructions. It can live at the root of its own
repository or, like these, in a folder of a shared one (`<repository>#<folder>`). See
[Extensions](https://github.com/rla-labs/argus/blob/main/docs/user/extensions.md) in the
Argus docs for the full format. Each extension here also has a `test/smoke.sh`, which
Argus's own tests run in a real project's shell.

To update a program: change its version and hashes in `fetch.sh`, raise `version` in
`extension.yaml`, tag the repository, and run `/ext update <name>`.

## Licenses

- **OfficeCLI** and the guide adapted from it are Apache-2.0. See
  [`office/third-party/officecli/`](office/third-party/officecli/).
- **The ffmpeg builds** are GPL v3. This repository does not contain them: each
  admin's install downloads them from their publisher. See
  [`media/third-party/ffmpeg/`](media/third-party/ffmpeg/).
- **The PDF libraries** (pikepdf, pypdf, pypdfium2, Pillow) and Python are under their
  own open-source licenses, listed in [`pdf/README.md`](pdf/README.md).
- **ImageMagick** is under the ImageMagick License; see
  [`images/third-party/`](images/third-party/).
- **Pretty Mermaid** is MIT and **Inter** is under the SIL Open Font License 1.1; see
  [`diagrams/third-party/`](diagrams/third-party/).
- **Everything else** is under the same license as Argus ([`LICENSE.md`](LICENSE.md)).
