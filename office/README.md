# Argus extension: office

Word, Excel and PowerPoint for [Argus](https://github.com/rla-labs/argus) projects, with
[OfficeCLI](https://github.com/iOfficeAI/OfficeCLI) 1.0.158.

```
/ext install https://github.com/rla-labs/argus-extensions#office
/ext enable <project> office
```

A project that enables it can run `officecli` and `office-pdf` in its shell, confined to
its folder like any other command, and has the `office` skill. `/ext enable` offers the
rules `officecli *` and `office-pdf *`, which let them run unasked. `officecli view …
screenshot` renders pages as PNG, so the agent can check the layout it made.

## What it installs

`fetch.sh` downloads OfficeCLI's Linux build for the machine (x64 or arm64) from its
GitHub release and checks it against the sha-256 recorded in the script, from the
release's `SHA256SUMS`; then Chrome Headless Shell 155.0.8059.12 from Playwright's CDN,
checked the same way, and `extract-zip` from the lockfile to unpack it. A mismatch
installs nothing. Nothing runs at install but that script, in Argus's command sandbox.

`bin/google-chrome` is that headless Chrome under the name OfficeCLI looks for;
`office-pdf` prints OfficeCLI's HTML preview to PDF with it. That PDF follows the
preview's layout, not Word's or PowerPoint's own export.

| | |
|---|---|
| Size | about 320 MB (OfficeCLI 35 MB, Chrome Headless Shell 280 MB) |
| Network at run time | none (`OFFICECLI_SKIP_UPDATE=1`) |
| Secrets | none |
| System libraries | Chromium's, for screenshots and PDF; the Argus Docker image has them |
| Not available | OfficeCLI's own PDF exporter plugin (`office-pdf` instead); `watch` |

## Updating OfficeCLI

Change `VERSION` and the two hashes in `fetch.sh` (from the new release's `SHA256SUMS`),
check `skills/office/officecli-reference.md` against the new `SKILL.md`, raise
`version` in `extension.yaml`, tag it, and `/ext update office`.

## Licenses

OfficeCLI and its guide (`skills/office/officecli-reference.md`, adapted) are
Apache-2.0, © 2026 OfficeCLI: see `third-party/officecli/`. extract-zip: BSD-2-Clause
(`third-party/extract-zip/LICENSE`). Chrome Headless Shell: Chromium's licenses,
installed with it as `chromium/LICENSE.headless_shell`. The rest of this repository is
under the same license as Argus (`LICENSE.md`).
