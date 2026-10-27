"""Web spike (0.8.2): Obscura against Lightpanda and Chromium on real pages.

For each site and engine: wall time, peak memory, the visible text it got (length and
a sample), links, title. Outputs go to results/; summary.md is the table.
Usage: python3 run.py <obscura> <lightpanda> <chrome-headless-shell> <results dir>
"""
import html.parser
import json
import os
import re
import subprocess
import sys
import time

OBSCURA, LIGHTPANDA, CHROME, OUT = sys.argv[1:5]
SITES = [line.strip() for line in open(os.path.join(os.path.dirname(__file__), 'sites.txt')) if line.strip() and not line.startswith('#')]
TIMEOUT = 90


class Text(html.parser.HTMLParser):
    """Visible text, links and title of an HTML document."""

    def __init__(self):
        super().__init__()
        self.skip = 0
        self.parts = []
        self.links = 0
        self.title = ''
        self.in_title = False

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'noscript', 'template', 'svg'):
            self.skip += 1
        if tag == 'a' and any(name == 'href' for name, _ in attrs):
            self.links += 1
        if tag == 'title':
            self.in_title = True

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript', 'template', 'svg') and self.skip:
            self.skip -= 1
        if tag == 'title':
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        elif not self.skip:
            self.parts.append(data)


def of_html(document):
    parser = Text()
    try:
        parser.feed(document)
    except Exception:
        pass
    text = re.sub(r'\s+', ' ', ' '.join(parser.parts)).strip()
    return text, parser.links, parser.title.strip()


def of_markdown(document):
    links = len(re.findall(r'\]\((?!#)', document))
    text = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', document)
    text = re.sub(r'[#*_`>|-]+', ' ', text)
    return re.sub(r'\s+', ' ', text).strip(), links, ''


def timed(argv):
    """Run argv; return (stdout, seconds, peak MB, exit code)."""
    started = time.time()
    try:
        done = subprocess.run(['/usr/bin/time', '-f', '%M'] + argv, capture_output=True, timeout=TIMEOUT)
        lines = done.stderr.decode(errors='replace').strip().splitlines()
        peak = int(lines[-1]) // 1024 if lines and lines[-1].isdigit() else -1
        return done.stdout.decode(errors='replace'), time.time() - started, peak, done.returncode, '\n'.join(lines[-6:-1])
    except subprocess.TimeoutExpired:
        return '', time.time() - started, -1, 'timeout', ''


ENGINES = {
    'obscura-md': (lambda url: [OBSCURA, 'fetch', url, '--dump', 'markdown', '--quiet', '--timeout', '45'], of_markdown),
    'obscura-html': (lambda url: [OBSCURA, 'fetch', url, '--dump', 'html', '--quiet', '--timeout', '45'], of_html),
    'lightpanda': (lambda url: [LIGHTPANDA, 'fetch', '--dump', url], of_html),
    'chromium': (lambda url: [CHROME, '--headless', '--no-sandbox', '--disable-gpu', '--dump-dom', '--virtual-time-budget=8000', '--timeout=45000', url], of_html),
}

os.makedirs(OUT, exist_ok=True)
rows = []
for index, url in enumerate(SITES):
    for engine, (argv, read) in ENGINES.items():
        out, seconds, peak, code, err = timed(argv(url))
        text, links, title = read(out)
        os.makedirs(os.path.join(OUT, engine), exist_ok=True)
        with open(os.path.join(OUT, engine, f'{index:02d}.txt'), 'w') as sample:
            sample.write(f'{url}\nexit {code}, {seconds:.1f}s, {peak} MB, {len(text)} chars, {links} links, title {title!r}\nstderr: {err}\n\n{text[:6000]}\n')
        rows.append({'site': index, 'url': url, 'engine': engine, 'seconds': round(seconds, 1), 'peak_mb': peak, 'code': code, 'chars': len(text), 'links': links})
        print(f'{index:02d} {engine:13s} {code!s:8s} {seconds:5.1f}s {peak:5d}MB {len(text):7d} chars {links:4d} links  {url}', flush=True)

with open(os.path.join(OUT, 'rows.json'), 'w') as handle:
    json.dump(rows, handle, indent=1)
with open(os.path.join(OUT, 'summary.md'), 'w') as summary:
    names = list(ENGINES)
    summary.write('| # | site | ' + ' | '.join(f'{n} chars / links / s / MB' for n in names) + ' |\n')
    summary.write('|---|---|' + '---|' * len(names) + '\n')
    for index, url in enumerate(SITES):
        cells = []
        for name in names:
            row = next(r for r in rows if r['site'] == index and r['engine'] == name)
            mark = '' if row['code'] == 0 else f" ({row['code']})"
            cells.append(f"{row['chars']} / {row['links']} / {row['seconds']} / {row['peak_mb']}{mark}")
        summary.write(f'| {index:02d} | {url} | ' + ' | '.join(cells) + ' |\n')
