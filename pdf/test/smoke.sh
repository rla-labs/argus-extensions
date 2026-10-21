#!/bin/sh
# Run by Argus's extension test (`pnpm test:docker-extensions`) in a project's folder,
# confined, as the project's own shell runs pdftool. Fails on the first error.
set -eu

mkdir -p p
# A three-page PDF with text on each page, made with the extension's own Python.
pdf-python - <<'PY'
import pikepdf
pdf = pikepdf.new()
font = pdf.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.Font, Subtype=pikepdf.Name.Type1, BaseFont=pikepdf.Name.Helvetica))
for n in (1, 2, 3):
    page = pdf.add_blank_page(page_size=(595, 842))
    page.Resources = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=font))
    page.Contents = pdf.make_stream(f"BT /F1 24 Tf 72 720 Td (Argus page {n}) Tj ET".encode())
pdf.save("p/in.pdf")
PY
pdftool info p/in.pdf | grep -q 'pages: 3'
pdftool text p/in.pdf --pages 2 | grep -q 'Argus page 2'
pdftool merge p/in.pdf p/in.pdf -o p/merged.pdf >/dev/null
pdftool info p/merged.pdf | grep -q 'pages: 6'
pdftool split p/in.pdf -o p/split >/dev/null
test -s p/split/in-3.pdf
pdftool pages p/merged.pdf --delete 1-3 -o p/last.pdf >/dev/null
pdftool info p/last.pdf | grep -q 'pages: 3'
pdftool rotate p/in.pdf --pages 1 -o p/rotated.pdf >/dev/null
pdftool to-png p/in.pdf --pages 1 --dpi 72 -o p/png >/dev/null
test "$(head -c 4 p/png/in-1.png | tail -c 3)" = PNG
pdftool encrypt p/in.pdf --password s3cret -o p/locked.pdf >/dev/null
pdftool info p/locked.pdf 2>/dev/null && { echo "an encrypted PDF opened without its password" >&2; exit 1; }
pdftool decrypt p/locked.pdf --password s3cret -o p/open.pdf >/dev/null
pdftool metadata p/in.pdf --set title=Report author=Argus -o p/meta.pdf >/dev/null
pdftool metadata p/meta.pdf | grep -q 'title: Report'
pdftool compress p/merged.pdf -o p/small.pdf >/dev/null
pdftool merge p/in.pdf -o p/in.pdf 2>/dev/null && { echo "an output replaced its input" >&2; exit 1; }
echo "pdf smoke: ok"
