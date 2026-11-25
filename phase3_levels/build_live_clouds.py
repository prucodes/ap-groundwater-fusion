"""The last two days over the Bay of Bengal from Himawari-9, refreshed while a storm is near.

Once the storm has gone, FROZEN_END fixes the window on its landfall instead: the loop
then shows the 48 hours to that hour, says so, and later runs leave it alone.

The same infrared redraw as the cyclone cloud film (build_cyclone_clouds.py), over
the same frame, but a rolling window: the 48 hours before the newest frame NASA
GIBS can serve, one an hour. Run each morning and evening by the cyclone page's
jobs, so the page shows the storm as it is now, not as it was.

Output: app/public/cyclones/live.mp4 (+ poster) and app/data/live_clouds.json.
"""
import datetime
import io
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import build_cyclone_clouds as clouds  # noqa: E402

PUBLIC = os.path.join(ROOT, "app", "public", "cyclones")
OUT = os.path.join(ROOT, "app", "data", "live_clouds.json")
HOURS = 48
FPS = 8
LAG_H = 2           # GIBS posts a frame about an hour after it is taken
# Akvan crossed near Gopalpur between 02:00 and 06:30 UTC on 20 November 2026 (IMD), and was a
# low over Odisha by evening. The loop keeps its last two days at sea and the landfall.
FROZEN_END = datetime.datetime(2026, 11, 20, 12, tzinfo=datetime.timezone.utc)
FROZEN_LABEL = "Himawari-9 infrared · Akvan's last 48 hours at sea, to landfall"


def frame(t, table):
    """One hour's infrared, decoded and redrawn, or None when GIBS has not filled it."""
    path = clouds.cache_path(t)
    if not os.path.exists(path):
        try:
            data = clouds.get(clouds.frame_url(t))
            Image.open(io.BytesIO(data)).verify()
        except Exception as error:  # noqa: BLE001 - a missing hour is held from the one before
            print(f"  {clouds.stamp(t)}: {str(error)[:80]}")
            return None
        os.makedirs(clouds.CACHE, exist_ok=True)
        with open(path, "wb") as handle:
            handle.write(data)
    temp = clouds.celsius(Image.open(path), table)
    return None if np.isnan(temp).mean() > 0.2 else clouds.redraw(temp)


def main():
    newest = datetime.datetime.now(datetime.timezone.utc).replace(minute=0, second=0, microsecond=0) - datetime.timedelta(hours=LAG_H)
    if FROZEN_END:
        newest = FROZEN_END
        try:
            with open(OUT) as handle:
                published = json.load(handle)
        except (OSError, ValueError):
            published = {}
        if published.get("frames") and published["frames"][-1] == clouds.stamp(newest) and published.get("live") is False:
            print(f"  live loop frozen on the 48 hours to {published['frames'][-1]}; nothing to rebuild")
            return 0
    hours = [newest - datetime.timedelta(hours=h) for h in range(HOURS - 1, -1, -1)]
    table = clouds.colour_to_celsius()
    stamps, held, last = [], [], None
    with tempfile.TemporaryDirectory() as tmp:
        for k, t in enumerate(hours):
            rgb = frame(t, table)
            if rgb is None:
                held.append(clouds.stamp(t))
                if last is None:
                    continue
                rgb = last
            last = rgb
            Image.fromarray(rgb).save(os.path.join(tmp, f"f{len(stamps):04d}.png"))
            stamps.append(clouds.stamp(t))
        if len(stamps) < HOURS // 2:
            sys.exit(f"Only {len(stamps)} of {HOURS} hours could be drawn; the published loop is untouched.")
        os.makedirs(PUBLIC, exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", os.path.join(tmp, "f%04d.png"),
                        "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
                        os.path.join(PUBLIC, "live.mp4")], check=True)
        Image.open(os.path.join(tmp, f"f{len(stamps) - 1:04d}.png")).convert("RGB").save(os.path.join(PUBLIC, "live-poster.jpg"), quality=84)
    width, height = clouds.frame_size()
    payload = {
        "contractVersion": "1.0.0",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "source": "Himawari-9 AHI band 13 (clean infrared), Japan Meteorological Agency, via NASA GIBS",
        "width": width, "height": height, "fps": FPS, "frames": stamps, "held": held,
        "live": not FROZEN_END, "label": FROZEN_LABEL if FROZEN_END else "Himawari-9 infrared · last 48 hours",
        "outline": clouds.state_outline(),
        "video": "cyclones/live.mp4", "posterImage": "cyclones/live-poster.jpg",
    }
    with open(OUT, "w") as handle:
        json.dump(payload, handle, separators=(",", ":"))
        handle.write("\n")
    size = os.path.getsize(os.path.join(PUBLIC, "live.mp4")) / 1e6
    print(f"  live loop: {len(stamps)} hours to {stamps[-1]} ({len(held)} held), {size:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
