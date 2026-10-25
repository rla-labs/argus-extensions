---
name: pdf
description: |
  Work with PDF files: read their text, see their pages and metadata, make a PDF from
  HTML or Markdown, merge, split, keep or delete pages, rotate, render pages to PNG,
  compress, protect with a password or remove it, set the title and author. Use pdftool;
  for anything else, qpdf.
---

# PDF

`pdftool` and `qpdf` are installed. They run in your folder like any command. Pages are
numbered from 1: `1-3,5,9-` is pages 1 to 3, 5, and 9 to the end. Every command writes a
new file (`-o`); it never replaces the file it reads.

## pdftool

```sh
pdftool info report.pdf                        # pages, size, version, encryption, metadata
pdftool text report.pdf --pages 1-2            # the text, to the terminal
pdftool text report.pdf -o report.txt          # all of it, to a file
pdftool merge a.pdf b.pdf c.pdf -o all.pdf     # in this order; a.pdf's bookmarks are kept
pdftool split report.pdf -o pages/             # one file per page
pdftool split report.pdf --every 10 -o parts/  # 10 pages per file
pdftool pages report.pdf --keep 1-3,7 -o short.pdf
pdftool pages report.pdf --delete 2 -o fixed.pdf
pdftool rotate scan.pdf --degrees 90 --pages 2-4 -o scan-upright.pdf
pdftool to-png report.pdf --pages 1 --dpi 150 -o png/   # png/report-1.png
pdftool compress big.pdf -o smaller.pdf        # streams and unused objects; images kept
pdftool encrypt report.pdf --password '…' -o locked.pdf
pdftool decrypt locked.pdf --password '…' -o open.pdf
pdftool metadata report.pdf                    # show title, author, subject, keywords
pdftool metadata report.pdf --set title='Q3 report' author='Acme' -o titled.pdf
```

An encrypted input takes `--password` on every command. A scanned PDF has no text:
`text` returns empty pages; say so to the user (OCR is not installed).

## Making a PDF: from-html, from-md

Write the document as HTML (with CSS) or Markdown in your folder, then convert it:

```sh
pdftool from-md report.md -o report.pdf
pdftool from-html report.html -o report.pdf --page-size a4    # or letter, legal; --landscape
```

- Headings (`#`, `<h1>`…`<h6>`) become the PDF's bookmarks; diacritics are kept.
- Images: a path relative to the input file, in its folder or below (`img/logo.png`),
  or a `data:` image; PNG, JPEG and SVG. A remote image (`https://…`) is never fetched,
  and a path outside the folder (`../`, `/…`) is not read: both are left out, and
  `pdftool` lists them. Download an image first if you need it.
- Page size and margins in HTML: CSS `@page { size: A4; margin: 20mm }`.
- Markdown tables have no borders; write HTML with CSS when they need them.
- Check the result: `pdftool to-png report.pdf --pages 1 -o png/` and look at it.

## qpdf, for anything else

For what pdftool does not do (attachments, linearizing for the web, overlaying one PDF
on another, page labels, inspecting objects), use `qpdf`; `qpdf --help=all` lists
everything.

```sh
qpdf in.pdf --overlay stamp.pdf -- stamped.pdf   # a watermark on every page
qpdf --linearize in.pdf web.pdf                  # fast web view
qpdf --json --json-key=outlines in.pdf           # the bookmarks
```

Never install a package and never write a PDF by hand: make it from HTML or Markdown.
