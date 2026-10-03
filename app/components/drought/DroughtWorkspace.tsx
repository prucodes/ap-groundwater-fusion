"use client";

import { useMemo, useState } from "react";
import { MAP_VIEW, mandalToPath, mapGeometry } from "../../lib/data";
import {
  CATEGORY_META, CATEGORY_ORDER, LAYER_META, categoryCount, layerColor, layerText, place,
  type DroughtChange, type DroughtLayer, type DroughtMandal, type DroughtWeek, type ImpactClass,
} from "../../lib/drought";
import { DroughtDownload } from "./DroughtDownload";
import { MandalMatrix } from "./MandalMatrix";
import styles from "./Drought.module.css";

const LAYERS: DroughtLayer[] = ["outcome", "rain", "dry", "spi", "vci", "pasm", "gwdi"];
const RANK = Object.fromEntries(CATEGORY_ORDER.map((key, index) => [key, index]));

/** The map and the matrix: every mandal coloured by the manual's outcome or by
 * any one indicator, and the selected mandal's Table 3.11 / 3.12 beside it. */
export function DroughtWorkspace({ mandals, weeks, sowing, sowingAsOf, changes, asOf, manualUrl }: {
  mandals: DroughtMandal[];
  weeks: DroughtWeek[];
  sowing: { district: string; pctOfNormal: number; cls: ImpactClass }[];
  sowingAsOf: string | null;
  changes: { worse: DroughtChange[]; better: DroughtChange[] };
  asOf: string;
  manualUrl: string;
}) {
  const byIndex = useMemo(() => new Map(mandals.map(row => [row.i, row])), [mandals]);
  const sownBy = useMemo(() => new Map(sowing.map(entry => [entry.district, entry])), [sowing]);
  const districts = useMemo(() => [...new Set(mandals.map(row => row.d))].sort(), [mandals]);
  const [layer, setLayer] = useState<DroughtLayer>("outcome");
  const [light, setLight] = useState(false);
  const [district, setDistrict] = useState("");
  const [hover, setHover] = useState<number | null>(null);
  const firstSevere = useMemo(() => [...mandals].sort((a, b) => (RANK[a.category] - RANK[b.category]) ||
    (a.rain?.dev ?? 0) - (b.rain?.dev ?? 0))[0]?.i ?? 0, [mandals]);
  const [selected, setSelected] = useState<number>(firstSevere);

  const visible = district ? mandals.filter(row => row.d === district) : mandals;
  const counts = useMemo(() => {
    const out = Object.fromEntries(CATEGORY_ORDER.map(key => [key, 0])) as Record<(typeof CATEGORY_ORDER)[number], number>;
    for (const row of visible) out[light ? row.categoryLight : row.category] += 1;
    return out;
  }, [visible, light]);
  const row = byIndex.get(selected);
  const hovered = hover === null ? undefined : byIndex.get(hover);
  const meta = LAYER_META[layer];

  const choose = (index: number) => {
    setSelected(index);
    const target = byIndex.get(index);
    if (target && district && target.d !== district) setDistrict("");
  };

  return (
    <div>
      <div className={styles.toolbar}>
        <div className={styles.chips} role="group" aria-label="Map layer">
          {LAYERS.map(key => (
            <button key={key} type="button" className={styles.chip} aria-pressed={layer === key} onClick={() => setLayer(key)}>
              {LAYER_META[key].label}
            </button>
          ))}
        </div>
        <div className={styles.switch} role="group" aria-label="Dry spell length">
          <button type="button" aria-pressed={!light} onClick={() => setLight(false)}>Dry spell: 4 weeks</button>
          <button type="button" aria-pressed={light} onClick={() => setLight(true)}>3 weeks (light soils)</button>
        </div>
        <select className={styles.select} value={district} onChange={event => setDistrict(event.target.value)} aria-label="District">
          <option value="">All districts</option>
          {districts.map(name => <option key={name} value={name}>{place(name)}</option>)}
        </select>
        <select className={styles.select} value={selected} onChange={event => choose(Number(event.target.value))} aria-label="Mandal">
          {visible.slice().sort((a, b) => a.m.localeCompare(b.m)).map(entry => (
            <option key={entry.i} value={entry.i}>{place(entry.m)} · {place(entry.d)}</option>
          ))}
        </select>
        <DroughtDownload mandals={mandals} asOf={asOf} manualUrl={manualUrl} />
      </div>

      <div className={styles.workspace}>
        <div className={styles.mapCard}>
          <svg className={styles.mapSvg} viewBox={`0 0 ${MAP_VIEW.width} ${MAP_VIEW.height}`} role="group"
            aria-label={`Mandals coloured by ${meta.label.toLowerCase()}`} data-testid="drought-map">
            {mapGeometry.mandals.map((feature, index) => {
              const entry = byIndex.get(index);
              const dimmed = !!district && feature.d !== district;
              const isSelected = index === selected;
              return (
                <path key={index} d={mandalToPath(feature.rings)} fill={layerColor(layer, entry, light)}
                  fillOpacity={dimmed ? .18 : .95} stroke={isSelected ? "var(--ink)" : hover === index ? "var(--ink-soft)" : "var(--hairline)"}
                  strokeWidth={isSelected ? 1.6 : hover === index ? 1 : .3} role="button" tabIndex={-1}
                  aria-label={`${place(feature.m)}, ${place(feature.d)}: ${layerText(layer, entry, light)}`}
                  onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)} onClick={() => entry && choose(index)}
                  style={{ cursor: entry ? "pointer" : "default" }} />
              );
            })}
          </svg>
          {hovered ? (
            <div className={styles.mapHover} aria-live="polite">
              <strong>{place(hovered.m)}</strong>
              <span>{place(hovered.d)}</span>
              <div>{meta.label}: <b>{layerText(layer, hovered, light)}</b></div>
              {layer !== "outcome" ? <div>Outcome: <b>{CATEGORY_META[light ? hovered.categoryLight : hovered.category].label}</b></div> : null}
            </div>
          ) : null}
          <div className={styles.legend}>
            {layer === "outcome"
              ? CATEGORY_ORDER.map(key => <span key={key}><i style={{ background: CATEGORY_META[key].color }} />{CATEGORY_META[key].label} <b>{counts[key]}</b></span>)
              : meta.legend.map(item => <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>)}
          </div>
          <div className={styles.layerNote}>
            {meta.note} {district ? `${place(district)}: ${visible.length} mandals, ${categoryCount(counts, ["severe", "moderate|severe", "moderate"])} moderate or worse.` : ""}
          </div>
          {changes.worse.length || changes.better.length ? (
            <div className={styles.layerNote}>
              Since a week earlier:
              <div className={styles.changes}>
                {changes.worse.slice(0, 8).map(change => (
                  <button type="button" key={`w${change.i}`} onClick={() => choose(change.i)}>
                    ▲ {place(change.m)} → {CATEGORY_META[change.to].short}
                  </button>
                ))}
                {changes.better.slice(0, 6).map(change => (
                  <button type="button" key={`b${change.i}`} onClick={() => choose(change.i)}>
                    ▼ {place(change.m)} → {CATEGORY_META[change.to].short}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        {row ? (
          <MandalMatrix row={row} weeks={weeks} light={light} sown={sownBy.get(row.d) ?? null} sowingAsOf={sowingAsOf} />
        ) : null}
      </div>
    </div>
  );
}
