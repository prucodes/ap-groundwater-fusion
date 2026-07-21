#!/usr/bin/env python3
"""Rebuild app/public/water-crystal-3d.html from source. Run from viz-src/."""
src = open("water-crystal-3d.src.html").read()
out = src.replace("/*__THREE__*/", open("three.min.js").read(), 1) \
         .replace("/*__DATA__*/", open("gw_viz_data2.json").read(), 1)
open("../app/public/water-crystal-3d.html", "w").write(out)
print("built ../app/public/water-crystal-3d.html")
