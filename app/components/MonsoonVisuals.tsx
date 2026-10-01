"use client";

import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { MAP_VIEW, mandalToPath, mapGeometry, monsoonWatch } from "../lib/data";

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* One shared scale for the map and its legend: a diverging ramp centred on
   "did what it usually does", because the reader's question is not how much the
   water moved but whether it moved the way it should have. */
const SHORT_STOPS: Array<{ upTo: number; fill: string; label: string }> = [
  { upTo: -1, fill: "#2f7d6b", label: "better than usual" },
  { upTo: 0, fill: "#8fbfae", label: "about normal" },
  { upTo: 1, fill: "#f2d7a0", label: "up to 1 m short" },
  { upTo: 2, fill: "#e2a05f", label: "1–2 m short" },
  { upTo: 4, fill: "#cf6b46", label: "2–4 m short" },
  { upTo: Infinity, fill: "#9e2f22", label: "more than 4 m short" },
];

/* Volume is an illustrative area/specific-yield proxy, not measured storage. */
const VOLUME_STOPS: Array<{ upTo: number; fill: string; label: string }> = [
  { upTo: 0, fill: "#2f7d6b", label: "at or above baseline" },
  { upTo: 5, fill: "#8fbfae", label: "under 5 Mm³" },
  { upTo: 20, fill: "#f2d7a0", label: "5–20 Mm³" },
  { upTo: 50, fill: "#e2a05f", label: "20–50 Mm³" },
  { upTo: 100, fill: "#cf6b46", label: "50–100 Mm³" },
  { upTo: Infinity, fill: "#9e2f22", label: "over 100 Mm³" },
];

function fillFor(stops: typeof SHORT_STOPS, value: number | null | undefined) {
  if (value === null || value === undefined) return "var(--field)";
  return (stops.find((stop) => value <= stop.upTo) ?? stops[stops.length - 1]).fill;
}

function shortfallFill(value: number | undefined) {
  return fillFor(SHORT_STOPS, value);
}

/** Andhra Pradesh by mandal, shaded by how far this season is from that mandal's own normal.
 *
 *  The map is capped in height and the legend and readout sit beside it rather
 *  than under it: at full card width it stood 792px tall, which pushed every
 *  other block below the fold and put the hover readout half a screen away from
 *  the cursor it was responding to.
 */
export function RechargeMap() {
  const figure = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const tipId = useId();
  const [focusIndex, setFocusIndex] = useState(0);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  const [view, setView] = useState<"metres" | "volume">("metres");
  const stops = view === "metres" ? SHORT_STOPS : VOLUME_STOPS;
  const byBoundary = new Map<number, (typeof monsoonWatch.mandals)[number] | null>();
  monsoonWatch.mandals.forEach((m) => {
    if (m.boundaryIndex !== null) byBoundary.set(m.boundaryIndex, byBoundary.has(m.boundaryIndex) ? null : m);
  });
  const active = hover ? byBoundary.get(hover.index) : null;
  const activeFeature = hover ? mapGeometry.mandals[hover.index] : null;

  useLayoutEffect(() => {
    if (!hover || !figure.current || !tip.current) return;
    const place = () => {
      const frame = figure.current!, card = tip.current!;
      const left = hover.x + card.offsetWidth + 18 < frame.clientWidth ? hover.x + 14 : hover.x - card.offsetWidth - 14;
      setPosition({ left: Math.max(8, Math.min(frame.clientWidth - card.offsetWidth - 8, left)), top: Math.max(8, Math.min(frame.clientHeight - card.offsetHeight - 8, hover.y - card.offsetHeight / 2)) });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(figure.current); observer.observe(tip.current);
    return () => observer.disconnect();
  }, [hover, view]);

  function show(index: number, element: SVGPathElement, point?: { clientX: number; clientY: number }) {
    const frame = figure.current?.getBoundingClientRect(), bounds = element.getBoundingClientRect();
    if (frame) setHover({ index, x: (point?.clientX ?? bounds.x + bounds.width / 2) - frame.x, y: (point?.clientY ?? bounds.y + bounds.height / 2) - frame.y });
  }

  return (
    <div className="rechargeMapLayout">
      <div className="rechargeMapFigure" ref={figure}>
        <div className="rechargeToggle" role="group" aria-label="Colour the map by">
          {([
            { k: "metres", label: "Metres of water table" },
            { k: "volume", label: "Storage proxy" },
          ] as const).map((option) => (
            <button
              key={option.k}
              type="button"
              className={view === option.k ? "on" : ""}
              aria-pressed={view === option.k}
              onClick={() => setView(option.k)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <svg
          viewBox={`0 0 ${MAP_VIEW.width} ${MAP_VIEW.height}`}
          className="rechargeMapSvg"
          role="group"
          aria-label="Seasonal groundwater departure by prototype mandal"
          onMouseLeave={() => setHover(null)}
        >
          {mapGeometry.mandals.map((feature, index) => {
            const row = byBoundary.get(index);
            return (
              <path
                key={index}
                d={mandalToPath(feature.rings)}
                fill={fillFor(stops, view === "metres" ? row?.shortfallM : row?.shortfallMm3)}
                className={`rechargeCell ${row ? "" : "noData"} ${hover?.index === index ? "hot" : ""}`}
                role="button" tabIndex={focusIndex === index ? 0 : -1}
                aria-label={`${feature.m}, ${feature.d}: ${row ? `${row.shortfallM.toFixed(2)} m seasonal departure` : "unresolved or missing evidence"}`}
                aria-describedby={hover?.index === index ? tipId : undefined}
                onMouseMove={event => show(index, event.currentTarget, event)}
                onClick={event => show(index, event.currentTarget)}
                onFocus={event => { setFocusIndex(index); show(index, event.currentTarget); }}
                onBlur={() => setHover(null)}
                onKeyDown={event => {
                  if (event.key === "Escape") setHover(null);
                  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); show(index, event.currentTarget); }
                  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
                    event.preventDefault();
                    const offset = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
                    const next = (index + offset + mapGeometry.mandals.length) % mapGeometry.mandals.length;
                    figure.current?.querySelectorAll<SVGPathElement>(".rechargeCell")[next]?.focus();
                  }
                }}
              />
            );
          })}
        </svg>
        {hover && activeFeature ? (
          <div
            className="rechargeTip"
            ref={tip} id={tipId}
            style={{ ...position, "--recharge-tone": active ? fillFor(stops, view === "metres" ? active.shortfallM : active.shortfallMm3) : "var(--muted)" } as CSSProperties}
            role="tooltip"
          >
            <strong>{active ? active.mandal : activeFeature.m}</strong>
            <span>{active ? active.district : activeFeature.d}</span>
            {active ? (
              <em className={active.shortfallM > 0 ? "bad" : "good"}>
                {view === "metres" || active.shortfallMm3 === null ? (
                  <>
                    {active.shortfallM > 0 ? "+" : ""}
                    {active.shortfallM.toFixed(2)} m against its own normal
                  </>
                ) : (
                  <>
                    {active.shortfallMm3.toFixed(1)} Mm³ storage proxy
                  </>
                )}
              </em>
            ) : (
              <em>{byBoundary.get(hover.index) === null ? "Multiple source series; reconciliation required" : "Not enough comparable seasons"}</em>
            )}
          </div>
        ) : null}
      </div>

      <div className="rechargeMapSide">
        <div className="rechargeLegend">
          {stops.map((stop) => (
            <span className="rechargeKey" key={stop.label}>
              <span className="rechargeSwatch" style={{ background: stop.fill }} />
              {stop.label}
            </span>
          ))}
          <span className="rechargeKey">
            <span className="rechargeSwatch noData" />
            unresolved or missing evidence
          </span>
        </div>
        <div className={`rechargeReadout ${active ? "live" : ""}`} aria-live="polite">
          {active ? (
            <>
              <strong>
                {active.mandal}, {active.district}
              </strong>
              <span>
                {active.thisSeasonM > 0 ? "Fell" : "Rose"} {Math.abs(active.thisSeasonM).toFixed(2)} m since May,
                against {active.typicalM > 0 ? "a fall of" : "a rise of"} {Math.abs(active.typicalM).toFixed(2)} m
                in a normal year.
              </span>
              <span className="rechargeReadoutMeta">
                Recorded at {active.latestDepthM.toFixed(2)} m bgl · {active.aquifer.replace("_", " ")} ·{" "}
                {active.comparableYears} comparable years
              </span>
              {active.shortfallMm3 !== null && active.specificYield !== null ? (
                <span className="rechargeReadoutMeta">
                  {active.shortfallMm3.toFixed(1)} Mm³ storage proxy — {active.shortfallM.toFixed(2)} m over{" "}
                  {active.areaKm2?.toFixed(0)} km² at a specific yield of {active.specificYield}
                </span>
              ) : null}
            </>
          ) : (
            <span>
              {hover && byBoundary.get(hover.index) === null ? "Multiple source series share this boundary; reconcile their identities before using a local value." : "Colours show departure from the retained seasonal baseline, not measured recharge, crop condition or a drought declaration."}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Every season measured from its May reading, in the direction a reader expects:
 *  a recharging monsoon lifts the line, a failing one drops it. */
export function RechargeTrajectory() {
  const series = monsoonWatch.trajectory;
  const current = series.find((s) => s.current);
  const past = series.filter((s) => !s.current);
  if (!current || past.length < 3) return null;

  // Stored as change in DEPTH, where negative means the table came up. Negated
  // here so the axis runs the way the question does: up is more water.
  const rise = (changeM: number) => -changeM;
  const months = [5, 6, 7, 8, 9, 10, 11, 12];
  const bandFor = (month: number) => {
    const values = past
      .map((s) => s.points.find((p) => p.month === month))
      .filter((p): p is { month: number; changeM: number } => !!p)
      .map((p) => rise(p.changeM));
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return {
      month,
      low: sorted[0],
      high: sorted[sorted.length - 1],
      mid: sorted[Math.floor(sorted.length / 2)],
    };
  };
  const band = months.map(bandFor).filter((b): b is NonNullable<typeof b> => !!b);
  const nowPoints = current.points.map((p) => ({ month: p.month, value: rise(p.changeM) }));

  const all = [...band.flatMap((b) => [b.low, b.high]), ...nowPoints.map((p) => p.value), 0];
  // A little headroom, so the current line is never drawn flush against the axis
  // and read as clipped.
  const headroom = (Math.max(...all) - Math.min(...all)) * 0.08 || 0.2;
  const lo = Math.min(...all) - headroom;
  const hi = Math.max(...all) + headroom;
  const width = 720;
  const height = 236;
  const pad = { top: 16, right: 14, bottom: 26, left: 54 };
  const x = (month: number) => pad.left + ((month - 5) / 7) * (width - pad.left - pad.right);
  const y = (value: number) =>
    pad.top + ((hi - value) / (hi - lo || 1)) * (height - pad.top - pad.bottom);

  const envelope =
    band.map((b) => `${b === band[0] ? "M" : "L"}${x(b.month).toFixed(1)} ${y(b.high).toFixed(1)}`).join(" ") +
    " " +
    [...band].reverse().map((b) => `L${x(b.month).toFixed(1)} ${y(b.low).toFixed(1)}`).join(" ") +
    " Z";
  const median = band.map((b, i) => `${i === 0 ? "M" : "L"}${x(b.month).toFixed(1)} ${y(b.mid).toFixed(1)}`).join(" ");
  const now = nowPoints.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.month).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const ticks = [hi, (hi + lo) / 2, lo];
  const last = nowPoints[nowPoints.length - 1];

  return (
    <div className="trajectoryWrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="trajectorySvg" role="img"
           aria-label="How far the water table has risen since May, this season against the ten before it">
        {ticks.map((value, i) => (
          <g key={i}>
            <line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} className="trajGrid" />
            <text x={pad.left - 8} y={y(value) + 4} className="trajAxis" textAnchor="end">
              {value > 0.05 ? "+" : ""}{value.toFixed(1)} m
            </text>
          </g>
        ))}
        <path d={envelope} className="trajBand" />
        <path d={median} className="trajMedian" />
        <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} className="trajZero" />
        <text x={width - pad.right - 4} y={y(0) - 7} className="trajAxisNote" textAnchor="end">
          level with May
        </text>
        <path d={now} className="trajNow" />
        {nowPoints.map((p) => (
          <circle key={p.month} cx={x(p.month)} cy={y(p.value)} r={4} className="trajNowDot" />
        ))}
        <text x={x(last.month) + 8} y={y(last.value) + 4} className="trajNowLabel">
          {current.year}
        </text>
        {months.map((month) => (
          <text key={month} x={x(month)} y={height - 8} className="trajAxis" textAnchor="middle">
            {MONTHS[month]}
          </text>
        ))}
      </svg>
      <div className="trajKey">
        <span><span className="trajKeySwatch band" /> the range across the ten seasons before this one</span>
        <span><span className="trajKeyLine median" /> their median</span>
        <span><span className="trajKeyLine now" /> {current.year}</span>
        <span className="trajKeyNote">above the dashed line the water table has risen since May</span>
      </div>
    </div>
  );
}

/** Forty-six June–Augusts, with the El Niño ones marked.
 *
 *  No <title> children on the bars. The browser treats a <title> inside the SVG
 *  as document metadata and moves it, so it is absent from the parsed server
 *  HTML and present once React has hydrated -- a mismatch that made React throw
 *  out the whole tree and re-render it on the client. The readout below the
 *  chart does the same job and answers faster than a native tooltip.
 */
export function RainfallHistory() {
  const history = monsoonWatch.rainfallHistory;
  const [hover, setHover] = useState<number | null>(null);
  if (!history) return null;
  const rows = history.years;
  const max = Math.max(...rows.map((r) => r.mm));
  const width = 720;
  const height = 250;
  const pad = { top: 12, right: 8, bottom: 34, left: 46 };
  const band = (width - pad.left - pad.right) / rows.length;
  const y = (mm: number) => pad.top + (1 - mm / max) * (height - pad.top - pad.bottom);
  const meanY = y(history.meanMm);
  const current = rows[rows.length - 1];
  const hovered = rows.find((r) => r.year === hover) ?? null;

  return (
    <div className="rainHistWrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="rainHistSvg" role="img"
           aria-label="June to August rainfall for every year since 1981, El Nino years marked"
           onMouseLeave={() => setHover(null)}>
        <line x1={pad.left} x2={width - pad.right} y1={meanY} y2={meanY} className="rainMean" />
        <text x={pad.left - 8} y={meanY + 4} className="trajAxis" textAnchor="end">
          {Math.round(history.meanMm)} mm
        </text>
        {rows.map((row, index) => {
          const top = y(row.mm);
          return (
            <rect
              key={row.year}
              x={pad.left + index * band + band * 0.14}
              y={top}
              width={band * 0.72}
              height={height - pad.bottom - top}
              className={`rainBar ${row.state} ${row.year === current.year ? "current" : ""} ${
                hover === row.year ? "hot" : ""
              }`}
              onMouseEnter={() => setHover(row.year)}
              onMouseLeave={() => setHover((y) => (y === row.year ? null : y))}
            />
          );
        })}
        {rows.filter((r) => r.year % 5 === 0).map((row) => (
          <text
            key={row.year}
            x={pad.left + rows.indexOf(row) * band + band / 2}
            y={height - 14}
            className="trajAxis"
            textAnchor="middle"
          >
            {row.year}
          </text>
        ))}
      </svg>
      <div className="rainHistReadout">
        {hovered ? (
          <>
            <strong>{hovered.year}</strong>
            <span>
              {hovered.mm} mm, {hovered.anomalyPct > 0 ? "+" : ""}
              {hovered.anomalyPct}% against the {rows.length}-year mean
            </span>
            <em className={hovered.state}>
              {hovered.state === "el_nino"
                ? "El Niño monsoon"
                : hovered.state === "la_nina"
                  ? "La Niña monsoon"
                  : "neutral"}
              {hovered.oniJjaC === null
                ? ""
                : ` · ONI ${hovered.oniJjaC > 0 ? "+" : ""}${hovered.oniJjaC.toFixed(2)} °C`}
            </em>
          </>
        ) : (
          <span>Hover a year for its rainfall and the ocean state that came with it.</span>
        )}
      </div>
      <div className="trajKey">
        <span><span className="rainKeySwatch el_nino" /> El Niño monsoon</span>
        <span><span className="rainKeySwatch la_nina" /> La Niña monsoon</span>
        <span><span className="rainKeySwatch neutral" /> neutral</span>
        <span className="trajKeyNote">
          line is the {rows.length}-year mean · {current.year} is {Math.abs(current.anomalyPct)}% below it
        </span>
      </div>
    </div>
  );
}


/** Two years of the Oceanic Nino Index. The card carried one number; the climb
 *  from a La Nina winter to the warmest June-August in the record is the part
 *  that says why this season is being watched. */
export function EnsoTrail() {
  const enso = monsoonWatch.enso;
  if (!enso || enso.recent.length < 6) return null;
  const rows = enso.recent;
  const width = 300;
  const height = 74;
  const pad = { top: 8, right: 6, bottom: 12, left: 6 };
  const values = rows.map((r) => r.oniC);
  // Headroom, or the current point is drawn flush against the top edge and its
  // marker is clipped exactly when the index is at its most extreme.
  const lo = Math.min(-0.6, ...values) - 0.25;
  const hi = Math.max(0.6, ...values) + 0.25;
  const x = (i: number) => pad.left + (i / (rows.length - 1)) * (width - pad.left - pad.right);
  const y = (v: number) => pad.top + ((hi - v) / (hi - lo)) * (height - pad.top - pad.bottom);
  const line = rows.map((r, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(r.oniC).toFixed(1)}`).join(" ");
  const last = rows[rows.length - 1];

  return (
    <div className="ensoTrail">
      <svg viewBox={`0 0 ${width} ${height}`} role="img"
           aria-label={`Oceanic Nino Index over the last ${rows.length} months`}>
        <line x1={pad.left} x2={width - pad.right} y1={y(0.5)} y2={y(0.5)} className="ensoTrailThreshold" />
        <line x1={pad.left} x2={width - pad.right} y1={y(-0.5)} y2={y(-0.5)} className="ensoTrailThreshold" />
        <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} className="ensoTrailZero" />
        <path d={line} className="ensoTrailLine" />
        <circle cx={x(rows.length - 1)} cy={y(last.oniC)} r={3.5} className="ensoTrailDot" />
      </svg>
      <span className="ensoTrailNote">
        {rows[0].date} to {last.date} · dashed lines are the ±0.5 °C El Niño and La Niña thresholds
      </span>
    </div>
  );
}

/** How an El Niño reaches a well in Andhra Pradesh, in four measured steps.
 *
 *  Written because the explainers that circulate are Pacific-facing and stop
 *  at the ocean: they show sea surface temperature off Peru and never reach a
 *  monsoon, let alone an aquifer. Every figure here is one this site already
 *  publishes and sources, so the chain can be checked rather than believed.
 *
 *  The honesty that matters is in the last line: three of these links are
 *  measured directly and the one between the ocean and the rain is a
 *  statistical association over 45 years. Nothing here models a mechanism.
 */
export function ElNinoChain() {
  const w = monsoonWatch;
  const enso = w.enso;
  const rain = w.rainfall;
  const sw = w.elNinoRainfall.swMonsoon;
  if (!enso || !rain || !sw) return null;

  const steps = [
    {
      key: "ocean",
      eyebrow: "1 · The Pacific",
      value: `${enso.oniC > 0 ? "+" : ""}${enso.oniC.toFixed(2)} °C`,
      lead: "warmer than normal in the Niño 3.4 box",
      body: `A band of the equatorial Pacific runs warm. The index describes the ${enso.season} ${enso.asOf.slice(0, 4)} ocean state; local rainfall outcomes also depend on other climate and weather influences.`,
      source: "NOAA Oceanic Niño Index",
    },
    {
      key: "monsoon",
      eyebrow: "2 · The monsoon",
      value: `${sw.elNinoAnomalyPct}%`,
      lead: "average June–September rain in El Niño years",
      body: `CHIRPS analysis across ${sw.years} years: below normal in ${sw.elNinoBelowNormal} of ${sw.elNinoYears} warm-index years, against ${sw.belowNormalAllYears} of ${sw.allYears} overall. These are historical associations, not independent causal events.`,
      source: `CHIRPS ${sw.firstYear}–${sw.lastYear}`,
    },
    {
      key: "season",
      eyebrow: "3 · This season",
      value: `${rain.anomalyPct}%`,
      lead: `June–August rain, ${rain.rankDriest === 1 ? "the driest" : `${rain.rankDriest}nd driest`} of ${rain.ofYears}`,
      body: `${formatMm(rain.mm)} mm fell against a ${formatMm(rain.normalMm)} mm normal for the same months. This observed deficit is not an attribution to El Niño.`,
      source: `CHIRPS, ${rain.firstYear} onward`,
    },
    {
      key: "aquifer",
      eyebrow: "4 · The aquifer",
      value: `${w.recharge.fallingPct}%`,
      lead: "of mandals lower than they were in May",
      body: "Derived from monthly source-series depth changes. The baseline inherits model-history eligibility filters; hydrological review is pending. This is not measured recharge or a crop-loss forecast.",
      source: "APWRIMS monthly readings",
    },
  ];

  return (
    <div className="chain">
      {steps.map((step, index) => (
        <div className="chainStep" key={step.key}>
          <span className="chainEyebrow">{step.eyebrow}</span>
          <strong className="chainValue">{step.value}</strong>
          <span className="chainLead">{step.lead}</span>
          <p className="chainBody">{step.body}</p>
          <span className="chainSource">{step.source}</span>
          {index < steps.length - 1 ? (
            <span className="chainArrow" aria-hidden="true">
              <svg viewBox="0 0 24 24" role="presentation">
                <path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function formatMm(value: number) {
  return value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
