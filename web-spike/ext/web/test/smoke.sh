#!/bin/sh
# Spike only: Obscura confined as a project's program runs, in the real Argus image.
set -u
out() { printf '%s\n' "$*"; }
proxy=""
[ -n "${HTTPS_PROXY:-}" ] && proxy="--proxy ${HTTPS_PROXY}"
out "env proxy: ${HTTPS_PROXY:-none}; ARGUS_EGRESS_PROXY: ${ARGUS_EGRESS_PROXY:-none}"
obscura --version || { out "FAIL: obscura does not start"; exit 1; }
for url in https://example.com/ https://react.dev/ https://www.qbitai.com/; do
  start=$(date +%s)
  n=$(obscura ${proxy} fetch "${url}" --dump markdown --quiet 2>err.txt | wc -c)
  out "fetch ${url}: ${n} bytes of markdown, $(( $(date +%s) - start )) s; stderr: $(head -c 300 err.txt)"
done
out "eval: $(obscura ${proxy} fetch https://react.dev/ --eval 'document.querySelectorAll("a").length + " links, JS ok"' --quiet 2>&1 | tail -1)"
start=$(date +%s)
obscura ${proxy} scrape https://example.com/ https://news.ycombinator.com/ https://docs.python.org/3/ --concurrency 3 --eval document.title --format json --quiet > scrape.json 2>err.txt
out "scrape: exit $?, $(wc -c < scrape.json) bytes, $(( $(date +%s) - start )) s; $(head -c 300 scrape.json); stderr: $(head -c 300 err.txt)"
out "writes outside the project: $(obscura fetch https://example.com/ --dump text --quiet --output /tmp/../etc/obscura-test 2>&1 | head -c 200)"
out "home: $(ls -a "${HOME:-/nonexistent}" 2>&1 | head -c 200)"
n=$(obscura ${proxy} fetch https://example.com/ --dump markdown --quiet 2>/dev/null | wc -c)
[ "${n}" -gt 50 ] || { out "FAIL: example.com came back empty"; exit 1; }
out "PASS"
