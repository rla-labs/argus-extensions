#!/bin/sh
# Run by Argus's extension test (`pnpm test:docker-extensions`) in a project's folder,
# confined, as the project's own shell runs officecli. Fails on the first error.
set -eu

officecli create report.docx
officecli add report.docx /body --type paragraph --prop text="Raport săptămâna 42" --prop style=Heading1
officecli add report.docx /body --type paragraph --prop text="Vânzările au crescut cu 12%."
officecli create data.xlsx
officecli set data.xlsx /Sheet1/B2 --prop value=100
officecli set data.xlsx /Sheet1/B3 --prop value=250
officecli set data.xlsx /Sheet1/B4 --prop formula="SUM(B2:B3)"
officecli create deck.pptx
officecli add deck.pptx / --type slide --prop title="Argus"
for file in report.docx data.xlsx deck.pptx; do
  officecli close "$file" >/dev/null 2>&1 || true
  officecli validate "$file"
done
# An existing document, edited in place.
officecli add report.docx /body --type paragraph --prop text="Adăugat după."
officecli close report.docx >/dev/null 2>&1 || true
officecli view report.docx text | grep -q "Adăugat după."
officecli view report.docx html >/dev/null
echo "office smoke: ok"
