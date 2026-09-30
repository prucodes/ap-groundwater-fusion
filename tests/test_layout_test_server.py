"""The layout tests have to be served the way GitHub Pages serves.

`python3 -m http.server` answers every request with 200 and the whole file and
never sends Accept-Ranges. Chromium then reports the monsoon film as unseekable
-- seekable comes back as [[0, 0]] on a 178 s video -- and silently discards a
seek, leaving currentTime at 0 and `seeking` false. The chapter-seek tests
failed for that reason and not for anything in the app; Pages answers the same
request with 206. Reaching for the one-line Python server again would bring the
failure back, so this says why not to.
"""
import os
import re


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(ROOT, "app", "playwright.config.ts")
SERVER = os.path.join(ROOT, "app", "scripts", "serve-static.mjs")
FILM_SPEC = os.path.join(ROOT, "app", "e2e", "monsoon-film.spec.ts")


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def test_the_layout_tests_are_not_served_by_a_server_without_range():
    config = read(CONFIG)
    # The command itself, not the file: the comment above it names the server it replaced,
    # and a guard that matched the explanation would fire on the reason for its own existence.
    command = re.search(r"command:\s*\n?\s*\"([^\"]+)\"", config)
    assert command, "the webServer command should stay a literal string"
    assert "http.server" not in command.group(1), "python3 -m http.server serves no Range"
    assert "scripts/serve-static.mjs" in command.group(1)


def test_the_test_server_answers_range_requests():
    server = read(SERVER)
    assert '"accept-ranges": "bytes"' in server
    assert "206" in server and "content-range" in server
    # An unsatisfiable range has its own answer; treating it as a whole-file 200 would let a
    # media element read past the end of the file.
    assert "416" in server


def test_the_film_test_says_when_the_server_is_at_fault():
    spec = read(FILM_SPEC)
    seekable = spec.index("v.seekable")
    current = spec.index("v.currentTime")
    assert seekable < current, "check seekability before asserting a seek worked"


def test_the_served_directory_cannot_be_escaped():
    server = read(SERVER)
    assert "startsWith(root + sep)" in server
