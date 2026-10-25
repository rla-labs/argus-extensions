//! pdftool: everyday PDF operations for an Argus project.
//!
//! PDFium reads and renders (info, text, to-png); qpdf writes (merge, split, pages,
//! rotate, compress, encrypt, decrypt, metadata), since it keeps what PDFium's page
//! import drops, the outline among them; ironpress makes a PDF from HTML or Markdown
//! (from-html, from-md). qpdf, ironpress and libpdfium are the extension's own, found
//! beside this binary: bin/qpdf, libexec/ironpress, lib/libpdfium.so.
//!
//! Every command reads the files it is given and writes only the output it is told (-o);
//! an output never replaces an input. Pages are numbered from 1: "1-3,5,9-" is pages 1
//! to 3, 5, and 9 to the end.

use pdfium_render::prelude::*;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{exit, Command};

const USAGE: &str = "usage: pdftool <command> [arguments]

  info <file>                                pages, size, version, encryption and metadata
  text <file> [--pages P] [-o file]          the text of the pages, to the terminal or a file
  merge <file> <file>... -o <file>           join PDFs, in the order given
  split <file> -o <folder> [--every N]       one file per page, or per N pages, into a folder
  pages <file> --keep P | --delete P -o <file>   keep or delete pages
  rotate <file> [--degrees 90] [--pages P] -o <file>   rotate pages by a multiple of 90 degrees
  to-png <file> -o <folder> [--dpi 150] [--pages P]    render pages as PNG images
  compress <file> -o <file>                  rewrite with compressed streams and no unused objects
  encrypt <file> --password PW [--owner-password PW] -o <file>   protect with a password (AES-256)
  decrypt <file> --password PW -o <file>     remove the password (it must be given)
  metadata <file> [--set title=… author=… subject=… keywords=… -o <file>]   show, or set
  from-html <file.html> -o <file.pdf> [--page-size a4|letter|legal] [--landscape]
  from-md <file.md> -o <file.pdf> [--page-size a4|letter|legal] [--landscape]

An encrypted input takes --password. Pages: \"1-3,5,9-\" is pages 1 to 3, 5, and 9 to the end.";

/// The most pixels one rendered page may have: about 6300 × 6300.
const MAX_PIXELS: f32 = 40_000_000.0;

fn fail(message: impl std::fmt::Display) -> ! {
    eprintln!("pdftool: {message}");
    exit(1)
}

// ── arguments ───────────────────────────────────────────────────────────────

/// A command line: its positional arguments and its options, each checked against the
/// command's own list.
struct Args {
    positional: Vec<String>,
    options: HashMap<String, String>,
    set: Vec<String>,
    landscape: bool,
}

impl Args {
    fn parse(raw: &[String], allowed: &[&str]) -> Args {
        let mut args = Args { positional: Vec::new(), options: HashMap::new(), set: Vec::new(), landscape: false };
        let mut items = raw.iter().peekable();
        while let Some(item) = items.next() {
            let (name, inline) = match item.split_once('=') {
                Some((name, value)) if name.starts_with("--") => (name.to_string(), Some(value.to_string())),
                _ => (item.clone(), None),
            };
            let name = if name == "-o" { "--output".to_string() } else { name };
            if !name.starts_with('-') || name == "-" {
                args.positional.push(item.clone());
                continue;
            }
            if !allowed.contains(&name.as_str()) {
                fail(format!("{name} is not an option of this command\n\n{USAGE}"));
            }
            match name.as_str() {
                "--landscape" => args.landscape = true,
                "--set" => {
                    args.set.extend(inline);
                    while let Some(next) = items.peek() {
                        if next.starts_with('-') {
                            break;
                        }
                        args.set.push(items.next().cloned().unwrap_or_default());
                    }
                }
                _ => {
                    let value = inline.or_else(|| items.next().cloned()).unwrap_or_else(|| fail(format!("{name} needs a value")));
                    args.options.insert(name, value);
                }
            }
        }
        args
    }

    fn get(&self, name: &str) -> Option<&str> {
        self.options.get(name).map(String::as_str)
    }

    fn need(&self, name: &str) -> &str {
        self.get(name).unwrap_or_else(|| fail(format!("{name} is required\n\n{USAGE}")))
    }

    fn number(&self, name: &str, default: i64) -> i64 {
        self.get(name).map_or(default, |value| value.parse().unwrap_or_else(|_| fail(format!("{name} takes a whole number, not \"{value}\""))))
    }

    /// The one input file a command takes.
    fn file(&self) -> &str {
        match self.positional.as_slice() {
            [file] => file,
            [] => fail(format!("which file?\n\n{USAGE}")),
            _ => fail(format!("one file only, not {}", self.positional.join(" "))),
        }
    }
}

/// The pages (numbered from 1) a spec like "1-3,5,9-" names, in order, each once; all
/// of them without a spec.
fn page_list(spec: Option<&str>, count: usize) -> Result<Vec<usize>, String> {
    let Some(spec) = spec else { return Ok((1..=count).collect()) };
    let mut pages = Vec::new();
    for part in spec.split(',').map(str::trim).filter(|part| !part.is_empty()) {
        let (first, last) = part.split_once('-').map_or((part, Some(part)), |(first, last)| (first, if last.is_empty() { None } else { Some(last) }));
        let parse = |text: &str| text.trim().parse::<usize>().map_err(|_| format!("\"{part}\" is not a page or a range (e.g. 1-3,5,9-)"));
        let start = if first.is_empty() { 1 } else { parse(first)? };
        let end = match last {
            Some(last) => parse(last)?,
            None => count,
        };
        if start < 1 || end > count || start > end {
            return Err(format!("pages \"{part}\": the document has {count} page(s)"));
        }
        for page in start..=end {
            if !pages.contains(&page) {
                pages.push(page);
            }
        }
    }
    Ok(pages)
}

/// Pages as qpdf takes them, in the same order: "1-3,5,9".
fn qpdf_ranges(pages: &[usize]) -> String {
    let mut parts: Vec<String> = Vec::new();
    let mut index = 0;
    while index < pages.len() {
        let start = pages[index];
        let mut end = start;
        while index + 1 < pages.len() && pages[index + 1] == end + 1 {
            index += 1;
            end += 1;
        }
        parts.push(if start == end { start.to_string() } else { format!("{start}-{end}") });
        index += 1;
    }
    parts.join(",")
}

/// An output path that replaces none of the inputs; its folder is made.
fn output(path: &str, inputs: &[&str], is_dir: bool) -> PathBuf {
    let out = PathBuf::from(path);
    for input in inputs {
        if let (Ok(a), Ok(b)) = (fs::canonicalize(input), fs::canonicalize(&out)) {
            if a == b {
                fail(format!("{path} is an input: write the result to another file"));
            }
        }
    }
    let folder = if is_dir { Some(out.as_path()) } else { out.parent().filter(|parent| !parent.as_os_str().is_empty()) };
    if let Some(folder) = folder {
        fs::create_dir_all(folder).unwrap_or_else(|error| fail(format!("{}: {error}", folder.display())));
    }
    out
}

fn stem(file: &str) -> String {
    Path::new(file).file_stem().map_or_else(|| "page".to_string(), |stem| stem.to_string_lossy().into_owned())
}

// ── the extension's own tools ───────────────────────────────────────────────

/// The extension's folder: this binary is its bin/pdftool.
fn home() -> PathBuf {
    let exe = std::env::current_exe().and_then(fs::canonicalize).unwrap_or_else(|error| fail(format!("cannot find myself: {error}")));
    exe.parent().and_then(Path::parent).map(Path::to_path_buf).unwrap_or_else(|| fail("cannot find the extension's folder"))
}

fn pdfium() -> Pdfium {
    let lib = home().join("lib");
    let bindings = Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(&lib)).unwrap_or_else(|error| fail(format!("cannot load PDFium from {}: {error}", lib.display())));
    Pdfium::new(bindings)
}

fn open<'a>(pdfium: &'a Pdfium, file: &str, password: Option<&str>) -> PdfDocument<'a> {
    if !Path::new(file).is_file() {
        fail(format!("{file}: no such file"));
    }
    pdfium.load_pdf_from_file(file, password).unwrap_or_else(|error| match error {
        PdfiumError::PdfiumLibraryInternalError(PdfiumInternalError::PasswordError) if password.is_some() => fail(format!("{file}: the password is wrong")),
        PdfiumError::PdfiumLibraryInternalError(PdfiumInternalError::PasswordError) => fail(format!("{file} is encrypted: give its --password")),
        error => fail(format!("{file} cannot be read as a PDF: {error:?}")),
    })
}

/// Run qpdf; its warnings (exit 3) still leave a good output. Its stdout, or why it failed.
fn try_qpdf(args: &[String]) -> Result<String, String> {
    let result = Command::new(home().join("bin/qpdf")).args(args).output().map_err(|error| format!("cannot run qpdf: {error}"))?;
    let stderr = String::from_utf8_lossy(&result.stderr);
    match result.status.code() {
        Some(0) | Some(3) => Ok(String::from_utf8_lossy(&result.stdout).into_owned()),
        _ if stderr.contains("invalid password") => Err(if args.iter().any(|arg| arg.starts_with("--password=")) { "the password is wrong" } else { "the input is encrypted: give its --password" }.to_string()),
        _ => Err(stderr.trim().strip_prefix("qpdf: ").unwrap_or(stderr.trim()).to_string()),
    }
}

fn qpdf(args: &[String]) -> String {
    try_qpdf(args).unwrap_or_else(|error| fail(error))
}

/// The input and its password, as qpdf's first arguments.
fn qpdf_input(file: &str, password: Option<&str>) -> Vec<String> {
    if !Path::new(file).is_file() {
        fail(format!("{file}: no such file"));
    }
    let mut args = vec![file.to_string()];
    if let Some(password) = password {
        args.push(format!("--password={password}"));
    }
    args
}

fn page_count(file: &str, password: Option<&str>) -> usize {
    let mut args = vec!["--show-npages".to_string()];
    args.extend(qpdf_input(file, password));
    qpdf(&args).trim().parse().unwrap_or_else(|_| fail(format!("{file}: cannot count its pages")))
}

// ── reading: PDFium ─────────────────────────────────────────────────────────

fn info(args: &Args) {
    let file = args.file();
    let pdfium = pdfium();
    let doc = open(&pdfium, file, args.get("--password"));
    println!("file: {file}");
    println!("pages: {}", doc.pages().len());
    let version = match doc.version() {
        PdfDocumentVersion::Other(n) => format!("{}.{}", n / 10, n % 10),
        known => format!("{known:?}").trim_start_matches("Pdf").replace('_', "."),
    };
    println!("pdf version: {version}");
    let protected = !matches!(doc.permissions().security_handler_revision(), Ok(PdfSecurityHandlerRevision::Unprotected));
    println!("encrypted: {}", if protected { "yes" } else { "no" });
    if let Ok(page) = doc.pages().get(0) {
        let (width, height) = (page.width().value, page.height().value);
        println!("first page: {width:.0} x {height:.0} pt ({:.0} x {:.0} mm)", width / 72.0 * 25.4, height / 72.0 * 25.4);
    }
    let metadata = doc.metadata();
    for (name, tag) in [
        ("title", PdfDocumentMetadataTagType::Title),
        ("author", PdfDocumentMetadataTagType::Author),
        ("subject", PdfDocumentMetadataTagType::Subject),
        ("keywords", PdfDocumentMetadataTagType::Keywords),
        ("creator", PdfDocumentMetadataTagType::Creator),
        ("producer", PdfDocumentMetadataTagType::Producer),
        ("created", PdfDocumentMetadataTagType::CreationDate),
    ] {
        if let Some(value) = metadata.get(tag).map(|tag| tag.value().to_string()).filter(|value| !value.is_empty()) {
            println!("{name}: {value}");
        }
    }
    println!("size: {} bytes", fs::metadata(file).map_or(0, |meta| meta.len()));
}

fn text(args: &Args) {
    let file = args.file();
    let pdfium = pdfium();
    let doc = open(&pdfium, file, args.get("--password"));
    let pages = page_list(args.get("--pages"), doc.pages().len() as usize).unwrap_or_else(|error| fail(error));
    let parts: Vec<String> = pages
        .iter()
        .map(|&number| {
            let page = doc.pages().get((number - 1) as PdfPageIndex).unwrap_or_else(|error| fail(format!("page {number}: {error:?}")));
            let text = page.text().map(|text| text.all()).unwrap_or_default();
            format!("--- page {number} ---\n{}\n", text.trim())
        })
        .collect();
    let all = parts.join("\n");
    match args.get("--output") {
        Some(path) => {
            fs::write(output(path, &[file], false), all).unwrap_or_else(|error| fail(format!("{path}: {error}")));
            println!("wrote the text of {} page(s) to {path}", parts.len());
        }
        None => print!("{all}"),
    }
}

fn to_png(args: &Args) {
    use image::codecs::png::{CompressionType, FilterType, PngEncoder};
    let file = args.file();
    let dpi = args.number("--dpi", 150);
    if !(36..=600).contains(&dpi) {
        fail("--dpi must be between 36 and 600");
    }
    let folder = args.need("--output");
    let out = output(folder, &[file], true);
    let pdfium = pdfium();
    let doc = open(&pdfium, file, args.get("--password"));
    let pages = page_list(args.get("--pages"), doc.pages().len() as usize).unwrap_or_else(|error| fail(error));
    let name = stem(file);
    let mut reduced = Vec::new();
    for &number in &pages {
        let page = doc.pages().get((number - 1) as PdfPageIndex).unwrap_or_else(|error| fail(format!("page {number}: {error:?}")));
        let mut scale = dpi as f32 / 72.0;
        let pixels = page.width().value * page.height().value * scale * scale;
        if pixels > MAX_PIXELS {
            scale *= (MAX_PIXELS / pixels).sqrt();
            reduced.push(number);
        }
        let image = page
            .render_with_config(&PdfRenderConfig::new().scale_page_by_factor(scale).render_form_data(true))
            .and_then(|bitmap| bitmap.as_image())
            .unwrap_or_else(|error| fail(format!("page {number}: {error:?}")))
            .to_rgb8();
        let path = out.join(format!("{name}-{number}.png"));
        let writer = std::io::BufWriter::new(fs::File::create(&path).unwrap_or_else(|error| fail(format!("{}: {error}", path.display()))));
        image.write_with_encoder(PngEncoder::new_with_quality(writer, CompressionType::Fast, FilterType::Adaptive)).unwrap_or_else(|error| fail(format!("{}: {error}", path.display())));
    }
    println!("rendered {} page(s) at {dpi} dpi into {folder}", pages.len());
    if !reduced.is_empty() {
        println!("page(s) {} are large: rendered smaller, at most {} million pixels each", qpdf_ranges(&reduced), MAX_PIXELS as u32 / 1_000_000);
    }
}

// ── writing: qpdf ───────────────────────────────────────────────────────────

fn merge(args: &Args) {
    let path = args.need("--output");
    if args.positional.len() < 2 {
        fail("merge takes two files or more");
    }
    let inputs: Vec<&str> = args.positional.iter().map(String::as_str).collect();
    let out = output(path, &inputs, false);
    // The first file is qpdf's primary input: its outline and document settings are kept.
    let mut qargs = qpdf_input(inputs[0], None);
    qargs.extend(["--pages".to_string(), ".".to_string()]);
    for input in &inputs[1..] {
        qargs.extend(qpdf_input(input, None));
    }
    qargs.extend(["--".to_string(), out.to_string_lossy().into_owned()]);
    qpdf(&qargs);
    println!("merged {} file(s), {} page(s), into {path}", inputs.len(), page_count(path, None));
}

/// Write the given pages of a file to another, in that order.
fn select(file: &str, password: Option<&str>, pages: &[usize], out: &Path) {
    let mut qargs = qpdf_input(file, password);
    qargs.extend(["--pages".to_string(), ".".to_string(), qpdf_ranges(pages), "--".to_string(), out.to_string_lossy().into_owned()]);
    qpdf(&qargs);
}

fn split(args: &Args) {
    let file = args.file();
    let every = args.number("--every", 1);
    if every < 1 {
        fail("--every must be 1 or more");
    }
    let folder = args.need("--output");
    let out = output(folder, &[file], true);
    let password = args.get("--password");
    let count = page_count(file, password);
    let name = stem(file);
    let mut written = 0;
    for start in (1..=count).step_by(every as usize) {
        let end = (start + every as usize - 1).min(count);
        let part = out.join(if every == 1 { format!("{name}-{start}.pdf") } else { format!("{name}-{start}-{end}.pdf") });
        select(file, password, &(start..=end).collect::<Vec<_>>(), &part);
        written += 1;
    }
    println!("split {count} page(s) into {written} file(s) in {folder}");
}

fn pages(args: &Args) {
    let file = args.file();
    let (keep, delete) = (args.get("--keep"), args.get("--delete"));
    if keep.is_some() == delete.is_some() {
        fail("give --keep or --delete");
    }
    let path = args.need("--output");
    let out = output(path, &[file], false);
    let password = args.get("--password");
    let count = page_count(file, password);
    let chosen = match (keep, delete) {
        (Some(keep), _) => page_list(Some(keep), count),
        (_, delete) => page_list(delete, count).map(|gone| (1..=count).filter(|page| !gone.contains(page)).collect()),
    }
    .unwrap_or_else(|error| fail(error));
    if chosen.is_empty() {
        fail("no page would be left");
    }
    select(file, password, &chosen, &out);
    println!("wrote {} of {count} page(s) to {path}", chosen.len());
}

fn rotate(args: &Args) {
    let file = args.file();
    let degrees = args.number("--degrees", 90);
    if degrees % 90 != 0 {
        fail("--degrees must be a multiple of 90");
    }
    let path = args.need("--output");
    let out = output(path, &[file], false);
    let password = args.get("--password");
    let chosen = page_list(args.get("--pages"), page_count(file, password)).unwrap_or_else(|error| fail(error));
    let mut qargs = qpdf_input(file, password);
    qargs.push(format!("--rotate=+{}:{}", degrees.rem_euclid(360), qpdf_ranges(&chosen)));
    qargs.extend(["--".to_string(), out.to_string_lossy().into_owned()]);
    qpdf(&qargs);
    println!("rotated {} page(s) by {degrees} degrees into {path}", chosen.len());
}

fn compress(args: &Args) {
    let file = args.file();
    let path = args.need("--output");
    let out = output(path, &[file], false);
    let mut qargs = qpdf_input(file, args.get("--password"));
    qargs.extend(["--object-streams=generate", "--recompress-flate", "--compression-level=9", "--remove-unreferenced-resources=yes"].map(String::from));
    qargs.push(out.to_string_lossy().into_owned());
    qpdf(&qargs);
    let (before, after) = (fs::metadata(file).map_or(0, |m| m.len()), fs::metadata(&out).map_or(0, |m| m.len()));
    let change = if before == 0 { 0.0 } else { (after as f64 - before as f64) / before as f64 * 100.0 };
    println!("{file}: {before} bytes; {path}: {after} bytes ({change:+.0}%). Images are kept as they are.");
}

fn encrypt(args: &Args) {
    let file = args.file();
    let password = args.need("--password");
    let path = args.need("--output");
    let out = output(path, &[file], false);
    let owner = args.get("--owner-password").unwrap_or(password);
    let mut qargs = qpdf_input(file, None);
    qargs.extend(["--encrypt".to_string(), format!("--user-password={password}"), format!("--owner-password={owner}"), "--bits=256".to_string(), "--".to_string(), out.to_string_lossy().into_owned()]);
    qpdf(&qargs);
    println!("wrote {path}, encrypted with AES-256");
}

fn decrypt(args: &Args) {
    let file = args.file();
    let password = args.need("--password");
    let path = args.need("--output");
    let out = output(path, &[file], false);
    let mut qargs = qpdf_input(file, Some(password));
    qargs.extend(["--decrypt".to_string(), out.to_string_lossy().into_owned()]);
    qpdf(&qargs);
    println!("wrote {path}, without a password");
}

const METADATA_KEYS: [(&str, &str); 4] = [("title", "/Title"), ("author", "/Author"), ("subject", "/Subject"), ("keywords", "/Keywords")];

/// qpdf's JSON for some objects of a file.
fn qpdf_json(file: &str, password: Option<&str>, object: &str) -> serde_json::Value {
    let mut qargs = vec!["--json=2".to_string(), "--json-key=qpdf".to_string(), format!("--json-object={object}")];
    qargs.extend(qpdf_input(file, password));
    serde_json::from_str(&qpdf(&qargs)).unwrap_or_else(|error| fail(format!("{file}: qpdf's JSON: {error}")))
}

fn metadata(args: &Args) {
    let file = args.file();
    let password = args.get("--password");
    if args.set.is_empty() {
        let pdfium = pdfium();
        let doc = open(&pdfium, file, password);
        let tags = [PdfDocumentMetadataTagType::Title, PdfDocumentMetadataTagType::Author, PdfDocumentMetadataTagType::Subject, PdfDocumentMetadataTagType::Keywords];
        for ((name, _), tag) in METADATA_KEYS.iter().zip(tags) {
            println!("{name}: {}", doc.metadata().get(tag).map(|tag| tag.value().to_string()).unwrap_or_default());
        }
        return;
    }
    let path = args.get("--output").unwrap_or_else(|| fail("--set needs -o: the result goes to a new file"));
    let mut changes = Vec::new();
    for item in &args.set {
        let (name, value) = item.split_once('=').unwrap_or((item, ""));
        let key = METADATA_KEYS.iter().find(|(known, _)| *known == name).map(|(_, key)| *key).unwrap_or_else(|| fail(format!("\"{name}\" is not one of title, author, subject, keywords")));
        changes.push((name.to_string(), key, value.to_string()));
    }
    let out = output(path, &[file], false);
    // The document information dictionary, changed through qpdf's JSON: the trailer says
    // where it is, or a new object is added for it. ponytail: the XMP metadata, if the
    // file has any, is left as it is; readers that prefer it show the old values.
    let shown = qpdf_json(file, password, "trailer");
    let header = &shown["qpdf"][0];
    let trailer = shown["qpdf"][1]["trailer"]["value"].clone();
    let mut objects = serde_json::Map::new();
    let (info_ref, mut info) = match trailer["/Info"].as_str() {
        Some(reference) => {
            let shown = qpdf_json(file, password, reference.trim_end_matches(" R"));
            (reference.to_string(), shown["qpdf"][1][format!("obj:{reference}")]["value"].as_object().cloned().unwrap_or_default())
        }
        None => {
            let id = header["maxobjectid"].as_u64().unwrap_or_else(|| fail(format!("{file}: qpdf gave no object count"))) + 1;
            let reference = format!("{id} 0 R");
            let mut trailer = trailer.as_object().cloned().unwrap_or_default();
            trailer.insert("/Info".to_string(), serde_json::Value::String(reference.clone()));
            objects.insert("trailer".to_string(), serde_json::json!({ "value": trailer }));
            (reference, serde_json::Map::new())
        }
    };
    for (_, key, value) in &changes {
        info.insert(key.to_string(), serde_json::Value::String(format!("u:{value}")));
    }
    objects.insert(format!("obj:{info_ref}"), serde_json::json!({ "value": info }));
    let json = out.with_extension("pdftool-metadata.json");
    fs::write(&json, serde_json::json!({ "qpdf": [header, objects] }).to_string()).unwrap_or_else(|error| fail(format!("{}: {error}", json.display())));
    let mut qargs = qpdf_input(file, password);
    qargs.extend([format!("--update-from-json={}", json.display()), out.to_string_lossy().into_owned()]);
    let result = try_qpdf(&qargs);
    let _ = fs::remove_file(&json);
    result.unwrap_or_else(|error| fail(error));
    println!("wrote {path} with {}", changes.iter().map(|(name, _, _)| name.as_str()).collect::<Vec<_>>().join(", "));
}

// ── making: ironpress ───────────────────────────────────────────────────────

/// Images the converter leaves out: remote ones are never fetched, and only files in the
/// input's folder and below are read.
fn left_out(source: &str) -> Vec<String> {
    let mut found = Vec::new();
    for marker in ["src=\"", "src='", "url(\"", "url('", "url(", "]("] {
        for (at, _) in source.match_indices(marker) {
            let rest = &source[at + marker.len()..];
            let end = rest.find(|c: char| c == '"' || c == '\'' || c == ')' || c.is_whitespace()).unwrap_or(rest.len());
            let target = &rest[..end];
            let outside = ["http://", "https://", "//", "/", "../", "file:"].iter().any(|prefix| target.starts_with(prefix));
            // A Markdown link ](…) is no image unless it closes a "![".
            let image = marker != "](" || source[..at].rfind("![").is_some_and(|open| !source[open..at].contains(']'));
            if outside && image && !found.iter().any(|known| known == target) {
                found.push(target.to_string());
            }
        }
    }
    found
}

fn from_source(args: &Args, kind: &str) {
    let file = args.file();
    let extension = Path::new(file).extension().map(|ext| ext.to_string_lossy().to_lowercase()).unwrap_or_default();
    let known = if kind == "html" { ["html", "htm"] } else { ["md", "markdown"] };
    if !known.contains(&extension.as_str()) {
        fail(format!("from-{kind} takes a .{} file", known[0]));
    }
    let source = fs::read_to_string(file).unwrap_or_else(|error| fail(format!("{file}: {error}")));
    let path = args.need("--output");
    let out = output(path, &[file], false);
    let base = fs::canonicalize(file).ok().and_then(|full| full.parent().map(Path::to_path_buf)).unwrap_or_else(|| PathBuf::from("."));
    let mut command = Command::new(home().join("libexec/ironpress"));
    command.arg("--base-path").arg(&base);
    if let Some(size) = args.get("--page-size") {
        if !["a4", "letter", "legal"].contains(&size) {
            fail("--page-size is a4, letter or legal");
        }
        command.args(["--page-size", size]);
    }
    if args.landscape {
        command.arg("--landscape");
    }
    // ironpress knows a file by its name's .html or .md: a copy under that name, beside
    // the input so its images are found the same way.
    let copy = (extension != known[0]).then(|| base.join(format!(".{}.pdftool.{}", stem(file), known[0])));
    if let Some(copy) = &copy {
        fs::write(copy, &source).unwrap_or_else(|error| fail(format!("{}: {error}", copy.display())));
    }
    let result = command.arg(copy.as_deref().unwrap_or(Path::new(file))).arg(&out).output();
    if let Some(copy) = &copy {
        let _ = fs::remove_file(copy);
    }
    let result = result.unwrap_or_else(|error| fail(format!("cannot run ironpress: {error}")));
    if !result.status.success() {
        fail(String::from_utf8_lossy(&result.stderr).trim().to_string());
    }
    println!("wrote {path}, {} page(s)", page_count(path, None));
    let skipped = left_out(&source);
    if !skipped.is_empty() {
        println!("left out {} image(s): only files in the input's folder (and below) and data: images are used, and nothing is fetched: {}", skipped.len(), skipped.join(", "));
    }
}

fn main() {
    // Output piped into `head` ends quietly, as other command-line tools do.
    unsafe { libc::signal(libc::SIGPIPE, libc::SIG_DFL) };
    let raw: Vec<String> = std::env::args().skip(1).collect();
    let Some((command, rest)) = raw.split_first() else { fail(USAGE) };
    let password = "--password";
    match command.as_str() {
        "info" => info(&Args::parse(rest, &[password])),
        "text" => text(&Args::parse(rest, &[password, "--pages", "--output"])),
        "merge" => merge(&Args::parse(rest, &["--output"])),
        "split" => split(&Args::parse(rest, &[password, "--output", "--every"])),
        "pages" => pages(&Args::parse(rest, &[password, "--keep", "--delete", "--output"])),
        "rotate" => rotate(&Args::parse(rest, &[password, "--degrees", "--pages", "--output"])),
        "to-png" => to_png(&Args::parse(rest, &[password, "--dpi", "--pages", "--output"])),
        "compress" => compress(&Args::parse(rest, &[password, "--output"])),
        "encrypt" => encrypt(&Args::parse(rest, &[password, "--owner-password", "--output"])),
        "decrypt" => decrypt(&Args::parse(rest, &[password, "--output"])),
        "metadata" => metadata(&Args::parse(rest, &[password, "--set", "--output"])),
        "from-html" => from_source(&Args::parse(rest, &["--output", "--page-size", "--landscape"]), "html"),
        "from-md" => from_source(&Args::parse(rest, &["--output", "--page-size", "--landscape"]), "md"),
        "-h" | "--help" | "help" => println!("{USAGE}"),
        "--version" => println!("pdftool {}", env!("CARGO_PKG_VERSION")),
        other => fail(format!("\"{other}\" is not a command\n\n{USAGE}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pages_as_written() {
        assert_eq!(page_list(Some("1-3,5,9-"), 10), Ok(vec![1, 2, 3, 5, 9, 10]));
        assert_eq!(page_list(Some("3,1,3"), 4), Ok(vec![3, 1]));
        assert_eq!(page_list(Some("-2"), 4), Ok(vec![1, 2]));
        assert_eq!(page_list(None, 3), Ok(vec![1, 2, 3]));
        assert!(page_list(Some("0"), 3).is_err());
        assert!(page_list(Some("2-9"), 3).is_err());
        assert!(page_list(Some("x"), 3).is_err());
    }

    #[test]
    fn ranges_for_qpdf_keep_the_order() {
        assert_eq!(qpdf_ranges(&[1, 2, 3, 5, 9, 10]), "1-3,5,9-10");
        assert_eq!(qpdf_ranges(&[3, 1]), "3,1");
    }

    #[test]
    fn images_left_out() {
        let html = r#"<img src="https://x.ro/a.png"><img src="img/b.png"><img src='../c.png'><a href="https://x.ro">x</a>"#;
        assert_eq!(left_out(html), vec!["https://x.ro/a.png", "../c.png"]);
        let md = "![a](https://x.ro/a.png) [link](https://x.ro) ![b](img/b.png) ![c](/etc/c.png)";
        assert_eq!(left_out(md), vec!["https://x.ro/a.png", "/etc/c.png"]);
    }

    #[test]
    fn options_and_values() {
        let raw: Vec<String> = ["f.pdf", "-o", "out.pdf", "--set", "title=A b", "author=C", "--password=x"].map(String::from).to_vec();
        let args = Args::parse(&raw, &["--output", "--set", "--password"]);
        assert_eq!(args.positional, vec!["f.pdf"]);
        assert_eq!(args.get("--output"), Some("out.pdf"));
        assert_eq!(args.get("--password"), Some("x"));
        assert_eq!(args.set, vec!["title=A b", "author=C"]);
    }
}
