#!/bin/sh
# Run by Argus's extension test (`pnpm test:docker-extensions`) in a project's folder,
# confined, as the project's own shell runs pdftool. Fails on the first error.
set -eu

mkdir -p p
# An image for the document, made by pdftool itself: a page rendered as PNG.
printf '<p>seed</p>' > p/seed.html
pdftool from-html p/seed.html -o p/seed.pdf >/dev/null
pdftool to-png p/seed.pdf --dpi 36 -o p/img >/dev/null
mv p/img/seed-1.png p/img/dot.png
# A Romanian document with headings and the image, made into a PDF.
cat > p/doc.html <<'HTML'
<!doctype html><html><head><meta charset="utf-8"><style>h1{page-break-before:always}</style></head><body>
<h1>Știri și țări</h1><p>Pagina întâi: ăâîșț.</p><img src="img/dot.png" width="20">
<h1>Secțiunea a doua</h1><p>Argus page 2</p><img src="https://example.com/remote.png">
<h1>Încheiere</h1><p>Argus page 3</p>
</body></html>
HTML
pdftool from-html p/doc.html -o p/in.pdf > p/made.txt
grep -q '3 page(s)' p/made.txt
grep -q 'left out 1 image(s).*example.com' p/made.txt
qpdf --json --json-key=outlines p/in.pdf > p/outline.json
grep -q 'Știri și țări' p/outline.json
grep -q 'Încheiere' p/outline.json
qpdf --json=2 --json-key=qpdf p/in.pdf | grep -q '"/Subtype": "/Image"'
printf '# Raport\n\nȘedință și țintă.\n\n![dot](img/dot.png)\n' > p/doc.md
pdftool from-md p/doc.md -o p/md.pdf >/dev/null
pdftool text p/md.pdf | grep -q 'Ședință și țintă'

pdftool info p/in.pdf | grep -q 'pages: 3'
pdftool text p/in.pdf --pages 2 | grep -q 'Argus page 2'
pdftool text p/in.pdf --pages 1 | grep -q 'Pagina întâi: ăâîșț'
pdftool merge p/in.pdf p/in.pdf -o p/merged.pdf >/dev/null
pdftool info p/merged.pdf | grep -q 'pages: 6'
qpdf --json --json-key=outlines p/merged.pdf | grep -q 'Știri și țări'
pdftool split p/in.pdf -o p/split >/dev/null
test -s p/split/in-3.pdf
pdftool pages p/merged.pdf --delete 1-3 -o p/last.pdf >/dev/null
pdftool info p/last.pdf | grep -q 'pages: 3'
pdftool pages p/in.pdf --keep 3,1 -o p/order.pdf >/dev/null
pdftool text p/order.pdf --pages 1 | grep -q 'Argus page 3'
pdftool rotate p/in.pdf --pages 1 -o p/rotated.pdf >/dev/null
qpdf --json=2 --json-key=qpdf p/rotated.pdf | grep -q '"/Rotate": 90'
pdftool to-png p/in.pdf --pages 1 --dpi 72 -o p/png >/dev/null
test "$(head -c 4 p/png/in-1.png | tail -c 3)" = PNG
pdftool encrypt p/in.pdf --password s3cret -o p/locked.pdf >/dev/null
pdftool info p/locked.pdf 2>/dev/null && { echo "an encrypted PDF opened without its password" >&2; exit 1; }
pdftool info p/locked.pdf --password s3cret | grep -q 'encrypted: yes'
pdftool decrypt p/locked.pdf --password s3cret -o p/open.pdf >/dev/null
pdftool info p/open.pdf | grep -q 'encrypted: no'
pdftool metadata p/in.pdf --set title='Raport: Știri' author=Argus -o p/meta.pdf >/dev/null
pdftool metadata p/meta.pdf | grep -q 'title: Raport: Știri'
pdftool compress p/merged.pdf -o p/small.pdf >/dev/null
pdftool info p/small.pdf | grep -q 'pages: 6'
pdftool merge p/in.pdf p/in.pdf -o p/in.pdf 2>/dev/null && { echo "an output replaced its input" >&2; exit 1; }
echo "pdf smoke: ok"
