"""Prepare a dated, reproducible film snapshot and original narrated soundtrack.

PYTHONPATH=.video-python python3 scripts/prepare_monsoon_film.py --voice
The animation and MP4 renderer consume the same manifest and voice timings.
"""
import argparse
import asyncio
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
from shapely.geometry import Polygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "app/public/films/monsoon"
TEMPO = 1.0
VOICE = "en-GB-RyanNeural"
VOICE_RATE = "-2%"
VOICE_PITCH = "+0Hz"


def speech_text(text):
    # Keep normal spelling in captions; English speech needs an explicit palatal n.
    return text.replace("El Nino", "El Neen-yo").replace("El Niño", "El Neen-yo")


def snapshot(watch, geometry, pacific):
    r, rain = watch["recharge"], watch["rainfall"]
    candidates = [m for m in watch["mandals"] if m["boundaryIndex"] is not None and m["thisSeasonM"] > 0]
    example = next((m for m in candidates if m["mandal"] == "Orvakal"), candidates[0])
    before = round(example["latestDepthM"] - example["thisSeasonM"], 2)
    assert before >= 0
    yr = watch["season"]["year"]
    latest = watch["season"]["latestMonth"]
    first = watch["season"]["preMonsoonMonth"]
    month = lambda date: __import__("datetime").datetime.strptime(date, "%Y-%m").strftime("%B")
    rain_start, rain_end = rain["months"].split("-")
    rain_window = f"{month(f'{yr}-{rain_start}')} to {month(f'{yr}-{rain_end}')}"
    rain_direction = "below" if rain["anomalyPct"] < 0 else "above"
    pct = abs(rain["anomalyPct"])
    history = watch["elNinoRainfall"]["swMonsoon"]
    scenes = [
        dict(id="connection", chapter="A connected planet", title="One ocean.\nA different monsoon.",
             voice="An ocean thousands of kilometres away can change the odds of rain in Andhra Pradesh. The connection begins in the Pacific.", source="Earth imagery: NASA Blue Marble | Conceptual introduction", minSeconds=8),
        dict(id="normal", chapter="The Pacific engine", title="The winds move\nthe warmth.",
             voice="Normally, trade winds push warm surface water towards Indonesia. Cold water rises near South America.", source="NOAA ENSO explanation | Circulation is schematic", minSeconds=7),
        dict(id="nino", chapter="El Niño / When the pattern shifts", title="Winds weaken.\nWarmth spreads east.",
             voice="El Nino is a recurring ocean and atmosphere pattern. Trade winds weaken, warmth spreads east, and tropical rainfall shifts.", source="NOAA ERSST v5 anomalies, 1991-2020 baseline | Winds and ocean section are schematic", minSeconds=8),
        dict(id="history", chapter="A pattern with a history", title="It has happened\nbefore.",
             voice="The powerful events of nineteen ninety seven to ninety eight, and twenty fifteen to sixteen, show this is a recurring pattern.", source="NOAA historical ENSO record | Selected major events; not a forecast", minSeconds=8),
        dict(id="india", chapter="The India connection", title="A shift in the sky.\nA change in the odds.",
             voice="That changes atmospheric circulation and can weaken India's summer monsoon. The Indian Ocean and local weather also shape the outcome.", source="NOAA ENSO-monsoon explanation | Schematic; no local forecast", minSeconds=8),
        dict(id="ap-history", chapter="Andhra Pradesh / 45 years of rain", title="A tendency.\nNot a certainty.",
             voice=f"In the project's {history['years']} year Andhra Pradesh record, {history['elNinoBelowNormal']} of {history['elNinoYears']} El Nino summer monsoons had below average rain. Individual years varied widely.", source=f"CHIRPS project analysis | June-September, {history['firstYear']}-{history['lastYear']} | Historical association", minSeconds=10),
        dict(id="rain", chapter="Andhra Pradesh / rainfall", title="What fell\nover Andhra Pradesh?",
             voice=f"In this project's {rain_window} {yr} snapshot, Andhra Pradesh rainfall was {pct} percent {rain_direction} its historical average.", source=f"Project CHIRPS v2.0 summary | {rain_window} {yr} | Baseline {rain['firstYear']}-{yr}", minSeconds=8),
        dict(id="recharge", chapter="From rain to groundwater", title="The journey\nbelow the surface.",
             voice="Some rain seeps through soil and rock, replenishing groundwater. Pumping and geology change how much water remains.", source="AI-generated geological illustration | Flow is schematic; not a surveyed site", minSeconds=8),
        dict(id="mandals", chapter="Andhra Pradesh / well readings", title="The wells tell\nthe local story.",
             voice=f"By {month(latest)}, {r['fallingPct']} percent of monitored mandals had deeper water levels than in {month(first)}. These are observations, not an El Nino forecast.", source=f"Project APWRIMS series | {month(first)} to {month(latest)} {yr} | Public prototype boundaries", minSeconds=9),
        dict(id="districts", chapter="Districts / change against own history", title="One state.\nUneven shortfalls.",
             voice="Districts show different groundwater shortfalls against their own normal seasons. These are medians of local observations, not predictions of the next season.", source=f"Well change: {first} to {latest} | Rain history: El Nino June-September, 1981-2025", minSeconds=9),
        dict(id="well", chapter=f"A closer look / {example['mandal']}", title="Deeper water.\nA longer reach.",
             voice=f"In {example['mandal']}, depth to water increased from {before} to {example['latestDepthM']} metres, instead of its usual seasonal rise. Deeper means farther below ground.", source=f"{example['mandal']}, {example['district']} | {first} to {latest} | AI illustration, not site imagery", minSeconds=9),
        dict(id="outlook", chapter="Possible outcomes / conditional", title="Less recharge.\nMore pressure on wells.",
             voice="If rainfall stays low and pumping continues, recharge can weaken and drought risk can rise. Local forecasts need more than the Pacific index.", source="Conditional risk, not a local forecast or drought declaration | AI illustration", minSeconds=9),
        dict(id="prepare", chapter="Preparedness / homes, farms and communities", title="Conserve today.\nPrepare for a dry spell.",
             voice="Prepare for a possible dry spell. Fix leaks and protect drinking water. Capture rain safely. Use drip irrigation and mulch where suitable, guided by crop needs. Track wells and storage, and agree a village contingency plan with local teams.", source="NIDM / ICAR / Jal Shakti guidance | AI illustration | Local advice, not a drought forecast", minSeconds=17),
        dict(id="cities", chapter="Cities / reduce the impact", title="Cities cannot stop El Niño.\nThey can reduce water stress.",
             voice="Cities cannot stop El Nino. They can reduce water stress. Repair leaking mains. Reuse safely treated water for non-drinking needs. Protect lakes and rainwater systems. Plan essential supplies with local water teams.", source="MoHUA AMRUT 2.0 / NIDM guidance | AI urban illustration, not completed works", minSeconds=18),
        dict(id="close", chapter="A proposed state review", title="Protect supplies.\nReview local evidence.",
             voice="For a state review, verify local readings, identify priority water supplies, and assign teams to track action. El Nino is climate context, not a mandal forecast.", source=f"Proposed review, not an official directive | Project snapshot: {latest} | Synthetic narration", minSeconds=10),
    ]
    placed = {m["boundaryIndex"]: m for m in watch["mandals"] if m["boundaryIndex"] is not None}
    shapes = [dict(rings=m["rings"], district=m["d"], mandal=m["m"], shortfall=placed[i]["shortfallM"] if i in placed else None,
                   measured=i in placed, example=i == example["boundaryIndex"]) for i,m in enumerate(geometry["mandals"])]
    district_shapes = []
    for name in sorted({m["d"] for m in geometry["mandals"]}):
        polygons = [Polygon(r).buffer(0) for m in geometry["mandals"] if m["d"] == name for r in m["rings"]]
        merged = unary_union(polygons)
        parts = list(merged.geoms) if merged.geom_type == "MultiPolygon" else [merged]
        point = merged.representative_point()
        district_shapes.append(dict(district=name, center=[point.x,point.y],
                                    rings=[list(p.exterior.coords) for p in parts]))
    source_hash = hashlib.sha256(json.dumps({"watch":watch,"geometry":geometry,"pacific":pacific}, sort_keys=True).encode()).hexdigest()
    return dict(version=1, snapshot=latest, sourceHash=source_hash, title="From the Pacific to Andhra Pradesh",
                scenes=scenes, rain=rain, recharge=r, example={**example,"beforeDepthM":before},
                season=watch["season"], bbox=geometry["bbox"], shapes=shapes, districtShapes=district_shapes, pacific=pacific,
                history=history,districts=watch["districts"],
                sources=[
                    {"label":"NOAA: ENSO and the Indian monsoon","url":"https://www.climate.gov/news-features/blogs/enso/enso-and-indian-monsoon%E2%80%A6-not-straightforward-you%E2%80%99d-think"},
                    {"label":"NASA Blue Marble","url":"https://visibleearth.nasa.gov/collection/1484/blue-marble"},
                    {"label":"NOAA: major historical El Nino events","url":"https://www.climate.gov/news-features/understanding-climate/2015-state-climate-el-ni%C3%B1o-came-saw-and-conquered"},
                    {"label":"NOAA ERSST v5","url":"https://psl.noaa.gov/data/gridded/data.noaa.ersst.v5.html"},
                    {"label":"CHIRPS","url":rain["source"]},
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


def vtt(data):
    def stamp(t):
        return f"{int(t)//3600:02}:{int(t)//60%60:02}:{t%60:06.3f}"
    cues=["WEBVTT\n"]
    for s in data["scenes"]:
        cues.append(f"{stamp(s['start'])} --> {stamp(s['start']+s['duration'])}\n{s['voice']}\n")
    (OUT/"captions.vtt").write_text("\n".join(cues))


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--voice",action="store_true")
    args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    watch=json.loads((ROOT/"app/data/monsoon_watch.json").read_text())
    geo=json.loads((ROOT/"app/data/ap_map_geometry.json").read_text())
    pac=json.loads((ROOT/"app/data/enso_pacific.json").read_text())
    data=snapshot(watch,geo,pac)
    shutil.copy(ROOT/"viz-src/three.min.js",OUT/"three.min.js")
    cache=Path(tempfile.gettempdir())/"ap-gw-video-assets/blue_marble.jpg"
    if cache.exists():
        shutil.copy(cache,OUT/"earth.jpg")
    elif not (OUT/"earth.jpg").exists():
        subprocess.run(["curl","-fL","https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg","-o",str(OUT/"earth.jpg")],check=True)
    if args.voice:
        asyncio.run(narrate(data))
        soundtrack(data)
    else:
        cursor=0
        for s in data["scenes"]:
            s.update(start=cursor,duration=s["minSeconds"],speechDuration=s["minSeconds"]-.7)
            cursor+=s["duration"]
        data["duration"]=cursor
    vtt(data)
    (OUT/"manifest.json").write_text(json.dumps(data,separators=(",",":")))
    metadata={"title":data["title"],"snapshot":data["snapshot"],"sourceHash":data["sourceHash"],"duration":data["duration"],
              "chapters":[{"id":s["id"],"title":s["chapter"],"start":s["start"],"text":s["voice"]} for s in data["scenes"]],"sources":data["sources"]}
    (ROOT/"app/data/monsoon_film.json").write_text(json.dumps(metadata,indent=2))
    print(f"Prepared {data['duration']:.1f}s film for snapshot {data['snapshot']}")


if __name__ == "__main__":
    main()
