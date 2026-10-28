# Argus extension: web

> **Experimental.** Not developed further: it is slow on heavy pages (20–40 s) and renders
> some pages wrong or not at all. For real browsing use [`browser`](../browser/)
> (Chromium); for plain pages the agent's `web_fetch` is faster.

A light headless browser for [Argus](https://github.com/rla-labs/argus) projects:
[Obscura](https://github.com/h4ckf0r0day/obscura) 0.2.5, its own engine with V8 for
JavaScript, no Chromium and no Node, driven through its MCP server.

```
/ext install https://github.com/rla-labs/argus-extensions#web
/ext enable <project> web
```

A project that enables it has the `mcp__web__…` tools and the `web` skill: read pages
built by JavaScript as Markdown, list their links, extract lists with CSS selectors,
fill forms and click, take screenshots and PDFs. Needs Argus 0.8.0 or later
(`network: proxy`).

## What it installs

`fetch.sh` downloads `obscura` and `obscura-worker` for the machine (x64 or arm64) from
this repository's release `web-bin-1.0.0`, checked against the sha-256 recorded in the
script. A mismatch installs nothing. They are built by `build/build.sh` in this
repository's CI (`.github/workflows/web-binaries.yml`) from Obscura's source at a pinned
tag and hash, with no stealth features; V8 is Deno's prebuilt static library
(rusty_v8 150.4.0), checked by its sha-256 before the build.

| | |
|---|---|
| Size | about 160 MB (72 MB download) |
| System libraries | glibc 2.35 or later; nothing else |
| Network at run time | the public internet only, through Argus's egress proxy |
| Secrets | none |
| Memory | up to ~600 MB on a heavy page |

## How it is confined

- The server runs in Argus's command sandbox: it reads the system and this folder,
  writes the project's folder and a home of its own, and cannot read the database, the
  keys or another project.
- `network: proxy`: its connections reach only Argus's egress proxy, held by the kernel
  (Landlock), and the proxy refuses the server, the private network, link-local addresses
  and the cloud's metadata service. Obscura refuses private addresses on its own as well,
  for a page, a redirect, or a request a page's script makes. Where Argus cannot hold the
  network (an old kernel; `argus doctor` warns), only Obscura's own refusal remains.
- Tool rules (`extension.yaml`, `tools:`): reading and navigating run unasked; clicking,
  typing and filling forms ask; running code in the page, cookies and saved sessions are
  refused. A project changes any of them with `/set <project> mcp.web.tools.<tool> <value>`.

## Where it falls short

Not Chromium: some pages do not render (TechCrunch's pages end on Meta's tracking pixel
instead), and sites that block automated browsers block it too. The skill tells the agent
to use the `browser` extension (a full Chromium) for such a page when the project has it.
Heavier pages are slow (20–40 s).

## Updating

Change the tag and its hash in `build/build.sh` (and the V8 archive's hashes if the
v8 crate moved), push a tag `web-bin-<n>`, and record the two archives' sha-256 from the
release in `fetch.sh`. `test/smoke.mjs` fails when a tool `extension.yaml` names is gone.

## Licenses

Obscura: Apache-2.0 (`licenses/obscura-LICENSE`, installed with it); every Rust crate
linked in, with its license, in `licenses/THIRD-PARTY.tsv`; V8: BSD-3-Clause. This
folder's own files: `LICENSE.md`.
