"""The verse font is cut to the verses' letters; a changed verse must not fall back to another font."""
import os
import re

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def test_verse_font_covers_every_telugu_letter():
    pytest.importorskip("brotli")
    from fontTools.ttLib import TTFont

    font = TTFont(os.path.join(ROOT, "app", "app", "fonts", "noto-serif-telugu-verses.woff2"))
    cmap = font.getBestCmap()
    text = open(os.path.join(ROOT, "app", "lib", "verses.ts"), encoding="utf-8").read()
    missing = sorted({c for c in re.findall(r"[ఀ-౿]", text) if ord(c) not in cmap})
    assert not missing, f"rerun scripts/subset_verse_font.py; the font lacks {missing}"
