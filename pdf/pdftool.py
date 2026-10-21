"""pdftool: everyday PDF operations for an Argus project, on pikepdf, pypdf and pypdfium2.

Every command reads the files it is given and writes only the output it is told (-o);
an output never replaces an input. Pages are numbered from 1: "1-3,5,9-" is pages 1 to 3,
5, and 9 to the end.
"""

import argparse
import os
import sys

import pikepdf
import pypdfium2 as pdfium


def fail(message):
    print(f"pdftool: {message}", file=sys.stderr)
    sys.exit(1)


def page_list(spec, count):
    """The 0-based pages a spec like "1-3,5,9-" names, in order, each once."""
    if spec is None:
        return list(range(count))
    pages = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        first, dash, last = part.partition("-")
        try:
            start = int(first) if first else 1
            end = (int(last) if last else count) if dash else start
        except ValueError:
            fail(f'"{part}" is not a page or a range (e.g. 1-3,5,9-)')
        if start < 1 or end > count or start > end:
            fail(f'pages "{part}": the document has {count} page(s)')
        pages.extend(p - 1 for p in range(start, end + 1) if p - 1 not in pages)
    return pages


def output(path, inputs, is_dir=False):
    """An output path that replaces none of the inputs."""
    if any(os.path.exists(i) and os.path.exists(path) and os.path.samefile(i, path) for i in inputs):
        fail(f"{path} is an input: write the result to another file")
    if is_dir:
        os.makedirs(path, exist_ok=True)
    elif os.path.dirname(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def open_pdf(path, password=None):
    try:
        return pikepdf.open(path, password=password or "")
    except pikepdf.PasswordError:
        fail(f"{path} is encrypted: give its --password")
    except (pikepdf.PdfError, FileNotFoundError) as error:
        fail(f"{path}: {error}")


def cmd_info(args):
    with open_pdf(args.file, args.password) as pdf:
        box = pdf.pages[0].mediabox if len(pdf.pages) else None
        print(f"file: {args.file}")
        print(f"pages: {len(pdf.pages)}")
        print(f"pdf version: {pdf.pdf_version}")
        print(f"encrypted: {'yes' if pdf.is_encrypted else 'no'}")
        if box is not None:
            width, height = float(box[2]) - float(box[0]), float(box[3]) - float(box[1])
            print(f"first page: {width:.0f} x {height:.0f} pt ({width / 72 * 25.4:.0f} x {height / 72 * 25.4:.0f} mm)")
        with pdf.open_metadata() as meta:
            for key in ("dc:title", "dc:creator", "xmp:CreateDate", "pdf:Producer"):
                if meta.get(key):
                    print(f"{key.split(':')[1].lower()}: {meta.get(key)}")
        print(f"size: {os.path.getsize(args.file)} bytes")


def cmd_text(args):
    doc = pdfium.PdfDocument(args.file, password=args.password)
    parts = []
    for index in page_list(args.pages, len(doc)):
        textpage = doc[index].get_textpage()
        parts.append(f"--- page {index + 1} ---\n{textpage.get_text_range().strip()}\n")
    text = "\n".join(parts)
    if args.output:
        with open(output(args.output, [args.file]), "w", encoding="utf-8") as handle:
            handle.write(text)
        print(f"wrote the text of {len(parts)} page(s) to {args.output}")
    else:
        sys.stdout.write(text)


def cmd_merge(args):
    out = output(args.output, args.files)
    merged = pikepdf.new()
    for path in args.files:
        with open_pdf(path) as pdf:
            merged.pages.extend(pdf.pages)
    merged.save(out)
    print(f"merged {len(args.files)} file(s), {len(merged.pages)} page(s), into {out}")


def cmd_split(args):
    out = output(args.output, [args.file], is_dir=True)
    stem = os.path.splitext(os.path.basename(args.file))[0]
    with open_pdf(args.file, args.password) as pdf:
        count = len(pdf.pages)
        written = []
        for start in range(0, count, args.every):
            part = pikepdf.new()
            part.pages.extend(pdf.pages[start:start + args.every])
            end = min(start + args.every, count)
            name = os.path.join(out, f"{stem}-{start + 1}.pdf" if args.every == 1 else f"{stem}-{start + 1}-{end}.pdf")
            part.save(name)
            written.append(name)
    print(f"split {count} page(s) into {len(written)} file(s) in {out}")


def cmd_pages(args):
    if (args.keep is None) == (args.delete is None):
        fail("give --keep or --delete")
    out = output(args.output, [args.file])
    with open_pdf(args.file, args.password) as pdf:
        count = len(pdf.pages)
        chosen = page_list(args.keep, count) if args.keep else [p for p in range(count) if p not in page_list(args.delete, count)]
        if not chosen:
            fail("no page would be left")
        result = pikepdf.new()
        for index in chosen:
            result.pages.append(pdf.pages[index])
        result.save(out)
    print(f"wrote {len(chosen)} of {count} page(s) to {out}")


def cmd_rotate(args):
    if args.degrees % 90 != 0:
        fail("--degrees must be a multiple of 90")
    out = output(args.output, [args.file])
    with open_pdf(args.file, args.password) as pdf:
        chosen = page_list(args.pages, len(pdf.pages))
        for index in chosen:
            pdf.pages[index].rotate(args.degrees, relative=True)
        pdf.save(out)
    print(f"rotated {len(chosen)} page(s) by {args.degrees} degrees into {out}")


def cmd_to_png(args):
    out = output(args.output, [args.file], is_dir=True)
    stem = os.path.splitext(os.path.basename(args.file))[0]
    doc = pdfium.PdfDocument(args.file, password=args.password)
    chosen = page_list(args.pages, len(doc))
    for index in chosen:
        image = doc[index].render(scale=args.dpi / 72).to_pil()
        image.save(os.path.join(out, f"{stem}-{index + 1}.png"))
    print(f"rendered {len(chosen)} page(s) at {args.dpi} dpi into {out}")


def cmd_compress(args):
    out = output(args.output, [args.file])
    with open_pdf(args.file, args.password) as pdf:
        pdf.remove_unreferenced_resources()
        pdf.save(out, compress_streams=True, recompress_flate=True, object_stream_mode=pikepdf.ObjectStreamMode.generate)
    before, after = os.path.getsize(args.file), os.path.getsize(out)
    print(f"{args.file}: {before} bytes; {out}: {after} bytes ({(after - before) / before * 100:+.0f}%). Images are kept as they are.")


def cmd_encrypt(args):
    out = output(args.output, [args.file])
    with open_pdf(args.file) as pdf:
        pdf.save(out, encryption=pikepdf.Encryption(user=args.password, owner=args.owner_password or args.password, R=6))
    print(f"wrote {out}, encrypted with AES-256")


def cmd_decrypt(args):
    out = output(args.output, [args.file])
    with open_pdf(args.file, args.password) as pdf:
        pdf.save(out)
    print(f"wrote {out}, without a password")


def cmd_metadata(args):
    keys = {"title": "dc:title", "author": "dc:creator", "subject": "dc:description", "keywords": "pdf:Keywords"}
    with open_pdf(args.file, args.password) as pdf:
        if not args.set:
            with pdf.open_metadata() as meta:
                for name, key in keys.items():
                    print(f"{name}: {meta.get(key, '')}")
            return
        if not args.output:
            fail("--set needs -o: the result goes to a new file")
        out = output(args.output, [args.file])
        with pdf.open_metadata() as meta:
            for item in args.set:
                name, _, value = item.partition("=")
                if name not in keys:
                    fail(f'"{name}" is not one of {", ".join(keys)}')
                meta[keys[name]] = [value] if name == "author" else value
        pdf.save(out)
    print(f"wrote {out} with {', '.join(item.partition('=')[0] for item in args.set)}")


def main():
    parser = argparse.ArgumentParser(prog="pdftool", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    def command(name, func, help_text, file=True):
        p = sub.add_parser(name, help=help_text, description=help_text)
        if file:
            p.add_argument("file")
            p.add_argument("--password", help="the password of an encrypted input")
        p.set_defaults(func=func)
        return p

    command("info", cmd_info, "pages, size, version, encryption and metadata")
    p = command("text", cmd_text, "the text of the pages, to the terminal or a file")
    p.add_argument("--pages")
    p.add_argument("-o", "--output")
    p = command("merge", cmd_merge, "join PDFs, in the order given", file=False)
    p.add_argument("files", nargs="+")
    p.add_argument("-o", "--output", required=True)
    p = command("split", cmd_split, "one file per page, or per N pages, into a folder")
    p.add_argument("-o", "--output", required=True, help="the folder")
    p.add_argument("--every", type=int, default=1)
    p = command("pages", cmd_pages, "keep or delete pages")
    p.add_argument("--keep")
    p.add_argument("--delete")
    p.add_argument("-o", "--output", required=True)
    p = command("rotate", cmd_rotate, "rotate pages by a multiple of 90 degrees")
    p.add_argument("--degrees", type=int, default=90)
    p.add_argument("--pages")
    p.add_argument("-o", "--output", required=True)
    p = command("to-png", cmd_to_png, "render pages as PNG images, into a folder")
    p.add_argument("--dpi", type=int, default=150)
    p.add_argument("--pages")
    p.add_argument("-o", "--output", required=True, help="the folder")
    p = command("compress", cmd_compress, "rewrite with compressed streams and no unused objects")
    p.add_argument("-o", "--output", required=True)
    p = sub.add_parser("encrypt", help="protect with a password (AES-256)", description="protect with a password (AES-256)")
    p.add_argument("file")
    p.add_argument("--password", required=True)
    p.add_argument("--owner-password")
    p.add_argument("-o", "--output", required=True)
    p.set_defaults(func=cmd_encrypt)
    p = command("decrypt", cmd_decrypt, "remove the password (it must be given)")
    p.add_argument("-o", "--output", required=True)
    p = command("metadata", cmd_metadata, "show, or set (--set title=… author=… subject=… keywords=…)")
    p.add_argument("--set", nargs="+")
    p.add_argument("-o", "--output")

    args = parser.parse_args()
    if getattr(args, "dpi", 150) not in range(36, 601):
        fail("--dpi must be between 36 and 600")
    if getattr(args, "every", 1) < 1:
        fail("--every must be 1 or more")
    args.func(args)


if __name__ == "__main__":
    main()
