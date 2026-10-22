# Argus extension: browser

A headless Chromium for [Argus](https://github.com/rla-labs/argus) projects, driven with
[Playwright MCP](https://github.com/microsoft/playwright-mcp) 0.0.83.

```
/ext install https://github.com/rla-labs/argus-extensions#browser
/ext enable <project> browser
```

A project that enables it has the `mcp__browser__…` tools and the `browser` skill: open
pages built by JavaScript, click, fill forms, read the page as an accessibility tree,
take screenshots and save pages as PDF, into the project's folder.

## What it installs

`fetch.sh` installs Playwright MCP and its dependencies with `npm ci` from the lockfile
(each package checked by its integrity hash, no install scripts), and Chrome Headless
Shell 155.0.8059.12 for the machine (x64 or arm64) from Playwright's CDN, checked
against the sha-256 recorded in the script. A mismatch installs nothing.

| | |
|---|---|
| Size | about 290 MB |
| System libraries | Chromium's; the Argus Docker image has them, a native install gets them with one `apt-get` line ([install-native](https://github.com/rla-labs/argus/blob/main/docs/user/install-native.md)) |
| Network at run time | the public internet only, through Argus's egress proxy |
| Secrets | none |
| Profile | in memory: no cookies or logins kept between sessions |

## How it is confined

- The server runs in Argus's command sandbox: it reads the system and this folder,
  writes the project's folder and a home of its own, and cannot read the database, the
  keys or another project. Chromium runs with `--no-sandbox` (Docker blocks its own) and
  under that same sandbox.
- Every request goes through Argus's egress proxy (`${ARGUS_EGRESS_PROXY}`), loopback
  included: the server, the private network, link-local addresses and the cloud's
  metadata service are refused, after resolving the name. WebRTC may use proxied UDP
  only; DNS prefetching is off.
- `file://` URLs are refused by Playwright.
- Tool rules (`extension.yaml`, `tools:`): reading the page runs unasked; navigating,
  clicking, typing, saving a PDF ask; running code in the page and uploading files are
  refused. A project changes any of them with `/set <project> mcp.browser.tools.<tool> <value>`.

## Updating

Bump `@playwright/mcp` in `package.json`, regenerate `package-lock.json`
(`npm install --package-lock-only`), read the headless shell's version and revision in
`node_modules/playwright-core/browsers.json`, and record the two zips' sha-256 in
`fetch.sh`. `test/smoke.mjs` fails when a tool `extension.yaml` names is gone.

## Licenses

Playwright MCP and Playwright: Apache-2.0 (`third-party/playwright/LICENSE`).
extract-zip: BSD-2-Clause (`third-party/extract-zip/LICENSE`). Chrome Headless Shell:
Chromium's licenses, installed with it as `chromium/LICENSE.headless_shell`. This
folder's own files: `LICENSE.md`.
