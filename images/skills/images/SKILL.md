---
name: images
description: |
  Process images with ImageMagick 7 (magick): resize, crop, make thumbnails and squares,
  convert between JPEG, PNG, WebP, AVIF, HEIC, TIFF and GIF, compress for the web, add a
  watermark or text, build a contact sheet, and do all of it to a whole folder.
---

# Images

`magick` (ImageMagick 7.1.2) is installed. It runs in your folder like any command.
Write each result to a new file in your folder; never overwrite the user's original, and
never write to `/tmp`.

## Recipes

```sh
magick identify photo.jpg                                   # size, format, colors
magick identify -format '%wx%h %b\n' photo.jpg

magick photo.jpg -resize 1600x out/photo-1600.jpg            # width 1600, keep proportions
magick photo.jpg -resize '1600x1600>' out/fit.jpg            # only shrink, never enlarge
magick photo.jpg -resize 400x400^ -gravity center -extent 400x400 out/square.jpg
magick photo.jpg -crop 800x600+100+50 +repage out/crop.jpg  # WxH+X+Y
magick photo.jpg -auto-orient -strip -quality 82 out/web.jpg # for the web: no metadata
magick photo.jpg -quality 80 out/photo.webp                  # or .avif, .png, .tiff
magick photo.heic out/photo.jpg
magick photo.jpg -rotate 90 out/rotated.jpg
magick photo.jpg -colorspace Gray out/gray.jpg

# Text and watermarks (DejaVu Sans unless -font names another)
magick photo.jpg -gravity southeast -pointsize 36 -fill 'rgba(255,255,255,0.8)' \
  -annotate +20+20 '© Acme 2026' out/marked.jpg
magick photo.jpg logo.png -gravity northeast -geometry +20+20 -composite out/logo.jpg

# A contact sheet, an animated GIF
magick montage *.jpg -tile 4x -geometry 300x300+6+6 -label '%f' out/sheet.jpg
magick -delay 50 -loop 0 frames/*.png out/anim.gif
```

## A whole folder

`mogrify` changes files in place, so always give it `-path` for a separate output folder:

```sh
mkdir -p out/web
magick mogrify -path out/web -resize '1600x1600>' -strip -quality 82 -format jpg photos/*.jpg
```

For many large images, run the batch as a background job and tell the user it is running.

## What is refused

The extension's security policy refuses drawing scripts (MVG, MSL), URLs, `@file`
lists, and PostScript, PDF and XPS (for PDFs use the `pdf` extension), and limits one
image to 16,000 pixels a side, 512 MB of memory and 2 minutes. A refusal says "not
allowed by the security policy": tell the user what was refused, do not work around it.
