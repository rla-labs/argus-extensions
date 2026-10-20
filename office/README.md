# Argus extension: office

Word, Excel and PowerPoint for [Argus](https://github.com/rla-labs/argus) projects, with
[OfficeCLI](https://github.com/iOfficeAI/OfficeCLI) 1.0.158.

```
/ext install https://github.com/rla-labs/argus-extensions#office
/ext enable <project> office
```

A project that enables it can run `officecli` in its shell, confined to its folder like
any other command, and has the `office` skill. `/ext enable` offers the rule
`officecli *`, which lets it run unasked.

## What it installs

`fetch.sh` downloads OfficeCLI's Linux build for the machine (x64 or arm64) from its
GitHub release and checks it against the sha-256 recorded in the script, from the
release's `SHA256SUMS`. A mismatch installs nothing. Nothing else is downloaded, and
nothing runs at install but that script, in Argus's command sandbox.

| | |
|---|---|
| Size | about 35 MB |
| Network at run time | none (`OFFICECLI_SKIP_UPDATE=1`) |
| Secrets | none |
| Not available | screenshots and PDF (they need a browser); `watch` |

## Updating OfficeCLI

Change `VERSION` and the two hashes in `fetch.sh` (from the new release's `SHA256SUMS`),
check `skills/office/officecli-reference.md` against the new `SKILL.md`, raise
`version` in `extension.yaml`, tag it, and `/ext update office`.

## Licenses

OfficeCLI and its guide (`skills/office/officecli-reference.md`, adapted) are
Apache-2.0, © 2026 OfficeCLI: see `third-party/officecli/`. The rest of this repository
is under the same license as Argus (`LICENSE.md`).
