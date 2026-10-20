---
name: office
description: Create, read, check and edit Word, Excel and PowerPoint files (.docx, .xlsx, .pptx) with officecli. Use for any Office document, new or existing.
---

# Office documents with officecli

`officecli` is installed in your shell. It reads and writes `.docx`, `.xlsx` and `.pptx`
from the command line, with JSON output (`--json`). Never write an Office file by hand
or with a script, and never install anything: everything below is already there.

## How to work

1. **Ask officecli, do not guess.** `officecli help docx paragraph`, `officecli help xlsx
   cell`, `officecli help pptx shape` list the properties and give examples.
2. **Create or open, then edit.** `officecli create report.docx`, then `add`, `set`,
   `remove`, `move`. For many edits at once, `officecli batch <file> --input edits.json`.
3. **Read what is there before changing it:** `officecli view <file> outline`, `view
   <file> text`, `get <file> <path> --json`, `query <file> <selector>`.
4. **Check the result:** `officecli validate <file>` and `officecli view <file> issues`.
   For a look at the layout, `officecli view <file> html` writes an HTML snapshot you
   can read. Screenshots (`view screenshot`) need a browser, which is not installed.
5. **Finish with `officecli close <file>`**, then send it with `send_file`.

Paths are 1-based (`'/body/p[3]'` is the third paragraph); quote them in the shell.

## Not available here

- `view screenshot`, `view pdf` and PDF export: no browser or exporter plugin.
- `watch`: it serves a page on this machine that nobody can open.
- `officecli install`, `officecli mcp …`, updates: the binary is pinned by the admin.

## The full reference

`officecli-reference.md`, in this skill's folder, is OfficeCLI's own guide: every
command, the L1/L2/L3 strategy, raw XML for what the DOM commands cannot do, pivot
tables, find and replace, and the common pitfalls. Read it before a large or unusual
document.
