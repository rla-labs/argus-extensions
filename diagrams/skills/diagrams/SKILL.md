---
name: diagrams
description: |
  Draw diagrams: write Mermaid (flowchart, sequence, state, class, ER, XY chart) in a
  .mmd file and render it to SVG, PNG or terminal text with render-mermaid, in 15
  themes, without a browser. Use it for architecture, processes, data models, timelines
  of messages, charts, or when the user gives Mermaid code.
---

# Diagrams

`render-mermaid`, `batch-mermaid` and `list-mermaid-themes` are installed (Pretty Mermaid,
on `beautiful-mermaid` and resvg). They run in your folder like any command.

## Workflow

1. Pick the diagram type from the table; write the source to a `.mmd` file in your folder
   (e.g. `diagrams/flow.mmd`), keeping the user's own terms.
2. Render it: SVG for documents and slides, PNG for a chat or an Office file.
3. Check the result: the command succeeded, the file is not empty. Fix a parse error by
   reducing the diagram to the failing line, then rebuild it.
4. Give the user the paths (source and image); `present` the image when they should see it.

Never overwrite a file the user gave you; write a new one.

| Need | Type | First line |
|---|---|---|
| Process, decision, architecture | Flowchart | `flowchart LR` (wide) or `flowchart TB` (tall) |
| Calls, messages between parts | Sequence | `sequenceDiagram` |
| A lifecycle, states | State | `stateDiagram-v2` |
| Classes, modules | Class | `classDiagram` |
| Tables and their relations | ER | `erDiagram` |
| Bars, lines, trends | XY chart | `xychart-beta` |

The syntax of each, with examples: `DIAGRAM_TYPES.md` next to this file. Read it before a
non-trivial diagram.

## Commands

```sh
render-mermaid -i diagrams/flow.mmd -o diagrams/flow.svg -t github-light
render-mermaid -i diagrams/flow.mmd -o diagrams/flow.png -f png --width 1600 -t github-light
render-mermaid -i diagrams/flow.mmd -f ascii           # text, to the terminal
batch-mermaid -i diagrams -o diagrams/out -f svg -t zinc-light
list-mermaid-themes
```

- `-f svg|png|ascii` (default svg); `--width <px>` for PNG (100–10000, default 800).
- `-t <theme>`: `github-light`, `zinc-light` (print, slides), `github-dark`,
  `tokyo-night`, `dracula`, `nord`, `nord-light`, … (`list-mermaid-themes`; `THEMES.md`).
- Colors: `--bg`, `--fg`, `--line`, `--accent`, `--muted`, `--surface`, `--border` (hex).
- `--transparent` for a transparent background (SVG, PNG).
- Crowded? `--node-spacing`, `--layer-spacing`, `--component-spacing` (SVG and PNG).

## Good diagrams

- Short labels; a label on every branch that is not obvious.
- Split a large diagram into several rather than shrinking it.
- A light theme for anything printed or put in a document.
- Meaning never by color alone.
- In a Word or PowerPoint file (the `office` extension), insert the PNG at
  `--width 1600` or more, so it stays sharp.
