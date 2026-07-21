# Sentinel-1 InSAR subsidence pipeline (research asset)

End-to-end pipeline to test whether Sentinel-1 InSAR land subsidence can improve
mandal groundwater estimates / reach sensorless mandals. **Built and validated;
finding: weak groundwater coupling in AP's deltas (r=0.27) — not adopted into
production, but re-runnable for other regions/AOIs.**

## Why (the hypothesis)
Over-pumping compacts aquifers → the ground sinks (mm/yr). In arid confined-aquifer
basins this tracks groundwater change with >80% correlation. We tested if it holds
for Andhra Pradesh.

## Pipeline (in order)
| Script | What it does |
|---|---|
| `submit_insar_jobs.py` | ASF search (Sentinel-1 SLC, one coherent track/frame) → submit consecutive-pair `INSAR_GAMMA` jobs to ASF HyP3 → `insar/hyp3_jobs.json` |
| `poll_and_download_insar.py` | Poll HyP3 until jobs finish → download products → `insar/products/*.zip` |
| `build_insar_subsidence.py` | Unzip → chain LOS-displacement rasters (SBAS-style) → sample at mandal centroids → per-mandal velocity → `data/mandal_insar_subsidence.csv`; validates vs our decline flags |

## Auth
NASA **Earthdata** login. HyP3 REST API + product downloads accept an Earthdata
**bearer token**: `export EDL_TOKEN='<token>'` (from urs.earthdata.nasa.gov →
Applications → Generate Token). Tokens last ~60 days. `asf_search`, `hyp3_sdk`
installed via pip.

## Re-run
```bash
export EDL_TOKEN='...'
python3 submit_insar_jobs.py          # submits ~13 jobs (~15 credits each; 8000 available)
python3 poll_and_download_insar.py    # ~1-2 h processing, then downloads ~1.9 GB
python3 build_insar_subsidence.py     # -> data/mandal_insar_subsidence.csv + validation
```
To cover a different AOI, edit `intersectsWith` / `relativeOrbit` in
`submit_insar_jobs.py` (one Sentinel-1 frame ≈ 250×170 km ≈ ~30 mandals).

## Result (delta frame: Eluru/Krishna/W.Godavari, track 92 frame 536, 2023–2026)
- 13 interferograms, 32 mandals covered, subsidence −29 to +57 mm/yr.
- **Correlation with groundwater deepening trend: r = 0.27 (weak).**
- **Why weak in AP:** wet vegetated deltas → poor C-band coherence (only 25/32 usable);
  delta subsidence is driven by sediment compaction, tectonics & loading, not just
  groundwater. The literature's strong results are arid, thick confined aquifers.
- **Conclusion:** InSAR is a genuine physical signal but does not cleanly track
  groundwater in AP's accessible terrain. Documented; not wired into the model.

## Where it *would* help (future)
Best in arid, thick-alluvium confined-aquifer basins with severe over-draft and
sparse vegetation (better C-band coherence). Worth revisiting with L-band NISAR
(2024+ launch) which coheres far better over vegetation.
