"""Cut Noto Serif Telugu down to the letters of the verses in app/lib/verses.ts.

The site shows a handful of verses in Telugu script; the full font is half a megabyte, the
cut a few kilobytes. Rerun after changing a verse:

    pip install fonttools brotli
    python scripts/subset_verse_font.py
"""
import io
import os
import re
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSES = os.path.join(ROOT, "app", "lib", "verses.ts")
OUT = os.path.join(ROOT, "app", "app", "fonts", "noto-serif-telugu-verses.woff2")
SOURCE = "https://github.com/google/fonts/raw/main/ofl/notoseriftelugu/NotoSerifTelugu%5Bwght%5D.ttf"
# Joiners and the dotted circle the shaper may reach for, and the space between words.
EXTRA = [0x20, 0x200C, 0x200D, 0x25CC, 0x964, 0x965]


def verse_text():
    return "".join(sorted(set(re.findall(r"[ఀ-౿]", open(VERSES, encoding="utf-8").read()))))


def main():
    with urllib.request.urlopen(SOURCE) as response:
        font = TTFont(io.BytesIO(response.read()))
    font = instancer.instantiateVariableFont(font, {"wght": 400})
    options = subset.Options()
    options.layout_features = ["*"]
    options.flavor = "woff2"
    cutter = subset.Subsetter(options)
    cutter.populate(text=verse_text(), unicodes=EXTRA)
    cutter.subset(font)
    font.flavor = "woff2"
    font.save(OUT)
    print(f"{OUT}: {os.path.getsize(OUT):,} bytes")


if __name__ == "__main__":
    main()
