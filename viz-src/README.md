# Living Water Table — Crystal 3D (standalone page)

`water-crystal-3d.src.html` is the editable source for `app/public/water-crystal-3d.html`
(the finished page is fully self-contained: three.js r128 + all 632 mandals inlined,
works offline / double-clicked).

> **This source is out of date.** It has not changed since it was added on 21 July 2026, while
> the finished page has been edited directly in 40 later commits (the phone layout, the
> district view, the outlook mode, the wide glow), and the weekly refresh splices fresh data
> into it through `phase3_levels/build_crystal_data.py`.
> Edit `app/public/water-crystal-3d.html` itself; running `build.py` would roll all of that back.

Rebuild after editing the source:
```
cd viz-src && python3 build.py
```

Files:
- `water-crystal-3d.src.html` — page source (HUD, shaders, interactions); tokens
  `/*__THREE__*/` and `/*__DATA__*/` are spliced at build time
- `three.min.js` — three.js r128
- `gw_viz_data2.json` — 632 mandals: levels 2014–2027 (last 2 forecast), CGWB 2024
  stage/category, simplified polygons (from phase3_levels/gw_viz_prep.py)

Hidden URL switches for testing: `?static=1` (skip intro/auto-rotate),
`?nobloom=1` (bypass bloom), `?glow` (force the wide glow on, `?glow=1.2` sets its strength),
`?gran=district` (open in district view).
