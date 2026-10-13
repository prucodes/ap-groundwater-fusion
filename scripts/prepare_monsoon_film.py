"""Prepare a dated, reproducible film snapshot and original narrated soundtrack.

PYTHONPATH=.video-python python3 scripts/prepare_monsoon_film.py --voice
The animation and MP4 renderer consume the same manifest and voice timings.
"""
import argparse
import asyncio
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
import shutil
import subprocess
import tempfile
from shapely.geometry import Polygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "app/public/films/monsoon"
TEMPO = 1.0
VOICE = "en-IN-PrabhatNeural"
VOICE_RATE = "+0%"
VOICE_PITCH = "+0Hz"

DATA_FILES = {
    "watch": "monsoon_watch.json", "geometry": "ap_map_display.json", "pacific": "enso_pacific.json",
    "ocean": "enso_outlook.json", "stateWells": "gw_state_summary.json",
    "summer": "summer_outlook.json", "drought": "drought_watch_summary.json",
}


def load_inputs():
    return {key: json.loads((ROOT / "app/data" / name).read_text()) for key, name in DATA_FILES.items()}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=True).encode()).hexdigest()


def design_tokens():
    """Read the site's source tokens; fail closed if their declarations change."""
    css = (ROOT / "app/app/globals.css").read_text()
    band = re.search(r"--band-navy:\s*([^;]+);", css).group(1)
    data = (ROOT / "app/lib/data.ts").read_text()
    ramp = re.search(r"export const SEQ_RAMP\s*=\s*\{(.*?)\}\s*as const", data, re.S).group(1)
    drought = (ROOT / "app/lib/drought.ts").read_text().split("export const CATEGORY_META", 1)[1].split("\n};", 1)[0]
    categories = {}
    for match in re.finditer(r'(?:"([\w|]+)"|(\w+)):\s*\{\s*label:\s*"([^"]+)".*?color:\s*"(#[\da-fA-F]+)"', drought):
        categories[match[1] or match[2]] = {"label": match[3], "color": match[4]}
    assert len(categories) == 7
    colors = {name: re.search(rf"--{name}:\s*(#[\da-fA-F]+)", css).group(1)
              for name in ("navy", "navy-2", "deep-navy", "teal", "cyan", "green", "amber", "rust")}
    return dict(band=re.findall(r"#[\da-fA-F]{6}", band), colors=colors,
                seq={mode: re.findall(r"#[\da-fA-F]{6}", re.search(rf"{mode}:\s*\[([^]]+)\]", ramp)[1]) for mode in ("light", "dark")},
                drought=categories)


def current_source_hashes(inputs=None):
    inputs = inputs or load_inputs()
    return {**{f"app/data/{DATA_FILES[key]}": digest(value) for key, value in inputs.items()},
            "siteDesignTokens": digest(design_tokens())}


def speech_text(text):
    # Keep normal spelling in captions; English speech needs an explicit palatal n.
    return text.replace("El Nino", "El Neen-yo").replace("El Niño", "El Neen-yo")


def narrated_figures(data):
    """The measurements a fixed edition of the film speaks aloud."""
    rain, history = data["rain"], data["history"]
    result = {"rainProduct": rain.get("product", "CHIRPS").split(" monthly")[0], "rainMonths": rain["months"],
            "rainAnomalyPct": rain["anomalyPct"], "elNinoBelowNormal": history["elNinoBelowNormal"],
            "elNinoYears": history["elNinoYears"], "fallingPct": data["recharge"]["fallingPct"]}
    if "ocean" not in data:
        return result
    result.update(
        year=data["season"]["year"], latestMonth=data["season"]["latestMonth"],
        rainRank=rain["rankDriest"], rainYears=rain["ofYears"], rainMm=rain["mm"], rainNormalMm=rain["normalMm"],
        historyMeanPct=history["elNinoAnomalyPct"],
        falling=data["recharge"]["falling"], compared=data["recharge"]["mandals"], shortOfNormalPct=data["recharge"]["shortOfNormalPct"],
        well={key: data["example"][key] for key in ("latestDepthM", "thisSeasonM", "typicalM")},
        oni={key: data["enso"][key] for key in ("asOf", "season", "oniC", "strength")},
        ocean={key: data["ocean"][key] for key in ("issued", "index", "peak", "synopsis")},
        northeast={key: data["northeast"][key] for key in ("elNinoYears", "elNinoBelowNormal", "elNinoAnomalyPct", "firstYear", "lastYear")},
        stateWells=data["stateWells"]["state"],
        summer={"anchor": data["summer"]["anchor"], "targetMay": data["summer"]["targetMay"],
                "beyond": data["summer"]["summary"]["beyond"], "beyondDeep": data["summer"]["summary"]["beyondDeep"],
                "people": data["summer"]["people"]["beyondDeep"], "backtest": data["summer"]["backtest"]},
        drought={"asOf": data["drought"]["season"]["asOf"], "trigger1": data["drought"]["state"]["trigger1"], "counts": data["drought"]["state"]["counts"]})
    return result


def snapshot(watch, geometry, pacific, **extras):
    if not extras:
        extras = {key: value for key, value in load_inputs().items() if key not in ("watch", "geometry", "pacific")}
    r, rain = watch["recharge"], watch["rainfall"]
    candidates = [m for m in watch["mandals"] if m["boundaryIndex"] is not None and m["thisSeasonM"] > 0]
    example = next((m for m in candidates if m["mandal"] == "Orvakal"), candidates[0])
    before = round(example["latestDepthM"] - example["thisSeasonM"], 2)
    assert before >= 0
    yr = watch["season"]["year"]
    latest = watch["season"]["latestMonth"]
    first = watch["season"]["preMonsoonMonth"]
    month = lambda date: datetime.strptime(date, "%Y-%m").strftime("%B")
    rain_start, rain_end = rain["months"].split("-")
    rain_window = f"{month(f'{yr}-{rain_start}')} to {month(f'{yr}-{rain_end}')}"
    rain_direction = "below" if rain["anomalyPct"] < 0 else "above"
    pct = abs(rain["anomalyPct"])
    history = watch["elNinoRainfall"]["swMonsoon"]
    ne = watch["elNinoRainfall"]["neMonsoon"]
    ocean, state, summer, drought = (extras[key] for key in ("ocean", "stateWells", "summer", "drought"))
    product = rain.get("product", "CHIRPS").split(" monthly")[0]
    bounds = "Rebuilt State outlines + prototype fallback; not certified boundaries"
    scenes = [
        dict(id="connection", chapter="A connected planet", title="One ocean.\nA different monsoon.",
             voice="Andhra Pradesh's monsoon has a distant connection: the Pacific Ocean.", source="Earth imagery: NASA Blue Marble | Conceptual introduction", minSeconds=5),
        dict(id="normal", chapter="The Pacific engine", title="The winds move\nthe warmth.",
             voice="Normally, trade winds push warm surface water towards Indonesia. Cold water rises near South America.", source="NOAA ENSO explanation | Circulation is schematic", minSeconds=7),
        dict(id="nino", chapter="El Niño / When the pattern shifts", title="Winds weaken.\nWarmth spreads east.",
             voice="During El Nino, trade winds weaken. Warmth spreads east and tropical rainfall shifts.", source=f"NOAA ERSST v5 through {pacific['months'][-1]['month']} | 1991-2020 baseline | Winds schematic", minSeconds=6),
        dict(id="history", chapter="A pattern with a history", title="It has happened\nbefore.",
             voice="Major events include nineteen ninety seven and twenty fifteen.", source="NOAA historical ENSO record | 1997-98 and 2015-16", minSeconds=4),
        dict(id="ocean", chapter="The ocean now / observed and forecast", title="The Pacific outlook.\nNot AP's rainfall outlook.",
             voice=f"NOAA's July to September ocean index is plus {watch['enso']['oniC']} degrees. Its October eighth outlook projects a relative-index peak of {ocean['peak']['medianC']} degrees. Strong to very strong conditions remain over eighty three percent likely through March. This is not an Andhra Pradesh rainfall forecast.",
             source=f"NOAA CPC | Observed ONI: Jul-Sep {yr} | Forecast RONI: issued {ocean['issued']} | Different indices", minSeconds=17),
        dict(id="india", chapter="The India connection", title="A shift in the sky.\nA change in the odds.",
             voice="India's summer monsoon can weaken. The Indian Ocean and local weather also matter.", source="NOAA ENSO-monsoon explanation | Schematic; no local rainfall forecast", minSeconds=6),
        dict(id="ap-history", chapter="Andhra Pradesh / 45 years of rain", title="A tendency.\nNot a certainty.",
             voice=f"{history['elNinoBelowNormal']} of {history['elNinoYears']} El Nino summer monsoons were below average in Andhra Pradesh, averaging {abs(history['elNinoAnomalyPct']):g} percent below.", source=f"{product} project analysis | June-September, {history['firstYear']}-{history['lastYear']} | Historical association", minSeconds=8),
        dict(id="rain", chapter="Andhra Pradesh / rainfall", title="What fell\nover Andhra Pradesh?",
             voice=f"{rain_window} {yr} rainfall was {pct} percent {rain_direction} average. Rank {rain['rankDriest']} driest in {rain['ofYears']} years.", source=f"{product} | {rain_window} {yr} | Comparison {rain['firstYear']}-{yr}", minSeconds=8),
        dict(id="northeast", chapter="October-December / northeast monsoon", title="A new season.\nToo early to judge.",
             voice=f"Historically, El Nino northeast monsoons averaged {abs(ne['elNinoAnomalyPct'])} percent below normal: {ne['elNinoBelowNormal']} of {ne['elNinoYears']} years. The north coast fared worst. This season has only just begun.",
             source=f"{product} project analysis | Oct-Dec, {ne['firstYear']}-{ne['lastYear']} | History, not an AP forecast", minSeconds=10),
        dict(id="recharge", chapter="From rain to groundwater", title="The journey\nbelow the surface.",
             voice="Rain infiltrates soil and fractured rock. Pumping and geology shape what remains.", source="AI-generated geological illustration | Flow is schematic; not a surveyed site", minSeconds=6),
        dict(id="mandals", chapter="Andhra Pradesh / well readings", title="The wells tell\nthe local story.",
             voice=f"By {month(latest)}, {r['fallingPct']} percent of compared mandals were deeper than in May. {r['shortOfNormalPct']} percent were short of their own ten year normal.", source=f"APWRIMS project series | {first} to {latest} | {bounds}", minSeconds=10),
        dict(id="districts", chapter="Districts / change against own history", title="One state.\nUneven shortfalls.",
             voice="District shortfalls differ. These are medians of observations, not predictions.", source=f"APWRIMS project series: {first} to {latest} | CHIRPS v3 history: 1981-2025", minSeconds=5),
        dict(id="state-wells", chapter="The State's own wells / measured snapshot", title="The network reads\ndeeper water.",
             voice=f"The State's {state['state']['stations']} station network reads {state['state']['currentM']} metres below ground on September ninth, {state['state']['vsYearAgoM']} metres deeper than a year earlier.",
             source=f"AP AWARE State groundwater feed | {state['state']['date']} | Latest-reading aggregate, not a monthly mean", minSeconds=10),
        dict(id="well", chapter=f"A closer look / {example['mandal']}", title="Deeper water.\nA longer reach.",
             voice=f"Orvakal reads {example['latestDepthM']} metres. Water is {example['thisSeasonM']} metres deeper this season, instead of its usual {abs(example['typicalM'])} metre rise.", source=f"APWRIMS | {example['mandal']}, {example['district']} | {first} to {latest} | AI illustration, not site imagery", minSeconds=9),
        dict(id="outlook", chapter="Possible outcomes / conditional", title="Less recharge.\nMore pressure on wells.",
             voice="Less recharge and continued pumping can increase pressure on wells.", source="Conditional risk, not a rainfall forecast or drought declaration | AI illustration", minSeconds=5),
        dict(id="summer", chapter="May 2027 / projection from past winters", title="A summer projection.\nWith a track record.",
             voice=f"Past winters project {summer['summary']['beyond']} mandals beyond their deepest May. {summer['summary']['beyondDeep']} are already over ten metres deep, home to about sixty seven lakh people in twenty twenty. Historically, only {summer['backtest']['pastRecordPct']['beyond']} percent of beyond-record calls materialised.",
             source=f"Project summer outlook | Anchor {summer['anchor']} to {summer['targetMay']} | WorldPop 2020 | Not an AP rainfall forecast", minSeconds=16),
        dict(id="drought", chapter="Drought manual / evidence as of " + drought['season']['asOf'], title="Evidence for review.\nNot a declaration.",
             voice=f"As of October tenth, {drought['state']['trigger1']} mandals meet the rainfall trigger. {drought['state']['counts']['severe']} read severe, {drought['state']['counts']['moderate']} moderate. This is manual evidence, not a drought declaration.",
             source=f"Project screening against DA&FW Drought Manual 2020 | {drought['season']['asOf']} | Incomplete indicators retained", minSeconds=10),
        dict(id="prepare", chapter="Preparedness / homes, farms and communities", title="Conserve today.\nPrepare for a dry spell.",
             voice="For a possible dry spell: protect drinking water. Use drip irrigation and mulch where suitable. Agree a village contingency plan with local teams.", source="NIDM / ICAR / Jal Shakti guidance | AI illustration | Local advice, not a drought forecast", minSeconds=10),
        dict(id="cities", chapter="Cities / reduce the impact", title="Cities cannot stop El Niño.\nThey can reduce water stress.",
             voice="Cities cannot stop El Nino. Repair mains. Reuse safely treated water for non-drinking needs. Protect lakes and essential supplies.", source="MoHUA AMRUT 2.0 / NIDM guidance | AI urban illustration, not completed works", minSeconds=9),
        dict(id="close", chapter="A proposed state review", title="Protect supplies.\nReview local evidence.",
             voice="Read observations, NOAA's Pacific forecast, and the summer projection separately. None forecasts Andhra Pradesh rainfall. Verify locally. Assign action.", source=f"Proposed review, not an official directive | Well snapshot: {latest} | Synthetic narration; review pending", minSeconds=9),
    ]
    by_boundary = {}
    for m in watch["mandals"]:
        if m["boundaryIndex"] is not None:
            by_boundary.setdefault(m["boundaryIndex"], []).append(m)
    # Ambiguous joins are missing evidence, not permission to pick the last record.
    placed = {i: rows[0] for i, rows in by_boundary.items() if len(rows) == 1}
    assert len(summer["mandals"]) == len(drought["categories"]) == len(geometry["mandals"])
    shapes = [dict(rings=m["rings"], district=m["d"], mandal=m["m"], shortfall=placed[i]["shortfallM"] if i in placed else None,
                   boundarySource=m.get("src", "prototype"), drought=drought["categories"][i], summer=summer["mandals"][i],
                   measured=i in placed, example=i == example["boundaryIndex"]) for i,m in enumerate(geometry["mandals"])]
    district_shapes = []
    for name in sorted({m["d"] for m in geometry["mandals"]}):
        polygons = [Polygon(r).buffer(0) for m in geometry["mandals"] if m["d"] == name for r in m["rings"]]
        merged = unary_union(polygons)
        parts = list(merged.geoms) if merged.geom_type == "MultiPolygon" else [merged]
        point = merged.representative_point()
        district_shapes.append(dict(district=name, center=[point.x,point.y],
                                    rings=[list(p.exterior.coords) for p in parts]))
    hashes = current_source_hashes(dict(watch=watch, geometry=geometry, pacific=pacific, **extras))
    return dict(version=2, snapshot=latest, edition=watch["generatedAt"][:10], preparedAt=datetime.now(timezone.utc).isoformat(), sourceHash=digest(hashes), sourceHashes=hashes,
                design=design_tokens(), review={"status": "pending-native-speaker-review", "publishApproved": False},
                title="From the Pacific to Andhra Pradesh",
                scenes=scenes, rain=rain, recharge=r, example={**example,"beforeDepthM":before},
                season=watch["season"], bbox=geometry["bbox"], shapes=shapes, districtShapes=district_shapes, pacific=pacific,
                history=history, northeast=ne, enso=watch["enso"], districts=watch["districts"], **extras,
                sources=[
                    {"label":"NOAA: ENSO and the Indian monsoon","url":"https://www.climate.gov/news-features/blogs/enso/enso-and-indian-monsoon%E2%80%A6-not-straightforward-you%E2%80%99d-think"},
                    {"label":"NASA Blue Marble","url":"https://visibleearth.nasa.gov/collection/1484/blue-marble"},
                    {"label":"NOAA: major historical El Nino events","url":"https://www.climate.gov/news-features/understanding-climate/2015-state-climate-el-ni%C3%B1o-came-saw-and-conquered"},
                    {"label":"NOAA ERSST v5","url":"https://psl.noaa.gov/data/gridded/data.noaa.ersst.v5.html"},
                    {"label":"CHIRPS","url":rain["source"]},
                    {"label":"NOAA CPC: Pacific outlook (RONI)","url":ocean["urls"]["discussion"]},
                    {"label":"NOAA CPC: observed ONI","url":watch["enso"]["source"]},
                    {"label":"State groundwater network","url":"https://prucodes.github.io/ap-groundwater-fusion/monsoon/#monsoon-film-title"},
                    {"label":"Summer projection and track record","url":"https://prucodes.github.io/ap-groundwater-fusion/summer/"},
                    {"label":"Drought Manual 2020","url":drought["manual"]["url"]},
                    {"label":"NIDM: drought preparedness and water conservation","url":"https://www.nidm.gov.in/PDF/IEC/CZ_NIDM25.pdf"},
                    {"label":"NIDM: drought management and drinking-water contingency plans","url":"https://nidm.gov.in/PDF/manuals/Drought_Manual.pdf"},
                    {"label":"ICAR: water-smart irrigation and mulching","url":"https://icar.gov.in/sites/default/files/2025-11/December_2025%20Indian%20Farming.pdf"},
                    {"label":"Jal Shakti: Catch the Rain","url":"https://jsactr.mowr.gov.in/website/index.aspx"},
                    {"label":"MoHUA: AMRUT 2.0 urban water security","url":"https://www.mohua.gov.in/upload/uploadfiles/files/AMRUT-Operational-Guidelines.pdf"},
                    {"label":"Project snapshot and methodology","url":"https://prucodes.github.io/ap-groundwater-fusion/monsoon/"}])


def duration(path):
    return float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",str(path)]))


async def narrate(data):
    import edge_tts
    cursor = 0
    for i, s in enumerate(data["scenes"]):
        audio = OUT / f"voice-{i:02d}.mp3"
        spoken = speech_text(s["voice"])
        key = hashlib.sha256(json.dumps([spoken, VOICE, VOICE_RATE, VOICE_PITCH]).encode()).hexdigest()
        stamp = OUT / f"voice-{i:02d}.sha256"
        marks = OUT / f"voice-{i:02d}.jsonl"
        needs_marks = s["id"] in ("normal", "connection")
        if not audio.exists() or not stamp.exists() or stamp.read_text() != key or (needs_marks and not marks.exists()):
            await edge_tts.Communicate(spoken, VOICE, rate=VOICE_RATE, pitch=VOICE_PITCH,
                                       boundary="WordBoundary").save(str(audio), str(marks))
            stamp.write_text(key)
        if needs_marks:
            words = [json.loads(line) for line in marks.read_text().splitlines()]
            def at(word):
                match = next(w for w in words if w["text"].strip(".,").lower() == word)
                return round(.35 + match["offset"] / 10_000_000 / TEMPO, 3)
            if s["id"] == "normal":
                s["locationCues"] = [dict(label="INDONESIA", lon=120, lat=-3, time=at("indonesia")),
                                     dict(label="SOUTH AMERICA", lon=-78, lat=-8, time=at("south"))]
                s["captionCues"] = [dict(time=.35, text=s["voice"].split(". ")[0] + "."),
                                     dict(time=at("cold"), text=s["voice"].split(". ")[1])]
            else:
                s["locationCues"] = [dict(label="ANDHRA PRADESH", lon=80.6, lat=16.4, time=at("andhra")),
                                     dict(label="PACIFIC OCEAN", lon=195, lat=0, time=at("pacific"))]
        length = duration(audio) / TEMPO
        s.update(start=round(cursor,3), duration=round(max(s["minSeconds"],length+1.0),3), speechDuration=length)
        cursor += s["duration"]
        print(f"Scene {i+1}: {s['duration']:.1f}s",flush=True)
    data["duration"] = round(cursor,3)
    data["narration"] = dict(voice=VOICE, rate=VOICE_RATE, pitch=VOICE_PITCH, tempo=TEMPO,
                             pronunciation={"El Nino":"El Neen-yo"}, synthetic=True)


def soundtrack(data):
    args = ["ffmpeg","-v","error","-y"]
    for i in range(len(data["scenes"])):
        args.extend(["-i",str(OUT/f"voice-{i:02d}.mp3")])
    total = data["duration"]
    n = len(data["scenes"])
    args.extend(["-f","lavfi","-i",f"sine=f=110:d={total}","-f","lavfi","-i",f"sine=f=164.81:d={total}","-f","lavfi","-i",f"anoisesrc=d={total}:c=pink:a=0.02:seed=27"])
    filters=[]
    for i,s in enumerate(data["scenes"]):
        filters.append(f"[{i}:a]atempo={TEMPO},adelay={int((s['start']+.35)*1000)}:all=1[v{i}]")
    filters += [f"[{n}:a]volume=0.05,afade=t=in:d=3[tone]",f"[{n+1}:a]volume=0.025[fifth]",f"[{n+2}:a]lowpass=f=800,volume=0.10[air]"]
    filters.append("".join(f"[v{i}]" for i in range(n))+f"[tone][fifth][air]amix=inputs={n+3}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=9,afade=t=out:st={total-1}:d=1[mix]")
    args += ["-filter_complex",";".join(filters),"-map","[mix]","-t",str(total),"-c:a","aac","-b:a","192k",str(OUT/"narration.m4a")]
    subprocess.run(args,check=True)


def narrate_local_review(data):
    """Explicitly opt-in offline rough voice. Never label this as the requested neural voice."""
    cursor = 0
    locations = {"normal": [("Indonesia", "INDONESIA", 120, -3), ("South America", "SOUTH AMERICA", -78, -8)],
                 "connection": [("Andhra Pradesh", "ANDHRA PRADESH", 80.6, 16.4), ("Pacific", "PACIFIC OCEAN", 195, 0)]}
    with tempfile.TemporaryDirectory(prefix="monsoon-review-voice-") as tmp:
        for i, scene in enumerate(data["scenes"]):
            pattern = "|".join(re.escape(item[0]) for item in locations.get(scene["id"], []))
            # Location words start their own audio chunk, giving actual audio-derived cues.
            chunks = re.split(rf"(?={pattern})", scene["voice"]) if pattern else [scene["voice"]]
            chunks = [chunk.strip() for chunk in chunks if chunk.strip()]
            files, offset, cues = [], 0., []
            for j, chunk in enumerate(chunks):
                audio = Path(tmp) / f"{i}-{j}.aiff"
                subprocess.run(["say", "-v", "Rishi", "-r", "165", "-o", str(audio), speech_text(chunk)], check=True)
                for phrase, label, lon, lat in locations.get(scene["id"], []):
                    if chunk.startswith(phrase):
                        cues.append(dict(label=label, lon=lon, lat=lat, time=round(.35+offset, 3)))
                offset += duration(audio)
                files.append(audio)
            concat = Path(tmp) / "concat.txt"
            concat.write_text("\n".join(f"file '{path}'" for path in files))
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(concat),
                            "-c:a", "libmp3lame", "-b:a", "192k", str(OUT/f"voice-{i:02d}.mp3")], check=True)
            # Invalidate any cached Edge audio stamp: the next neural run must not reuse this voice.
            (OUT/f"voice-{i:02d}.sha256").unlink(missing_ok=True)
            length = duration(OUT/f"voice-{i:02d}.mp3")
            scene.update(start=round(cursor, 3), duration=round(max(scene["minSeconds"], length+1), 3), speechDuration=length)
            if cues:
                scene["locationCues"] = cues
                scene["locationTimingSource"] = "audio-chunk-boundary"
            cursor += scene["duration"]
            print(f"Local review scene {i+1}: {scene['duration']:.1f}s", flush=True)
    data["duration"] = round(cursor, 3)
    data["narration"] = dict(voice="macOS Rishi (en-IN)", requestedVoice=VOICE, synthetic=True,
                             status="temporary-local-review", rateWpm=165, tempo=1.0)
    data["review"]["status"] = "temporary-voice-and-native-review-pending"


def vtt(data):
    def stamp(t):
        return f"{int(t)//3600:02}:{int(t)//60%60:02}:{t%60:06.3f}"
    cues=["WEBVTT\n"]
    for s in data["scenes"]:
        cues.append(f"{stamp(s['start'])} --> {stamp(s['start']+s['duration'])}\n{s['voice']}\n")
    (OUT/"captions.vtt").write_text("\n".join(cues))


def main():
    global VOICE
    parser=argparse.ArgumentParser()
    parser.add_argument("--voice",action="store_true")
    parser.add_argument("--check-sources", action="store_true", help="Fail if app/data or site colour tokens changed after preparation")
    parser.add_argument("--voice-name", default=VOICE)
    parser.add_argument("--local-review-voice", action="store_true")
    args=parser.parse_args()
    VOICE = args.voice_name
    if args.check_sources:
        saved = json.loads((OUT / "manifest.json").read_text())
        assert saved["sourceHashes"] == current_source_hashes(), "Film sources changed: re-prepare and re-render both formats"
        print("Film source snapshot matches current app/data and site tokens")
        return
    if not (args.voice or args.local_review_voice):
        parser.error("Choose --voice or --local-review-voice; never replace film metadata without matching narration")
    OUT.mkdir(parents=True,exist_ok=True)
    data=snapshot(**load_inputs())
    shutil.copy(ROOT/"viz-src/three.min.js",OUT/"three.min.js")
    cache=Path(tempfile.gettempdir())/"ap-gw-video-assets/blue_marble.jpg"
    if cache.exists():
        shutil.copy(cache,OUT/"earth.jpg")
    elif not (OUT/"earth.jpg").exists():
        subprocess.run(["curl","-fL","https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg","-o",str(OUT/"earth.jpg")],check=True)
    if args.voice or args.local_review_voice:
        if args.local_review_voice:
            narrate_local_review(data)
        else:
            asyncio.run(narrate(data))
        assert data["duration"] <= 210, f"Edit the script, not the playback speed: {data['duration']:.1f}s exceeds 3:30"
        soundtrack(data)
    vtt(data)
    (OUT/"manifest.json").write_text(json.dumps(data,separators=(",",":")))
    metadata={"title":data["title"],"snapshot":data["snapshot"],"edition":data["edition"],"review":data["review"],"sourceHash":data["sourceHash"],"duration":data["duration"],
              # The figures the narration speaks, so the page can say where the
              # live record has since moved away from this fixed edition.
              "narrated":narrated_figures(data),
              "chapters":[{"id":s["id"],"title":s["chapter"],"start":s["start"],"text":s["voice"]} for s in data["scenes"]],"sources":data["sources"]}
    (ROOT/"app/data/monsoon_film.json").write_text(json.dumps(metadata,indent=2))
    (OUT/"chapters.json").write_text(json.dumps(metadata["chapters"], indent=2))
    (OUT/"transcript.txt").write_text("\n\n".join(f"{s['start']:.3f}s | {s['chapter']}\n{s['voice']}\nSource: {s['source']}" for s in data["scenes"]) + "\n")
    print(f"Prepared {data['duration']:.1f}s film for snapshot {data['snapshot']}")


if __name__ == "__main__":
    main()
