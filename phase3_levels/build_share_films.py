"""A copy of each film that can leave the site: build_share_films.py.

The films the pages play (water from space, the season's rain, the two cyclones'
clouds) are bare imagery: the State's outline, the date of each frame, what the
frame shows and where it comes from are drawn over them by the page. Downloaded
as they are, they would be pictures with no date and no source. This writes a
second copy of each with those burned into every frame, for a slide or a
WhatsApp message:

    app/public/films/grace/grace-share.mp4
    app/public/films/rain/rain-share.mp4
    app/public/cyclones/clouds-share.mp4
    app/public/films/share.json      which film each copy was made from (its SHA-256)

It reads the committed film and its JSON, so it needs no download. The words on
each frame are the ones the page shows for that frame, built by the same rules
(components/GraceFilm.tsx, RainFilm.tsx, CloudToAquifer.tsx). Run it after any
of the three films is rebuilt; tests/test_share_films.py fails while a copy is
older than its film.

    python phase3_levels/build_share_films.py            all three
    python phase3_levels/build_share_films.py grace      one
"""

import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "app", "public")
DATA = os.path.join(ROOT, "app", "data")
FONTS = os.path.join(ROOT, "app", "app", "fonts")
MANIFEST = os.path.join(PUBLIC, "films", "share.json")

# Even on both sides (H.264 needs it), and wide enough for a phone or a slide.
WIDTH = 1080
SITE = "prucodes.github.io/ap-groundwater-fusion"
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
IST = timezone(timedelta(hours=5, minutes=30))

INK = (255, 255, 255, 255)
SOFT = (232, 241, 250, 205)
DRY, WET = (240, 162, 131, 255), (143, 220, 242, 255)
SCRIM = (8, 21, 38)
MARK = (242, 196, 109, 255)


def font(name, size, weight):
    """One of the site's variable typefaces at a weight (400 regular, 500 medium, 600 semibold)."""
    face = ImageFont.truetype(os.path.join(FONTS, name), size)
    axes = face.get_variation_axes()
    face.set_variation_by_axes([min(max(weight, axis["minimum"]), axis["maximum"]) if axis["name"] in (b"Weight", "Weight") else axis["default"] for axis in axes])
    return face


def half_up(value):
    """Round as the page's JavaScript does: halves go up."""
    return int(abs(value) + 0.5) * (-1 if value < 0 else 1)


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def outline_points(path, scale):
    """The page's SVG outline (moves and lines only) as scaled polylines."""
    lines, current = [], []
    for command, x, y in re.findall(r"([MLZ])\s*(?:(-?[\d.]+)[ ,](-?[\d.]+))?", path):
        if command == "M":
            if current:
                lines.append(current)
            current = [(float(x) * scale, float(y) * scale)]
        elif command == "L":
            current.append((float(x) * scale, float(y) * scale))
        elif command == "Z" and current:
            current.append(current[0])
    if current:
        lines.append(current)
    return lines


def spaced(draw, at, text, face, fill, tracking):
    """Small capitals with air between the letters, as the site sets its labels."""
    x, y = at
    for letter in text:
        draw.text((x, y), letter, font=face, fill=fill)
        x += draw.textlength(letter, font=face) + tracking
    return x


def static_layer(size, outline, kicker, source, key):
    """Everything that does not change from frame to frame: two soft bands so the words read
    over bright cloud, the State's outline, the title, the source and the site."""
    width, height = size
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    band = Image.new("L", (1, height), 0)
    for y in range(height):
        top = max(0.0, 1 - y / 300) ** 1.6 * 0.86
        bottom = max(0.0, 1 - (height - y) / 190) ** 1.4 * 0.86
        band.putpixel((0, y), int(255 * max(top, bottom)))
    layer.paste(Image.new("RGBA", size, SCRIM + (255,)), (0, 0), band.resize(size))

    # Lines drawn at twice the size and reduced, so the coast is not stepped.
    lines = Image.new("RGBA", (width * 2, height * 2), (0, 0, 0, 0))
    pen = ImageDraw.Draw(lines)
    for points in outline:
        pen.line([(x * 2, y * 2) for x, y in points], fill=(255, 255, 255, 230), width=5, joint="curve")
    layer.alpha_composite(lines.resize(size, Image.LANCZOS))

    draw = ImageDraw.Draw(layer)
    spaced(draw, (44, 40), kicker.upper(), font("jetbrains-mono-latin.woff2", 19, 500), SOFT, 2.2)
    small = font("inter-latin.woff2", 19, 400)
    draw.text((44, height - 66), source, font=small, fill=SOFT)
    draw.text((44, height - 38), f"AP Water Intelligence · research prototype · {SITE}", font=small, fill=(232, 241, 250, 150))
    if key:
        face = font("jetbrains-mono-latin.woff2", 17, 600)
        (left, left_colour), (right, right_colour) = key
        total = draw.textlength(left.upper(), font=face) + draw.textlength(right.upper(), font=face) + 70
        x, y = width - 44 - total, 46
        draw.text((x, y), left.upper(), font=face, fill=SOFT)
        x += draw.textlength(left.upper(), font=face) + 12
        draw.ellipse((x, y + 3, x + 16, y + 19), fill=left_colour)
        draw.ellipse((x + 26, y + 3, x + 42, y + 19), fill=right_colour)
        draw.text((x + 54, y), right.upper(), font=face, fill=SOFT)
    return layer


def render(name, source_video, share_video, fps, outline, kicker, source, frames, key=None, marks=()):
    """Decode the film, write its words on each frame, encode the copy.

    frames: one (headline, line, line colour) per frame of the film.
    marks:  (first frame, x, y, label) for a point that appears part-way through."""
    src, out = os.path.join(PUBLIC, source_video), os.path.join(PUBLIC, share_video)
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", src],
                           check=True, capture_output=True, text=True).stdout.strip().split(",")
    native_w, native_h = int(probe[0]), int(probe[1])
    scale = WIDTH / native_w
    height = int(round(native_h * scale / 2)) * 2
    size = (WIDTH, height)
    fixed = static_layer(size, outline_points(outline, scale), kicker, source, key)
    big, body, tag = font("space-grotesk-latin.woff2", 58, 600), font("inter-latin.woff2", 29, 500), font("inter-latin.woff2", 22, 500)

    decode = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-i", src, "-vf", f"scale={WIDTH}:{height}:flags=lanczos", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                              stdout=subprocess.PIPE)
    encode = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{WIDTH}x{height}", "-framerate", str(fps), "-i", "-",
                               "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709",
                               "-color_primaries", "bt709", "-color_trc", "bt709", "-movflags", "+faststart", "-an", out], stdin=subprocess.PIPE)
    written, step = 0, WIDTH * height * 3
    while True:
        raw = decode.stdout.read(step)
        if len(raw) < step:
            break
        # A film a frame longer than its list of dates holds the last date rather than stopping short.
        headline, line, colour = frames[min(written, len(frames) - 1)]
        frame = Image.frombytes("RGB", size, raw).convert("RGBA")
        frame.alpha_composite(fixed)
        draw = ImageDraw.Draw(frame)
        draw.text((44, 74), headline, font=big, fill=INK)
        draw.text((44, 150), line, font=body, fill=colour)
        for first, x, y, label in marks:
            if written >= first:
                px, py = x * scale, y * scale
                draw.ellipse((px - 16, py - 16, px + 16, py + 16), outline=MARK, width=2)
                draw.ellipse((px - 7, py - 7, px + 7, py + 7), fill=MARK)
                if label:
                    draw.text((px - 26 - draw.textlength(label, font=tag), py - 13), label, font=tag, fill=INK, stroke_width=3, stroke_fill=SCRIM + (255,))
        encode.stdin.write(frame.convert("RGB").tobytes())
        written += 1
    encode.stdin.close()
    if decode.wait() != 0 or encode.wait() != 0:
        raise SystemExit(f"{name}: ffmpeg failed")
    if abs(written - len(frames)) > 1:
        raise SystemExit(f"{name}: the film has {written} frames but its data lists {len(frames)}; rebuild the film first")
    print(f"{name}: {written} frames, {os.path.getsize(out) / 1e6:.1f} MB -> {os.path.relpath(out, ROOT)}")
    return {"film": source_video, "sha256": sha256(src), "share": share_video, "frames": written, "width": WIDTH, "height": height}


def month_name(ym):
    return f"{MONTHS[int(ym[5:7]) - 1]} {ym[:4]}"


def short_day(iso):
    return f"{int(iso[8:10])} {MONTHS[int(iso[5:7]) - 1][:3]}"


def signed_cm(value):
    return f"{'+' if value > 0 else '−' if value < 0 else ''}{abs(half_up(value))} cm"


def grace():
    d = json.load(open(os.path.join(DATA, "grace_film.json")))
    frames = []
    for month, cm in zip(d["months"], d["stateCm"]):
        if cm is None:
            frames.append((month_name(month), "between the two missions: no measurement" if "2017-07" <= month <= "2018-05" else "no solution this month", SOFT))
        else:
            frames.append((month_name(month), f"Andhra Pradesh {signed_cm(cm)} of water against 2004–09", DRY if cm < 0 else WET))
    return render("grace", d["video"], d["video"].replace(".mp4", "-share.mp4"), d["fps"], d["outline"],
                  "Water held across South India · from orbit", "GRACE and GRACE-FO mascons, CSR RL06.3 (NASA, DLR, GFZ)", frames,
                  key=(("less water", (214, 112, 72, 255)), ("more", (74, 196, 230, 255))))


def rain():
    d = json.load(open(os.path.join(DATA, "rain_film.json")))
    year, frames, so_far = d["days"][0][:4], [], 0.0
    for day, mm in zip(d["days"], d["stateMm"]):
        so_far += mm
        frames.append((f"{short_day(day)} {year}", f"Andhra Pradesh {mm:.1f} mm that day · {half_up(so_far)} mm since {short_day(d['days'][0])}", WET))
    marks = [(d["days"].index(l["date"]), l["x"], l["y"], "") for l in d["landfalls"] if "x" in l and l["date"] in d["days"]]
    return render("rain", d["video"], d["video"].replace(".mp4", "-share.mp4"), d["fps"], d["outline"],
                  "Rain by day · from space", "NASA IMERG (GPM, NASA and JAXA), daily, via NASA GIBS", frames, marks=marks)


def clouds():
    d = json.load(open(os.path.join(DATA, "cyclone_clouds.json")))
    start, step = datetime.fromisoformat(d["start"].replace("Z", "+00:00")), timedelta(minutes=d["stepMinutes"])
    first, second = d["landfalls"]
    ashore = [datetime.fromisoformat(f"{l['date']}T00:00:00+05:30") for l in (first, second)]
    day = timedelta(days=1)

    def phase(now):
        if now < ashore[0]:
            return f"{first['name']}, over the Bay"
        if now < ashore[0] + day:
            return f"{first['name']} comes ashore"
        if now < ashore[0] + 3 * day:
            return f"{first['name']}'s rain"
        if now < ashore[1]:
            return f"{second['name']}, over the Bay"
        if now < ashore[1] + day:
            return f"{second['name']} comes ashore{' near ' + second['near'] if second.get('near') else ''}"
        return f"{second['name']}'s rain"

    frames, marks = [], []
    for i in range(d["frames"]):
        now = (start + i * step).astimezone(IST)
        hour = now.hour % 12 or 12
        frames.append((f"{now.day} {MONTHS[now.month - 1][:3]}, {hour}:{now.minute:02d} {'am' if now.hour < 12 else 'pm'} IST", phase(now), SOFT))
    for landfall, when in zip((first, second), ashore):
        if "x" in landfall:
            marks.append((max(0, int((when - start) / step)), landfall["x"], landfall["y"], landfall.get("near", "")))
    return render("clouds", d["video"], d["video"].replace(".mp4", "-share.mp4"), d["fps"], d["outline"],
                  f"Cyclones {first['name']} and {second['name']} · infrared, hourly", "Himawari-9 AHI band 13, Japan Meteorological Agency, via NASA GIBS", frames, marks=marks)


FILMS = {"grace": grace, "rain": rain, "clouds": clouds}


def main(argv):
    wanted = argv or list(FILMS)
    unknown = [name for name in wanted if name not in FILMS]
    if unknown:
        raise SystemExit(f"unknown film: {', '.join(unknown)} (choose from {', '.join(FILMS)})")
    manifest = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {}
    for name in wanted:
        manifest[name] = FILMS[name]()
    with open(MANIFEST, "w") as handle:
        json.dump(manifest, handle, indent=1, sort_keys=True)
        handle.write("\n")


if __name__ == "__main__":
    main(sys.argv[1:])
