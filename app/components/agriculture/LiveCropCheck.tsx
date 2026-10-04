"use client";

/* This week in the fields: for a crop and growth stage the reader picks, is it
   already short of water in each mandal, will it be within seven days on the
   forecast, or is it comfortable through the week? An FAO-56 root-zone water
   balance (lib/cropWater.ts) run in the browser on this week's modelled soil
   moisture, SoilGrids' water-holding capacity and ECMWF's forecast of reference
   evapotranspiration and rain. Crop and stage are chosen, not observed. */
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { CROP_REFERENCE, CROP_REFERENCE_URL, CROP_STAGES, DEFAULT_BUDGET, ROOT_REFERENCE_URL, type AgricultureEvidence, type CropKey } from "../../lib/agriculture";
import { CROP_WATER_STATES, MAX_ROOT_M, OUTLOOK_DAYS, SEVERE_COLOR, cropWaterCheck, cropWaterCounts, type CropWaterResult, type CropWaterState, type LiveField } from "../../lib/cropWater";
import { IconArrowRight, IconCloudRain, IconDroplet, IconLeaf, IconSun } from "../icons";
import { day, placeName } from "./waterContextFormat";
import styles from "./LiveCropCheck.module.css";

export type LabPreset = { crop: CropKey; stage: number; eto: number; rain: number; reserve: number; place: string; window: string; key: number };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekday = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };
const STATE_ORDER: CropWaterState[] = ["stressed", "soon", "ok", "unknown"];
const stateOf = (result: CropWaterResult | null): CropWaterState => result ? result.state : "unknown";
const fillOf = (result: CropWaterResult | null) => result?.state === "stressed" && result.severe ? SEVERE_COLOR : CROP_WATER_STATES[stateOf(result)].color;
const mm = (value: number) => `${value < 10 ? value.toFixed(1) : value.toFixed(0)} mm`;

/** One plain sentence: what the numbers mean for this crop in this mandal this week. */
function reading(result: CropWaterResult, crop: CropKey, stage: number, place: string, dates: string[], today: number) {
  const name = CROP_REFERENCE[crop].name, stageName = CROP_STAGES[stage].toLowerCase();
  const daily = result.kc * result.etoMean;
  const rain = result.rainUsed >= 1 ? `${result.rainUsed.toFixed(0)} mm of useful rain` : "almost no useful rain";
  if (result.state === "stressed") {
    return `${name} at the ${stageName} stage in ${place} is already short of water: its roots have drawn the soil past the point where water comes easily, so it is using water at about ${Math.round(result.ksNow * 100)}% of its unstressed rate. ${result.rainUsed >= 10 ? `The ${rain} forecast this week would ease it.` : `With ${rain} forecast, that does not change this week.`}`;
  }
  if (result.state === "soon" && result.onset !== null) {
    const date = dates[today + result.onset];
    const when = result.onset === 0 ? `today, ${weekday(date)} ${day(date, false)}` : result.onset === 1 ? `tomorrow, ${weekday(date)} ${day(date, false)}` : `${weekday(date)} ${day(date, false)}`;
    return `${name} at the ${stageName} stage in ${place} has about ${mm(result.reserve)} of easily usable water left in a ${result.zr.toFixed(1)} m root zone. Using some ${daily.toFixed(1)} mm a day, with ${rain} forecast, it runs short by ${when}.`;
  }
  return `${name} at the ${stageName} stage in ${place} stays comfortable through ${day(dates[dates.length - 1], false)}: about ${mm(result.reserve)} of easily usable water now, against some ${(daily * OUTLOOK_DAYS).toFixed(0)} mm of crop water use over the week, with ${rain} forecast.`;
}

/** Root-zone water day by day: full at the top, the wilting point at the bottom, stress below the dashed line. */
function RootZoneChart({ result, dates, today }: { result: CropWaterResult; dates: string[]; today: number }) {
  const W = 460, H = 244, x0 = 46, x1 = W - 14, y0 = 40, y1 = H - 32;
  const n = dates.length;
  const x = (i: number) => x0 + (i * (x1 - x0)) / Math.max(1, n - 1);
  const y = (value: number) => y1 - (Math.max(0, Math.min(result.taw, value)) / result.taw) * (y1 - y0);
  const threshold = y(result.taw - result.raw);
  const points = result.path.map((value, i) => `${x(i).toFixed(1)},${y(value).toFixed(1)}`);
  const past = points.slice(0, today + 1).join(" ");
  const ahead = points.slice(today).join(" ");
  const area = `M${x(today).toFixed(1)},${y1} L${points.slice(today).join(" L")} L${x(n - 1).toFixed(1)},${y1} Z`;
  const onsetIndex = result.onset === null ? null : today + result.onset;
  const rainMax = Math.max(15, ...result.rainEffective);
  const gradient = useId().replace(/:/g, "");
  const label = `Water the roots can draw in a ${result.zr.toFixed(1)} m root zone, from ${day(dates[0], false)} to ${day(dates[n - 1], false)}: ${mm(result.taw - result.drNow)} of ${mm(result.taw)} now; stress begins below ${mm(result.taw - result.raw)}${onsetIndex !== null ? `, reached by ${day(dates[onsetIndex], false)}` : ""}.`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img" aria-label={label} data-testid="root-zone-chart">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2789af" stopOpacity=".28" /><stop offset="1" stopColor="#2789af" stopOpacity=".02" /></linearGradient>
      </defs>
      <rect x={x0} y={y0} width={x1 - x0} height={threshold - y0} className={styles.zoneEasy} />
      <rect x={x0} y={threshold} width={x1 - x0} height={y1 - threshold} className={styles.zoneStress} />
      <line x1={x0} x2={x1} y1={y0} y2={y0} className={styles.gridLine} />
      <line x1={x0} x2={x1} y1={y1} y2={y1} className={styles.axisLine} />
      <line x1={x0} x2={x1} y1={threshold} y2={threshold} className={styles.threshold} />
      <text x={x0 - 6} y={y0 + 4} textAnchor="end" className={styles.axisText}>{result.taw.toFixed(0)}</text>
      <text x={x0 - 6} y={threshold + 4} textAnchor="end" className={styles.axisText}>{(result.taw - result.raw).toFixed(0)}</text>
      <text x={x0 - 6} y={y1 + 4} textAnchor="end" className={styles.axisText}>0</text>
      <text x={x1 - 4} y={y0 + 13} textAnchor="end" className={styles.zoneLabel}>Water comes easily</text>
      <text x={x0} y={14} className={styles.axisCaption}>mm the roots can draw · rain that counts</text>
      <line x1={x1 - 196} x2={x1 - 180} y1={10} y2={10} className={styles.threshold} />
      <text x={x1} y={14} textAnchor="end" className={styles.zoneLabelWarm}>stress begins: {Math.round(result.p * 100)}% of its water used</text>
      {result.rainEffective.map((value, i) => value > 0 ? (
        <rect key={i} x={x(i) - 5} y={34 - (value / rainMax) * 18} width={10} height={(value / rainMax) * 18} rx={1.5} className={styles.rainBar}>
          <title>{`${day(dates[i], false)}: ${value.toFixed(1)} mm of rain counted`}</title>
        </rect>
      ) : null)}
      <path d={area} fill={`url(#${gradient})`} />
      <polyline points={past} className={styles.pathPast} />
      <polyline points={ahead} className={styles.pathAhead} />
      {result.path.map((value, i) => <circle key={i} cx={x(i)} cy={y(value)} r={i === today ? 4 : 2.6} className={i < today ? styles.dotPast : value < result.taw - result.raw ? styles.dotStress : styles.dot} />)}
      <line x1={x(today)} x2={x(today)} y1={y0 - 4} y2={y1} className={styles.today} />
      <text x={x(today) + 5} y={y0 + 12} className={styles.todayText}>Today</text>
      {onsetIndex !== null && result.state === "soon" ? (() => {
        const cx = x(onsetIndex), cy = y(result.path[onsetIndex]);
        const below = cy < (y0 + y1) / 2 || cy - 24 < threshold + 6;
        const anchor = cx < x0 + 60 ? "start" : cx > x1 - 60 ? "end" : "middle";
        return <g>
          <circle cx={cx} cy={cy} r={7} className={styles.onsetRing} />
          <text x={anchor === "start" ? cx - 6 : anchor === "end" ? cx + 6 : cx} y={below ? Math.min(y1 - 8, cy + 22) : cy - 14} textAnchor={anchor} className={styles.onsetText}>Short from {weekday(dates[onsetIndex])}</text>
        </g>;
      })() : null}
      {dates.map((date, i) => <text key={date} x={x(i)} y={H - 12} textAnchor="middle" className={i === today ? styles.dayToday : styles.dayText}>{weekday(date).slice(0, 2)}<tspan x={x(i)} dy="11">{Number(date.slice(8))}</tspan></text>)}
    </svg>
  );
}

export function LiveCropCheck({ live, evidence, mapView, onOpenLab }: {
  live: LiveField | null; evidence: AgricultureEvidence; mapView: { width: number; height: number }; onOpenLab: (preset: LabPreset) => void;
}) {
  const [crop, setCrop] = useState<CropKey>(DEFAULT_BUDGET.crop);
  const [stage, setStage] = useState(DEFAULT_BUDGET.stage);
  const [emphasis, setEmphasis] = useState<CropWaterState | null>(null);
  const results = useMemo(() => live ? live.mandals.map(input => cropWaterCheck(input, live.today, crop, stage)) : [], [live, crop, stage]);
  const counts = cropWaterCounts(results);
  const known = counts.stressed + counts.soon + counts.ok;
  // Open on a mandal that runs short later in the week: its line crosses into stress
  // on the chart, which shows the forecast at work. With none on the way, the most stressed one.
  const [selected, setSelected] = useState<number>(() => {
    if (!live) return 0;
    const all = live.mandals.map((input, index) => ({ index, result: cropWaterCheck(input, live.today, DEFAULT_BUDGET.crop, DEFAULT_BUDGET.stage) }));
    const soon = all.filter(item => item.result?.state === "soon").sort((a, b) => (b.result!.onset ?? 0) - (a.result!.onset ?? 0) || b.result!.reserve - a.result!.reserve)[0];
    const stressed = all.filter(item => item.result?.state === "stressed").sort((a, b) => a.result!.ksNow - b.result!.ksNow)[0];
    return (soon ?? stressed)?.index ?? 0;
  });
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  // The map's 670 outlines are drawn after load: they are already in the page data, and
  // rendering them on the server too would add half a megabyte to the page.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const figure = useRef<HTMLDivElement>(null);
  const check = live?.crossCheck?.[`${crop}-${stage}`] ?? null;
  const agrees = check ? STATE_ORDER.every(key => check[key] === counts[key]) && check.severe === counts.severe : null;

  const districts = useMemo(() => {
    const out = new Map<string, { name: string; known: number; stressed: number; soon: number; worst: number | null; worstKs: number }>();
    results.forEach((result, index) => {
      const row = evidence.mandals[index];
      if (!row) return;
      const entry = out.get(row.district) ?? { name: row.district, known: 0, stressed: 0, soon: 0, worst: null, worstKs: 2 };
      if (result) {
        entry.known++;
        if (result.state === "stressed") entry.stressed++;
        if (result.state === "soon") entry.soon++;
        const rank = result.state === "stressed" ? result.ksNow : result.state === "soon" ? 1 + (result.onset ?? 0) / 10 : 2;
        if (rank < entry.worstKs) { entry.worstKs = rank; entry.worst = index; }
      }
      out.set(row.district, entry);
    });
    return [...out.values()].filter(d => d.known).sort((a, b) => (b.stressed + b.soon) / b.known - (a.stressed + a.soon) / a.known || b.stressed - a.stressed || a.name.localeCompare(b.name));
  }, [results, evidence.mandals]);

  if (!live) {
    return <section id="field-week" className={styles.section} aria-labelledby="field-week-title">
      <header className={styles.head}><div><span className={styles.eyebrow}>02 / This week in the fields</span><h2 id="field-week-title">Which crops will run short of water this week?</h2></div></header>
      <p className={styles.unavailable}>The crop water check needs this week&rsquo;s soil moisture and forecast on the same dates; one of the two has not refreshed in this build.</p>
    </section>;
  }

  const profile = CROP_REFERENCE[crop];
  const lastDay = live.dates[live.dates.length - 1];
  const windowText = `${day(live.issued, false)} to ${day(lastDay, false)}`;
  const active = results[selected] ?? null;
  const activeRow = evidence.mandals[selected];
  const place = activeRow ? placeName(activeRow.mandal) : "this mandal";
  const choices = evidence.mandals.map((row, index) => ({ index, label: `${placeName(row.mandal)} · ${placeName(row.district)}` })).sort((a, b) => a.label.localeCompare(b.label));
  const lede = counts.stressed
    ? <><strong>{counts.stressed}</strong> mandals where {profile.name.toLowerCase()} at the {CROP_STAGES[stage].toLowerCase()} stage is already short of water{counts.soon ? <>, and <strong>{counts.soon}</strong> more within seven days on the forecast</> : null}.</>
    : counts.soon ? <>No mandal is short of water yet for {profile.name.toLowerCase()} at the {CROP_STAGES[stage].toLowerCase()} stage; <strong>{counts.soon}</strong> would be within seven days on the forecast.</>
      : <>{profile.name} at the {CROP_STAGES[stage].toLowerCase()} stage stays comfortable through the week in every mandal with a soil value.</>;

  function openLab() {
    if (!active || !activeRow) return;
    onOpenLab({ crop, stage, eto: Math.round(active.etoMean * 10) / 10, rain: Math.round(active.rainUsed * 2) / 2, reserve: Math.round(active.reserve * 2) / 2,
      place: `${placeName(activeRow.mandal)}, ${placeName(activeRow.district)}`, window: windowText, key: Date.now() });
  }

  return <section id="field-week" className={styles.section} aria-labelledby="field-week-title" data-testid="field-week">
    <header className={styles.head}>
      <div><span className={styles.eyebrow}>02 / This week in the fields</span><h2 id="field-week-title">Which crops will run short of water this week?</h2></div>
      <span className={styles.liveBadge}><i aria-hidden="true" />Soil {day(live.soilAsOf, false)} · forecast {windowText}</span>
    </header>

    <div className={styles.controls}>
      <div className={styles.cropPicker} role="group" aria-label="Crop">
        {(Object.keys(CROP_REFERENCE) as CropKey[]).map(key => <button key={key} type="button" aria-pressed={crop === key} onClick={() => setCrop(key)}>{CROP_REFERENCE[key].name}</button>)}
      </div>
      <div className={styles.stagePicker} role="group" aria-label="Growth stage">
        {CROP_STAGES.map((name, index) => <button key={name} type="button" aria-label={`${name} stage, Kc ${profile.kc[index].toFixed(2)}`} aria-pressed={stage === index} onClick={() => setStage(index)}>{name}<small>Kc {profile.kc[index].toFixed(2)}</small></button>)}
      </div>
    </div>

    <p className={styles.lede} data-testid="field-week-lede">{lede}</p>

    <div className={styles.tiles} role="group" aria-label="Mandals by crop water state; select one to pick it out on the map">
      {STATE_ORDER.map(key => <button key={key} type="button" className={styles.tile} data-state={key} aria-pressed={emphasis === key} data-testid={`field-week-${key}`}
        onClick={() => setEmphasis(emphasis === key ? null : key)} style={{ "--swatch": CROP_WATER_STATES[key].color } as CSSProperties}>
        <span className={styles.tileLabel}><i />{CROP_WATER_STATES[key].label}</span>
        <strong>{counts[key]}</strong>
        <em>{key === "unknown" ? "kept visible, never counted as safe" : `${known ? Math.round((counts[key] / known) * 100) : 0}% of ${known} with a soil value`}{key === "stressed" && counts.severe ? ` · ${counts.severe} severely` : ""}</em>
      </button>)}
    </div>

    <div className={styles.grid}>
      <div ref={figure} className={styles.mapFigure} data-testid="field-week-map" data-crop={crop} data-stage={stage} data-agrees={agrees === null ? undefined : String(agrees)} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${mapView.width} ${mapView.height}`} role="group" aria-label={`Crop water state by mandal: ${profile.name}, ${CROP_STAGES[stage]}`}>
          {mounted ? evidence.mandals.map((row, index) => {
            const result = results[index] ?? null;
            const state = stateOf(result);
            const dim = emphasis !== null && emphasis !== state;
            return <path key={index} d={row.path} fill={fillOf(result)} opacity={dim ? 0.14 : 1} data-state={state}
              className={index === selected ? styles.selectedPath : styles.mandalPath} role="button" tabIndex={index === selected ? 0 : -1}
              aria-label={`${placeName(row.mandal)}: ${CROP_WATER_STATES[state].label}`}
              onPointerMove={event => { const box = figure.current?.getBoundingClientRect(); if (box && event.pointerType !== "touch") setHover({ index, x: event.clientX - box.left, y: event.clientY - box.top }); }}
              onClick={() => setSelected(index)}
              onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(index); } }} />;
          }) : null}
        </svg>
        <div className={styles.mapKey} aria-hidden="true">
          {STATE_ORDER.map(key => <span key={key}><i style={{ background: CROP_WATER_STATES[key].color }} />{CROP_WATER_STATES[key].short}</span>)}
          <span><i style={{ background: SEVERE_COLOR }} />Severe</span>
        </div>
        {hover && evidence.mandals[hover.index] ? (() => {
          const row = evidence.mandals[hover.index], result = results[hover.index] ?? null;
          const width = figure.current?.clientWidth ?? 600;
          return <div className={styles.tooltip} role="tooltip" style={{ left: Math.min(hover.x + 16, width - 236), top: hover.y + 14 }}>
            <span>{placeName(row.district)}</span><strong>{placeName(row.mandal)}</strong>
            <em style={{ color: fillOf(result) === CROP_WATER_STATES.ok.color ? "#3f7f63" : fillOf(result) }}>{CROP_WATER_STATES[stateOf(result)].label}</em>
            {result ? <dl>
              <div><dt>Easily usable water</dt><dd>{mm(result.reserve)}</dd></div>
              <div><dt>Water use / day</dt><dd>{(result.kc * result.etoMean).toFixed(1)} mm</dd></div>
              <div><dt>Useful rain, 7 days</dt><dd>{mm(result.rainUsed)}</dd></div>
            </dl> : <p>No unique soil-moisture value for this boundary.</p>}
          </div>;
        })() : null}
      </div>

      <aside className={styles.detail} aria-label="Selected mandal" data-testid="field-week-detail">
        <label className={styles.picker}><span>Mandal</span><select aria-label="Mandal for the crop water check" value={selected} onChange={event => setSelected(Number(event.target.value))}>{choices.map(choice => <option key={choice.index} value={choice.index}>{choice.label}</option>)}</select></label>
        <div className={styles.detailHead}>
          <div><h3>{place}</h3><p>{activeRow ? placeName(activeRow.district) : ""} · {profile.name}, {CROP_STAGES[stage].toLowerCase()}</p></div>
          <span className={styles.statePill} style={{ "--swatch": fillOf(active) } as CSSProperties}><i />{CROP_WATER_STATES[stateOf(active)].short}</span>
        </div>
        {active ? <>
          <RootZoneChart result={active} dates={live.dates} today={live.today} />
          <p className={styles.reading} data-testid="field-week-reading">{reading(active, crop, stage, place, live.dates, live.today)}</p>
          <dl className={styles.facts}>
            <div><dt><IconDroplet />Easily usable water</dt><dd>{mm(active.reserve)}<small>of {mm(active.taw)} the {active.zr.toFixed(1)} m root zone holds</small></dd></div>
            <div><dt><IconSun />Crop water use, 7 days</dt><dd>{mm(active.kc * active.etoMean * OUTLOOK_DAYS)}<small>ETo {active.etoMean.toFixed(1)} mm/day × Kc {active.kc.toFixed(2)}</small></dd></div>
            <div><dt><IconCloudRain />Useful rain, 7 days</dt><dd>{mm(active.rainUsed)}<small>forecast; daily rain under 0.2 ETo left out</small></dd></div>
            <div><dt><IconLeaf />Water use now</dt><dd>{Math.round(active.ksNow * 100)}%<small>of the unstressed rate (FAO-56 Ks)</small></dd></div>
          </dl>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={openLab} data-testid="open-in-lab">Work it through in the crop-water lab <IconArrowRight /></button>
            {activeRow?.id ? <Link href={`/mandals/${activeRow.id}`} className={styles.secondary}>Mandal record <IconArrowRight /></Link> : null}
          </div>
        </> : <p className={styles.unavailable}>No unique soil-moisture value for this boundary, so no check is made. It is shown in grey, never as comfortable.</p>}
      </aside>
    </div>

    <div className={styles.districts}>
      <div className={styles.districtsHead}><h3>Districts with the most mandals short or nearly short</h3><span>{profile.name}, {CROP_STAGES[stage].toLowerCase()} · share of mandals with a soil value</span></div>
      <ol>
        {districts.slice(0, 8).map(d => <li key={d.name}>
          <button type="button" onClick={() => d.worst !== null && setSelected(d.worst)}>
            <span className={styles.districtName}>{placeName(d.name)}</span>
            <span className={styles.districtBar} aria-hidden="true">
              <i style={{ width: `${(d.stressed / d.known) * 100}%`, background: CROP_WATER_STATES.stressed.color }} />
              <i style={{ width: `${(d.soon / d.known) * 100}%`, background: CROP_WATER_STATES.soon.color }} />
            </span>
            <span className={styles.districtCount}><b>{d.stressed}</b> now · <b>{d.soon}</b> soon <small>of {d.known}</small></span>
          </button>
        </li>)}
      </ol>
    </div>

    <details className={styles.method}>
      <summary>How the check works, and what it is not</summary>
      <p><strong>An FAO-56 root-zone water balance, mandal by mandal.</strong> It starts from the soil moisture APWRIMS publishes for {day(live.soilAsOf)} (NRSC&rsquo;s VIC model: plant-available water in the top 5, 30, 100 and 150 cm as a share of what the soil holds) and steps the root zone forward one day at a time to {day(lastDay)}: rain counts in full unless it is under a fifth of the day&rsquo;s reference evapotranspiration (FAO-56 treats that as evaporated), and the crop uses Ks × Kc × ETo. Stress begins when the crop has used the share p of the root zone&rsquo;s available water that FAO-56 Table 22 gives it, adjusted for this week&rsquo;s rate of use; below that, its water use falls in proportion (Eq. 84). &ldquo;Short now&rdquo; means the crop is below that line today; &ldquo;severely&rdquo; means at half its unstressed rate or less.</p>
      <p><strong>Inputs.</strong> Reference evapotranspiration (FAO-56 Penman-Monteith) and rain: {live.weather.source} (<a href={live.weather.url} target="_blank" rel="noreferrer">model {live.weather.model}</a>, {live.weather.licence}), at a point inside each mandal; days before today are the model&rsquo;s recent runs, not station readings. How much water the soil holds: <a href={live.capacity.url} target="_blank" rel="noreferrer">ISRIC SoilGrids 2.0</a> (field capacity minus wilting point, by depth; predicted from soil profiles, {live.capacity.licence}). Crop coefficient, root depth and p: <a href={CROP_REFERENCE_URL} target="_blank" rel="noreferrer">FAO-56 Table 12</a> and <a href={ROOT_REFERENCE_URL} target="_blank" rel="noreferrer">Table 22</a>, the larger root depth that footnote gives for rainfed crops, capped at {MAX_ROOT_M} m (the deepest the soil model reports); 0.2 m at the initial stage. Chilli and red gram use the nearest FAO-56 rows, as in the lab.</p>
      <p><strong>What it is not.</strong> The crop and stage are chosen here, not observed: crop-sown records are not connected, so a mandal is checked whether or not the crop grows there. No irrigation, runoff from heavy rain or capillary rise is modelled. It is a screening view for where to look, not a watering instruction, a crop-loss estimate or a drought declaration.{agrees ? " The counts on this page are reproduced independently by the pipeline's own copy of the calculation." : ""}</p>
    </details>
  </section>;
}
