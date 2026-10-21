---
name: pdf
description: |
  Work with PDF files: read their text, see their pages and metadata, merge, split, keep
  or delete pages, rotate, render pages to PNG, compress, protect with a password or
  remove it, set the title and author. Use pdftool; for anything else, a short Python
  script with pdf-python (pikepdf, pypdf, pypdfium2, Pillow).
---

# PDF

`pdftool` and `pdf-python` are installed. They run in your folder like any command.
Pages are numbered from 1: `1-3,5,9-` is pages 1 to 3, 5, and 9 to the end. Every command
writes a new file (`-o`); it never replaces the file it reads.

## pdftool

```sh
pdftool info report.pdf                        # pages, size, version, encryption, metadata
pdftool text report.pdf --pages 1-2            # the text, to the terminal
pdftool text report.pdf -o report.txt          # all of it, to a file
pdftool merge a.pdf b.pdf c.pdf -o all.pdf     # in this order
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

## pdf-python, for anything else

For a form, an annotation, a page's crop box, images inside a PDF, a watermark from
another PDF: write a short script in your folder and run it with `pdf-python`.

```sh
pdf-python scripts/stamp.py
```

```python
import pikepdf                      # structure: pages, objects, crop, overlays
from pypdf import PdfReader         # forms: PdfReader("f.pdf").get_fields()
import pypdfium2 as pdfium          # render and text: pdfium.PdfDocument("f.pdf")[0]

with pikepdf.open("in.pdf") as pdf, pikepdf.open("stamp.pdf") as stamp:
    for page in pdf.pages:
        page.add_overlay(stamp.pages[0])        # a watermark on every page
    pdf.save("stamped.pdf")
```

Never install a package (`pip` is not there); never write a PDF by hand. To make a new
document from text, write a Word file with the `office` extension and ask the user to
export it, or keep it as `.docx`.
