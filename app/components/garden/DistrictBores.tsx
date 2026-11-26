"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { monthYear, sideOf, type Garden, type GardenAquifer } from "../../lib/gardenShared";
import { Borewells, pumpState, PUMP_BELOW_USUAL_M, type Bore } from "./Borewells";
import styles from "./WaterGarden.module.css";

/* The close-up under the State's field: one district's mandals as borewells, in the year the
   field shows. It opens on the district with the largest share below its usual, and follows
   the field's playback: the water in every bore rises and falls with the years. */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function DistrictBores({ garden, stepIndex }: { garden: Garden; stepIndex: number }) {
  const latest = garden.steps[garden.steps.length - 1];
  const districts = useMemo(() => {
    const by = new Map<string, number[]>();
    garden.plants.forEach((p, i) => by.set(p[2], [...(by.get(p[2]) ?? []), i]));
    return [...by].map(([name, members]) => {
      const sides = members.map(i => sideOf(garden.plants[i][4][latest.index], garden.plants[i][5]));
      const compared = sides.filter(s => s !== null).length, deeper = sides.filter(s => s === 1).length;
      return { name, members, share: compared ? deeper / compared : 0 };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [garden, latest.index]);
  const worst = useMemo(() => [...districts].sort((a, b) => b.share - a.share)[0]?.name ?? districts[0]?.name, [districts]);
  const [chosen, setChosen] = useState<string | null>(null);
  // The bores drill in when the close-up comes into view, not while it is off screen.
  const [seen, setSeen] = useState(false), box = useRef<HTMLElement>(null);
  // On a narrow screen each bore keeps a readable size and the strip scrolls sideways in its panel.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const fit = () => setNarrow(node.getBoundingClientRect().width < 640);
    fit();
    const watcher = new ResizeObserver(fit);
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);
  useEffect(() => {
    const node = box.current;
    if (!node || seen) return;
    const watcher = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setSeen(true); watcher.disconnect(); } }, { threshold: 0.25 });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, [seen]);
  const district = districts.find(d => d.name === (chosen ?? worst)) ?? districts[0];
  const step = garden.steps[stepIndex];

  const { bores, scaleM, aquifer } = useMemo(() => {
    const plants = district.members.map(i => garden.plants[i]);
    const deepest = Math.max(10, ...plants.flatMap(p => p[4].filter((v): v is number => v !== null)));
    const kinds = plants.map(p => p[7]).filter((a): a is GardenAquifer => a !== null);
    const common = ([0, 1, 2] as GardenAquifer[]).sort((a, b) => kinds.filter(k => k === b).length - kinds.filter(k => k === a).length)[0];
    return {
      scaleM: Math.ceil((deepest + 6) / 10) * 10,
      aquifer: kinds.length ? common : 0 as GardenAquifer,
      bores: (yearIndex: number): Bore[] => plants.map(p => {
        const now = p[4][yearIndex], usual = p[5];
        return { id: p[0], name: p[1], nowM: now, usualM: usual, side: sideOf(now, usual), deepestM: Math.max(...p[4].filter((v): v is number => v !== null)) };
      }),
    };
  }, [district, garden]);
  const shown = bores(step.index);
  const states = shown.map(pumpState);
  const count = (k: string) => states.filter(s => s === k).length;
  const below = count("trickle") + count("dry");

  return (
    <section ref={box} className={styles.bores} aria-labelledby="bores-title" data-testid="district-bores" data-district={district.name} data-dry={count("dry")} data-trickle={count("trickle")} data-running={count("full") + count("steady")}>
      <header className={styles.boresHead}>
        <div>
          <span className={styles.boresEyebrow}>A district, close up · {monthYear(garden, step.year)}</span>
          <h3 id="bores-title">{district.name}: {below} of {shown.length} borewells below their usual {garden.monthName}</h3>
        </div>
        <label className={styles.pick}>
          <span>District</span>
          <select value={district.name} onChange={e => setChosen(e.target.value)} data-testid="district-bores-pick">
            {districts.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
          </select>
        </label>
      </header>
      <div className={styles.boresFigure} data-scroll={narrow ? "" : undefined}>
        {narrow ? <span className={styles.swipe} aria-hidden="true">Swipe to see all {shown.length} →</span> : null}
        <div style={narrow ? { width: Math.max(360, shown.length * 46 + 70) } : undefined}>
        <Borewells key={district.name} uid="db" bores={shown} scaleM={scaleM} aquifer={aquifer} animated play={seen}
          width={narrow ? Math.max(360, shown.length * 46 + 70) : 1000} soil={narrow ? 260 : 300} nameSize={narrow ? 11 : shown.length > 30 ? 10 : 11.5}
          label={`${district.name}'s ${shown.length} mandals as borewells in ${monthYear(garden, step.year)}: ${plural(count("full") + count("steady"), "pump")} running, ${plural(count("trickle"), "trickle")}, ${count("dry")} dry.`} />
        </div>
      </div>
      <p className={styles.boresKey}>
        <span><i style={{ background: "#5be38a" }} />Running: water above its usual, or within 0.1 m ({count("full") + count("steady")})</span>
        <span><i style={{ background: "#f2b442" }} />A trickle: below its usual, still over the pump ({count("trickle")})</span>
        <span><i style={{ background: "#ff5a3c" }} />Dry: the water has fallen past the pump ({count("dry")})</span>
        <span>Each bore reaches its mandal&rsquo;s measured water table, to scale; its pump is set {PUMP_BELOW_USUAL_M} m below the usual {garden.monthName} level, as for a normal year. A picture of the readings, not of any one well.</span>
      </p>
    </section>
  );
}
