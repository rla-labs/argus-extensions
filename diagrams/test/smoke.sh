#!/bin/sh
# Run by Argus's extension test (`pnpm test:docker-extensions`) in a project's folder,
# confined, as the project's own shell runs the renderer. Fails on the first error.
set -eu

mkdir -p d
printf 'flowchart LR\n  A[Start] --> B{Ready?}\n  B -->|yes| C[Ship ăîșț]\n  B -->|no| A\n' > d/flow.mmd
printf 'sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi\n' > d/seq.mmd
render-mermaid -i d/flow.mmd -o d/flow.svg -t github-light >/dev/null
render-mermaid -i d/flow.mmd -o d/flow.png -f png --width 1200 -t github-light >/dev/null
render-mermaid -i d/flow.mmd -f ascii > d/flow.txt
batch-mermaid -i d -o d/out -f svg >/dev/null
list-mermaid-themes | grep -q tokyo-night
head -c 4 d/flow.svg | grep -q '<svg'
# A PNG with its text: a blank one (no font) is about 5 KB at 800px, one with text far more.
test "$(wc -c < d/flow.png)" -gt 12000
grep -q 'Ship' d/flow.txt
test -s d/out/seq.svg
echo "diagrams smoke: ok"
