# Argus extension: diagrams

Diagrams for [Argus](https://github.com/rla-labs/argus) projects: Mermaid source rendered
to SVG, PNG or terminal text with [Pretty Mermaid](https://github.com/imxv/Pretty-mermaid-skills)
(on `beautiful-mermaid` and resvg), in 15 themes, with no browser.

```
/ext install https://github.com/rla-labs/argus-extensions#diagrams
/ext enable <project> diagrams
```

A project that enables it can run `render-mermaid`, `batch-mermaid` and
`list-mermaid-themes` in its shell, confined to its folder like any other command.
`/ext enable` offers the rules `render-mermaid *` and `list-mermaid-themes *`.

> Draw the architecture in `docs/architecture.md` as a diagram, PNG for the slides.

## What it installs

`fetch.sh` downloads Pretty Mermaid at a pinned commit and checks the tarball against the
sha-256 recorded in the script; `npm ci` then installs its two dependencies from its
lockfile, each checked by its integrity hash, without install scripts. It also downloads
the Inter font (4.1, sha-256 checked), which PNGs are drawn with: a server usually has no
font resvg can use, and a PNG would have no text.

| | |
|---|---|
| Size | about 22 MB |
| Needs | `node` and `npm` (Argus has them), Linux x64 or arm64 |
| Network at run time | none |
| Secrets | none |

## Licenses

Pretty Mermaid is MIT (`third-party/pretty-mermaid/`); Inter is under the SIL Open Font
License 1.1 (`third-party/inter/`). This repository does not contain them: the admin's
install downloads them from their publishers. The rest is under the same license as
Argus (`LICENSE.md`).
