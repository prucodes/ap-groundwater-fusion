"use client";

import Link from "next/link";
import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { agricultureCsv, AGREEMENT_RULES, GEC_CATEGORIES, outlineLabel, VCI_CLASSES, WATER_SIGNALS, type Agreement, type AgricultureEvidence, type AgricultureMandal, type WaterSignal } from "../../lib/agriculture";
import type { CheckRecord, LiveField } from "../../lib/cropWater";
import { IconArrowRight, IconChevronLeft, IconChevronRight, IconDownload, IconGrid, IconInfo, IconLeaf, IconMap, IconSearch, IconShield } from "../icons";
import { CropWaterLab } from "./CropWaterLab";
import { FieldSignalsStrip } from "./FieldSignalsStrip";
import { LiveCropCheck, type LabPreset } from "./LiveCropCheck";
import { GovernanceBrief } from "./GovernanceBrief";
import { mandalContext, WaterContextStrip } from "./WaterContextStrip";
import { day } from "./waterContextFormat";
import styles from "./AgricultureWorkspace.module.css";
import { PageBriefBand } from "../PageBrief";
import type { PageBrief } from "../../lib/pageBriefs";

const assetRoot = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets`;
function label(value: string) {
  if (/[a-z]/.test(value)) return value;
  return value.split(" ").map(word => word === "NTR" || word.includes(".") ? word : word[0] + word.slice(1).toLowerCase()).join(" ");
}
function period(value: string) {
  const [year, month] = value.split("-");
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(month) - 1] ?? month} ${year}`;
}
const num = (value: number | null) => value === null ? "Not available" : value.toFixed(2);
const isFlagged = (row: AgricultureMandal) => row.signal === "short" || row.signal === "severe";

function SeasonComparison({ row }: { row: AgricultureMandal }) {
  if (row.changeM === null || row.typicalM === null) return null;
  const limit = Math.max(1, Math.abs(row.changeM), Math.abs(row.typicalM)) * 1.22;
  const x = (value: number) => 152 + value / limit * 122;
  return <figure className={styles.seasonChart}>
    <figcaption>Change in groundwater depth <span>metres</span></figcaption>
    <svg viewBox="0 0 310 128" role="img" aria-label={`Typical change ${row.typicalM} metres; this season ${row.changeM} metres. Positive means deeper groundwater.`}>
      <line x1="152" x2="152" y1="20" y2="98" stroke="currentColor" opacity=".25" />
      <text x="24" y="13">Shallower</text><text x="287" y="13" textAnchor="end">Deeper</text>
      {[{ value: row.typicalM, y: 46, name: "Typical", color: "#428879" }, { value: row.changeM, y: 84, name: "This season", color: WATER_SIGNALS[row.signal].color }].map(item => <g key={item.name}>
        <line x1="152" x2={x(item.value)} y1={item.y} y2={item.y} stroke={item.color} strokeWidth="5" strokeLinecap="round" />
        <circle cx={x(item.value)} cy={item.y} r="5" fill={item.color} />
        <text x={x(item.value)} y={item.y - 10} textAnchor="middle" className={styles.chartNumber}>{item.value > 0 ? "+" : ""}{item.value.toFixed(2)}</text>
        <text x="10" y={item.y + 19}>{item.name}</text>
      </g>)}
      <text x="152" y="123" textAnchor="middle">0 / no change</text>
    </svg>
  </figure>;
}

const SOURCE_NAMES = { groundwater: "Groundwater", rain: "Gauge rain", soil: "Soil moisture" } as const;

/** What the water-watch map and fieldbook colour by: the groundwater signal (the page's
 * own flags), the satellite vegetation index, or the official groundwater category. */
type ColorBy = "groundwater" | "vegetation" | "assessment";
const NO_VALUE = "#d3d9dc";
function rowColor(row: AgricultureMandal, colorBy: ColorBy) {
  if (colorBy === "vegetation") return row.vegetation ? VCI_CLASSES[row.vegetation.cls].color : NO_VALUE;
  if (colorBy === "assessment") return row.assessment ? GEC_CATEGORIES[row.assessment.cat].color : NO_VALUE;
  return WATER_SIGNALS[row.signal].color;
}
function rowLabel(row: AgricultureMandal, colorBy: ColorBy) {
  if (colorBy === "vegetation") return row.vegetation ? `Crop vegetation ${row.vegetation.vci.toFixed(0)}, ${VCI_CLASSES[row.vegetation.cls].label.toLowerCase()}` : "No vegetation value";
  if (colorBy === "assessment") return row.assessment ? `Groundwater category ${GEC_CATEGORIES[row.assessment.cat].label}` : "No matched assessment unit";
  return WATER_SIGNALS[row.signal].label;
}
function vegetationText(row: AgricultureMandal) {
  return row.vegetation ? `${row.vegetation.vci.toFixed(0)} · ${VCI_CLASSES[row.vegetation.cls].short}${row.vegetation.fewFields ? " · few fields" : ""}` : "No value";
}
function assessmentText(row: AgricultureMandal) {
  return row.assessment ? `${GEC_CATEGORIES[row.assessment.cat].label}${row.assessment.stagePct !== null ? ` · ${row.assessment.stagePct.toFixed(0)}% drawn` : ""}` : "Not matched";
}

/** Three marks, one per source: filled points to stress, open does not, dashed has no usable value. */
function AgreementDots({ agreement }: { agreement: Agreement }) {
  const parts = (["groundwater", "rain", "soil"] as const).map(key => ({ key, value: agreement[key] }));
  const said = parts.map(part => `${SOURCE_NAMES[part.key]}: ${part.value === null ? "no usable value" : part.value ? "points to stress" : "does not"}`).join("; ");
  return <span className={styles.agreement} role="img" aria-label={`${agreement.stressed} of ${agreement.known} usable signals point to stress. ${said}.`} title={said}>
    {parts.map(part => <i key={part.key} data-state={part.value === null ? "unknown" : part.value ? "stress" : "clear"} />)}
    <b>{agreement.stressed}<small>/{agreement.known}</small></b>
  </span>;
}

/** Rain, soil and the two links still missing, shown whether or not the groundwater compares. */
function SeasonContext({ row, evidence }: { row: AgricultureMandal; evidence: AgricultureEvidence }) {
  const context = mandalContext(row, evidence);
  return <dl className={`${styles.evidenceFacts} ${styles.contextFacts}`} aria-label="Season context">
    <div><dt>Signals pointing to stress</dt><dd><AgreementDots agreement={row.agreement} /></dd></div>
    <div><dt>{context.rainLabel}</dt><dd data-tone={row.rain && row.rain.deviationPct <= -20 ? "short" : undefined}>{context.rain}</dd></div>
    <div><dt>{context.soilLabel}</dt><dd>{context.soil}{context.soilRank ? <small>{context.soilRank}</small> : null}</dd></div>
    <div><dt>Crop vegetation <small>satellite, 4 weeks</small></dt><dd data-tone={row.vegetation?.cls === "severe" ? "short" : undefined}>{vegetationText(row)}</dd></div>
    <div><dt>Groundwater category <small>{evidence.field?.assessment?.year ?? ""}</small></dt><dd data-tone={row.assessment && ["critical", "over_exploited"].includes(row.assessment.cat) ? "short" : undefined}>{assessmentText(row)}{row.assessment?.prev && row.assessment.prev.cat !== row.assessment.cat ? <small>{GEC_CATEGORIES[row.assessment.prev.cat].label} in {evidence.field?.assessment?.previousYear}</small> : null}</dd></div>
    <div><dt>Crop / sown area</dt><dd>Not connected</dd></div>
    <div><dt>Canal delivery to this mandal</dt><dd>Not connected</dd></div>
  </dl>;
}

function SelectedEvidence({ row, evidence, choices, onSelect }: { row: AgricultureMandal | undefined; evidence: AgricultureEvidence; choices: AgricultureMandal[]; onSelect: (index: number) => void }) {
  return <aside className={styles.detailRail} aria-label="Selected mandal evidence">
    <span className={styles.eyebrow}>Local evidence / not crop condition</span>
    {row ? <>
      <label className={styles.selectLabel}>Mandal<select aria-label="Selected mandal" value={row.index} onChange={event => onSelect(Number(event.target.value))}>{choices.map(choice => <option key={choice.index} value={choice.index}>{label(choice.mandal)} · {label(choice.district)}</option>)}</select></label>
      <h3>{label(row.mandal)}</h3><p className={styles.districtName}>{label(row.district)}</p>
      <span className={styles.signalTag} style={{ color: WATER_SIGNALS[row.signal].color }}><i />{WATER_SIGNALS[row.signal].label}</span>
      {row.signal === "unavailable" ? <p className={styles.emptyDetail}>{row.reason}</p> : <>
        <div className={styles.depth}><strong>{num(row.depthM)}<small> m bgl</small></strong><span>Recorded source-series depth · {period(evidence.period)}</span></div>
        <SeasonComparison row={row} />
        <dl className={styles.evidenceFacts}><div><dt>Shortfall against own normal</dt><dd>{num(row.shortfallM)} m</dd></div><div><dt>Comparable past seasons</dt><dd>{row.comparableYears}</dd></div></dl>
      </>}
      <SeasonContext row={row} evidence={evidence} />
      <div className={styles.nextReview}><IconShield /><div><strong>Proposed field check</strong><p>{row.signal === "unavailable" ? "Reconcile source identity and confirm a current groundwater reading." : isFlagged(row) ? "Confirm current well readings, irrigation source and crop stage before reviewing supply options." : "Continue local monitoring. Not flagged does not mean crops are safe."}</p><small>Not assigned · not an issued advisory</small></div></div>
      <p className={styles.sourceNote}>{row.sourceStatus}. {outlineLabel(row)}. Water-table movement is not a direct recharge measurement.</p>
      {row.id ? <Link className={styles.detailLink} href={`/mandals/${row.id}`}>Full groundwater record <IconArrowRight /></Link> : null}
    </> : <p className={styles.emptyDetail}>No mandals match these filters.</p>}
  </aside>;
}

function MandalMap({ evidence, rows, active, mapView, onSelect, colorBy }: { evidence: AgricultureEvidence; rows: AgricultureMandal[]; active: AgricultureMandal | undefined; mapView: { width: number; height: number }; onSelect: (index: number) => void; colorBy: ColorBy }) {
  const figure = useRef<HTMLDivElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const [hover, setHover] = useState<{ row: AgricultureMandal; x: number; y: number } | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [position, setPosition] = useState({ left: 10, top: 10 });
  const visible = new Set(rows.map(row => row.index));
  const tabIndex = focusIndex !== null && visible.has(focusIndex) ? focusIndex : active?.index;

  useLayoutEffect(() => {
    if (!hover || !figure.current || !tooltip.current) return;
    const place = () => {
      const frame = figure.current!, card = tooltip.current!;
      const x = hover.x * frame.clientWidth, y = hover.y * frame.clientHeight;
      const left = x + card.offsetWidth + 18 < frame.clientWidth ? x + 18 : x - card.offsetWidth - 18;
      const top = y + card.offsetHeight + 14 < frame.clientHeight ? y + 14 : y - card.offsetHeight - 14;
      setPosition({ left: Math.max(10, Math.min(frame.clientWidth - card.offsetWidth - 10, left)), top: Math.max(10, Math.min(frame.clientHeight - card.offsetHeight - 10, top)) });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(figure.current); observer.observe(tooltip.current);
    return () => observer.disconnect();
  }, [hover]);

  function show(row: AgricultureMandal, element: SVGPathElement, point?: { clientX: number; clientY: number }) {
    if (!visible.has(row.index) || !figure.current) return;
    const frame = figure.current.getBoundingClientRect(), bounds = element.getBoundingClientRect();
    setHover({ row, x: ((point?.clientX ?? bounds.x + bounds.width / 2) - frame.x) / frame.width, y: ((point?.clientY ?? bounds.y + bounds.height / 2) - frame.y) / frame.height });
  }

  return <div ref={figure} className={styles.mapFigure} data-testid="agriculture-map" onPointerLeave={() => setHover(null)} onKeyDown={event => { if (event.key === "Escape") { setHover(null); event.stopPropagation(); } }}>
    <svg viewBox={`0 0 ${mapView.width} ${mapView.height}`} role="group" aria-label="AP groundwater water-watch map" onClick={event => { if (event.target === event.currentTarget) setHover(null); }}>
      {evidence.mandals.map(row => <path key={row.index} d={row.path} fill={rowColor(row, colorBy)} opacity={visible.has(row.index) ? 1 : .12}
        className={active?.index === row.index ? styles.selectedPath : ""} data-mandal-index={row.index} data-highlighted={hover?.row.index === row.index}
        role="button" tabIndex={row.index === tabIndex ? 0 : -1} aria-label={`${label(row.mandal)}: ${rowLabel(row, colorBy)}`} aria-disabled={!visible.has(row.index)}
        aria-describedby={hover?.row.index === row.index ? tooltipId : undefined}
        onPointerEnter={event => { if (event.pointerType !== "touch") show(row, event.currentTarget, event); }}
        onFocus={event => { setFocusIndex(row.index); show(row, event.currentTarget); }} onBlur={() => setHover(null)}
        onClick={event => { if (visible.has(row.index)) { onSelect(row.index); show(row, event.currentTarget); } }}
        onKeyDown={event => {
          if (!visible.has(row.index)) return;
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(row.index); show(row, event.currentTarget); }
          if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            const offset = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
            const next = rows[(rows.findIndex(item => item.index === row.index) + offset + rows.length) % rows.length];
            figure.current?.querySelector<SVGPathElement>(`[data-mandal-index="${next.index}"]`)?.focus();
          }
        }} />)}
    </svg>
    <span className={styles.seaLabel}>BAY OF BENGAL</span><span className={styles.north}>N ↑</span>
    {hover && <div ref={tooltip} id={tooltipId} role="tooltip" className={styles.mapTooltip} data-signal={hover.row.signal} style={{ ...position, "--status-color": WATER_SIGNALS[hover.row.signal].color } as CSSProperties}>
      <div className={styles.tooltipHeading}><span>{label(hover.row.district)} district</span><strong>{label(hover.row.mandal)}</strong></div>
      <span className={styles.tableSignal}><i style={{ background: WATER_SIGNALS[hover.row.signal].color }} />{WATER_SIGNALS[hover.row.signal].label}</span>
      {hover.row.signal === "unavailable" ? <p className={styles.tooltipMissing}>{hover.row.reason || "Comparable groundwater evidence is not available."}</p> : <dl>
        <div><dt>Recorded depth <small>{period(evidence.period)}</small></dt><dd>{num(hover.row.depthM)} <small>m bgl</small></dd></div>
        <div><dt>Shortfall vs own normal</dt><dd>{num(hover.row.shortfallM)} <small>m</small></dd></div>
        <div><dt>Comparable past seasons</dt><dd>{hover.row.comparableYears ?? "Unavailable"}</dd></div>
      </dl>}
      {(() => { const context = mandalContext(hover.row, evidence); return <dl className={styles.tooltipContext}>
        <div><dt>Gauge rain <small>season</small></dt><dd>{context.rain}</dd></div>
        <div><dt>Soil moisture <small>{evidence.water.soil ? `${evidence.water.soil.depthCm} cm` : ""}</small></dt><dd>{context.soil}</dd></div>
        <div><dt>Crop vegetation <small>VCI</small></dt><dd>{vegetationText(hover.row)}</dd></div>
        <div><dt>Groundwater category</dt><dd>{assessmentText(hover.row)}</dd></div>
      </dl>; })()}
      <p className={styles.tooltipCaveat}>{outlineLabel(hover.row)} · crop records not connected</p>
    </div>}
  </div>;
}

export function AgricultureWorkspace({ evidence, mapView, sourceStatus, live = null, record = null, brief = null }: { evidence: AgricultureEvidence; mapView: { width: number; height: number }; sourceStatus?: ReactNode; live?: LiveField | null; record?: CheckRecord | null; brief?: PageBrief | null }) {
  const [labPreset, setLabPreset] = useState<LabPreset | null>(null);
  const [colorBy, setColorBy] = useState<ColorBy>("groundwater");
  function openLab(preset: LabPreset) {
    setLabPreset(preset);
    requestAnimationFrame(() => document.getElementById("crop-water-lab")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }));
  }
  const [district, setDistrict] = useState("all");
  const [signal, setSignal] = useState("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"fieldbook" | "map">("fieldbook");
  const [selected, setSelected] = useState(() => [...evidence.mandals].filter(isFlagged).sort((a, b) => (b.shortfallM ?? 0) - (a.shortfallM ?? 0))[0]?.index ?? 0);
  const [page, setPage] = useState(0);
  const matchesSignal = (row: AgricultureMandal) => signal === "all" ? true
    : signal === "flagged" ? isFlagged(row)
      : signal === "agree3" ? row.agreement.stressed === 3
        : signal === "agree2" ? row.agreement.stressed >= 2
          : row.signal === "unavailable";
  const rows = evidence.mandals.filter(row => (district === "all" || row.district === district) && matchesSignal(row) &&
    `${row.district} ${row.mandal}`.toLowerCase().includes(query.trim().toLowerCase()));
  const active = rows.find(row => row.index === selected) ?? rows.find(isFlagged) ?? rows[0];
  const grouped = evidence.districts.map(d => ({ ...d, rows: rows.filter(row => row.district === d.name) })).filter(d => d.rows.length > 0);
  const ordered = [...rows].sort((a, b) => {
    const order: Record<WaterSignal, number> = { severe: 0, short: 1, unavailable: 2, normal: 3 };
    return order[a.signal] - order[b.signal] || b.agreement.stressed - a.agreement.stressed || (b.shortfallM ?? -Infinity) - (a.shortfallM ?? -Infinity) || a.mandal.localeCompare(b.mandal);
  });
  function showAgreement() {
    setDistrict("all"); setSignal("agree3"); setQuery(""); setPage(0); setView("map");
    const firstAgreeing = evidence.mandals.filter(row => row.agreement.stressed === 3).sort((a, b) => (b.shortfallM ?? 0) - (a.shortfallM ?? 0))[0];
    if (firstAgreeing) setSelected(firstAgreeing.index);
    requestAnimationFrame(() => {
      const heading = document.getElementById("agriculture-watch-title");
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    });
  }
  const pageCount = Math.max(1, Math.ceil(ordered.length / 10));
  const currentPage = Math.min(page, pageCount - 1);
  function exportReview() {
    const blob = new Blob([agricultureCsv(ordered, evidence)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `agriculture-water-review-${evidence.period}.csv`;
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }
  const flaggedPercent = evidence.counts.compared ? Math.round(evidence.counts.flagged / evidence.counts.compared * 100) : null;

  return <div className={`pageWrap ${styles.workspace}`}>
    <header className={styles.hero}>
      <img src={`${assetRoot}/agriculture-landscape.webp`} alt="Illustrative South Indian farmland and irrigation canal, not a satellite observation" width="2172" height="724" fetchPriority="high" />
      <div className={styles.heroCopy}><span className={styles.heroEyebrow}><IconLeaf />Andhra Pradesh / Agriculture</span><h1>Agriculture &amp;<br />Water Intelligence</h1><p>Water evidence. Crop context. Better questions for the field.</p></div>
      <span className={styles.heroCredit}>AI landscape illustration</span>
    </header>
    {brief ? <PageBriefBand brief={brief} /> : null}
    <div className={styles.notice}><IconInfo /><p><strong>Prototype planning workspace.</strong> Groundwater evidence and illustrative crop scenarios are separate. Gauge rainfall, modelled soil moisture and reservoir storage come from APWRIMS; reference evapotranspiration and rain from ECMWF&rsquo;s open forecast; crop vegetation from NOAA&rsquo;s satellite index; the groundwater category from the official assessment on INGRES. Each is dated. Crop booking and canal delivery to fields are not connected. No field watering instruction or crop-loss prediction.</p></div>
    {sourceStatus}
    <nav className={`${styles.sectionNav} jumpNav`} aria-label="Agriculture sections"><a href="#agriculture-brief">01 <span>District brief</span></a><a href="#field-week">02 <span>This week in the fields</span></a><a href="#crop-water-lab">03 <span>Crop-water lab</span></a><a href="#agriculture-watch">04 <span>Water watch</span></a><a href="#agriculture-readiness">05 <span>Evidence readiness</span></a><Link href="/drought">06 <span>Drought manual →</span></Link><span className={styles.snapshot}>Observed window: {period(evidence.startPeriod)} to {period(evidence.period)}</span></nav>
    <div className={styles.metrics} aria-label="State evidence summary">
      <div><span>Compared boundary units</span><strong>{evidence.counts.compared}<small> / {evidence.counts.boundaries}</small></strong><em>Unique joins · prototype mandals</em></div>
      <div><span>Seasonal shortfall flags</span><strong className={styles.alertNumber}>{evidence.counts.flagged}<small>{flaggedPercent === null ? "" : ` / ${flaggedPercent}%`}</small></strong><em>Of compared units · not crop loss</em></div>
      <div><span>Crop-area exposure</span><strong className={styles.pendingNumber}>Not assessed</strong><em>Crop records not connected</em></div>
      <div><span>Unresolved / missing</span><strong>{evidence.counts.unresolved}</strong><em>Kept visible, never treated as safe</em></div>
      <div className={styles.agreeTile} data-testid="agreement-tile"><span>Three signals agree</span><strong>{evidence.counts.agreeAll}<small> / {evidence.counts.allKnown}</small></strong><em>Groundwater, gauge rain and soil all point to stress · of units where all three are usable</em>
        {evidence.counts.agreeAll ? <button type="button" className={styles.textButton} onClick={showAgreement}>Show them on the map</button> : null}</div>
    </div>

    <GovernanceBrief evidence={evidence} onInspect={(name, reviewSignal) => {
      setDistrict(name); setSignal(reviewSignal); setQuery(""); setPage(0); setView("fieldbook");
      requestAnimationFrame(() => {
        const heading = document.getElementById("agriculture-watch-title");
        heading?.focus({ preventScroll: true });
        heading?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
      });
    }} />
    <LiveCropCheck live={live} evidence={evidence} mapView={mapView} onOpenLab={openLab} record={record} />
    <CropWaterLab preset={labPreset} onClearPreset={() => setLabPreset(null)} />

    <section id="agriculture-watch" className={styles.section} aria-labelledby="agriculture-watch-title">
      <header className={styles.sectionHead}><div><span className={styles.eyebrow}>04 / Observed water evidence</span><h2 id="agriculture-watch-title" tabIndex={-1}>Where does the water story need a closer look?</h2></div><span className={styles.observedBadge}>Groundwater readings · {period(evidence.period)}</span></header>
      <WaterContextStrip evidence={evidence} />
      <FieldSignalsStrip evidence={evidence} />
      <p className={styles.contextCaption}>Context only: rainfall, soil moisture, storage, the vegetation index and the assessment do not change the groundwater flags below, and none of them is the crop-water lab&rsquo;s effective rain. Colour the map by any of the three views.</p>
      <div className={styles.filters}>
        <label className={styles.search}><IconSearch /><input aria-label="Search mandals or districts" placeholder="Search mandal or district" type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
        <select aria-label="District filter" value={district} onChange={event => { setDistrict(event.target.value); setPage(0); }}><option value="all">All districts</option>{evidence.districts.slice().sort((a, b) => a.name.localeCompare(b.name)).map(d => <option key={d.name} value={d.name}>{label(d.name)}</option>)}</select>
        <select aria-label="Water signal filter" value={signal} onChange={event => { setSignal(event.target.value); setPage(0); }}><option value="all">All water signals</option><option value="flagged">Flagged shortfalls</option><option value="agree3">All three signals agree</option><option value="agree2">Two or more signals agree</option><option value="unavailable">Unresolved / missing</option></select>
        <button type="button" className={styles.exportButton} onClick={exportReview} disabled={!rows.length}><IconDownload />Export review</button>
      </div>
      <div className={styles.watchLayout}>
        <div className={styles.watchMain}>
          <div className={styles.viewToolbar}><div className={styles.segmented} role="group" aria-label="Evidence view"><button type="button" aria-pressed={view === "fieldbook"} onClick={() => setView("fieldbook")}><IconGrid />District fieldbook</button><button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}><IconMap />AP map</button></div><span>{rows.length} boundary units</span></div>
          <div className={styles.colorBy} role="group" aria-label="Colour mandals by"><span>Colour by</span>
            <button type="button" aria-pressed={colorBy === "groundwater"} onClick={() => setColorBy("groundwater")}>Groundwater signal</button>
            <button type="button" aria-pressed={colorBy === "vegetation"} onClick={() => setColorBy("vegetation")} disabled={!evidence.field?.vegetation}>Crop vegetation</button>
            <button type="button" aria-pressed={colorBy === "assessment"} onClick={() => setColorBy("assessment")} disabled={!evidence.field?.assessment}>Groundwater category</button>
          </div>
          <div className={styles.legend} data-testid="watch-legend">{colorBy === "vegetation"
            ? <>{(Object.keys(VCI_CLASSES) as Array<keyof typeof VCI_CLASSES>).map(key => <span key={key}><i style={{ background: VCI_CLASSES[key].color }} />{VCI_CLASSES[key].label} ({VCI_CLASSES[key].range})</span>)}<span><i style={{ background: NO_VALUE }} />No value</span></>
            : colorBy === "assessment"
              ? <>{(Object.keys(GEC_CATEGORIES) as Array<keyof typeof GEC_CATEGORIES>).map(key => <span key={key}><i style={{ background: GEC_CATEGORIES[key].color }} />{GEC_CATEGORIES[key].label}</span>)}<span><i style={{ background: NO_VALUE }} />Not matched</span></>
              : Object.entries(WATER_SIGNALS).map(([key, meta]) => <span key={key}><i style={{ background: meta.color }} />{meta.label}</span>)}</div>
          {rows.length === 0 ? <div className={styles.emptyState}><IconSearch /><h3>No matching evidence</h3><p>No records match the current search and filters.</p><button type="button" className={styles.exportButton} onClick={() => { setQuery(""); setDistrict("all"); setSignal("all"); setPage(0); }}>Clear filters</button></div> : view === "fieldbook" ? <div className={styles.fieldbook} aria-label="District fieldbook">
            <div className={styles.fieldbookHead}><span>District / boundary units</span><span>Groundwater signals</span></div>
            {grouped.map(d => <div key={d.name} className={styles.fieldbookRow}>
              <button className={styles.districtButton} type="button" onClick={() => { setDistrict(d.name); setPage(0); }}><strong>{label(d.name)}</strong><small>{d.flagged} flagged / {d.compared} compared</small></button>
              <div className={styles.fieldCells}>{d.rows.map(row => <button type="button" key={row.index} className={row.index === active?.index ? styles.selectedCell : ""} style={{ backgroundColor: rowColor(row, colorBy) }} title={`${label(row.mandal)}: ${rowLabel(row, colorBy)}`} aria-label={`${label(row.mandal)}, ${label(row.district)}: ${rowLabel(row, colorBy)}`} aria-pressed={row.index === active?.index} onClick={() => setSelected(row.index)} />)}</div>
            </div>)}
          </div> : <MandalMap key={`${district}:${signal}:${query}`} evidence={evidence} rows={rows} active={active} mapView={mapView} onSelect={setSelected} colorBy={colorBy} />}
          <p className={styles.viewCaption}>One cell or polygon per mandal boundary. {colorBy === "vegetation" ? "Colour is the satellite vegetation index over cropland for the last four weeks: plant vigour against the same weeks in other years, not planted area or yield." : colorBy === "assessment" ? `Colour is the official groundwater category of the mandal's assessment unit, ${evidence.field?.assessment?.year ?? ""}: how much of its annual extractable groundwater is drawn.` : "Colour represents groundwater change, not planted area, crop health or yield."} District counts use all compared units in that district.</p>
        </div>
        <SelectedEvidence row={active} choices={rows} onSelect={setSelected} evidence={evidence} />
      </div>
      <details className={styles.method}><summary>Coverage, flags and interpretation</summary><p>{evidence.counts.compared} uniquely linked boundary units are compared. {evidence.counts.ambiguousBoundaries} boundaries have ambiguous series or identities; {evidence.counts.unmappedSeries} seasonal source series have no usable boundary index and are not mapped or counted as extra land. Other unresolved boundaries lack matching evidence or sufficient history. Counts therefore differ from the source-series totals on Monsoon Watch.</p><p>Flags reuse the existing seasonal rule: a shortfall of at least 1 m AND at least twice the mandal's historical spread (spread floored at 0.30 m). Flagged shortfalls of at least 2 m are labelled larger shortfalls. A positive shortfall means deeper water than the historical seasonal change would imply. Changes are not attributed to El Niño, and are not direct recharge volumes. Baseline: previous ten years, at least seven comparable seasons. Official boundaries and source authorization remain pending.</p></details>
      <div className={styles.reviewHead}><h3>Field review list</h3><span>Groundwater flags first, then how many sources agree · no crop-loss ranking</span></div>
      <p className={styles.agreementKey}><AgreementDots agreement={{ groundwater: true, rain: false, soil: null, stressed: 1, known: 2 }} /> Marks, in order: groundwater, gauge rain, soil. Filled: points to stress. Open: does not. Dashed: no usable value. <span title={`${AGREEMENT_RULES.groundwater}. ${AGREEMENT_RULES.rain}. ${AGREEMENT_RULES.soil}.`}>Tests: shortfall flagged; rain 20% or more below normal; soil among the driest quarter of years for the date (modelled, and driven by rainfall).</span></p>
      <div className={styles.tableWrap}><table className={styles.reviewTable}><thead><tr><th>Mandal / district</th><th>Water signal</th><th>Shortfall vs normal</th><th>Signals pointing to stress</th><th>Crop evidence</th><th>Next verification</th></tr></thead><tbody>
        {ordered.slice(currentPage * 10, currentPage * 10 + 10).map(row => <tr key={row.index} data-selected={row.index === active?.index}><td><button type="button" onClick={() => setSelected(row.index)}>{label(row.mandal)}<small>{label(row.district)}</small></button></td><td><span className={styles.tableSignal}><i style={{ background: WATER_SIGNALS[row.signal].color }} />{WATER_SIGNALS[row.signal].label}</span></td><td>{row.shortfallM === null ? "Unavailable" : `${num(row.shortfallM)} m`}</td><td><AgreementDots agreement={row.agreement} /></td><td>Not connected</td><td>{row.signal === "unavailable" ? "Resolve source / boundary join" : "Confirm well, crop stage and supply"}</td></tr>)}
        {!rows.length ? <tr><td colSpan={6}>No matching records.</td></tr> : null}
      </tbody></table></div>
      <div className={styles.pagination}><span>{rows.length ? `${currentPage * 10 + 1}-${Math.min((currentPage + 1) * 10, rows.length)} of ${rows.length}` : "0 records"}</span><div><button type="button" className={styles.iconButton} aria-label="Previous review page" title="Previous review page" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><IconChevronLeft /></button><span>Page {currentPage + 1} / {pageCount}</span><button type="button" className={styles.iconButton} aria-label="Next review page" title="Next review page" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}><IconChevronRight /></button></div></div>
    </section>

    <section id="agriculture-readiness" className={styles.section} aria-labelledby="agriculture-readiness-title">
      <header className={styles.sectionHead}><div><span className={styles.eyebrow}>05 / From evidence to an advisory</span><h2 id="agriculture-readiness-title">The missing links matter.</h2></div><span className={styles.scenarioBadge}>Operational release pending</span></header>
      <div className={styles.readinessSteps}>
        <div><span className={styles.stepNumber}>01</span><h3>Water evidence</h3><span className={styles.available}>Dated inputs available</span><p>Groundwater source histories, {evidence.rainfall?.product.split(" monthly")[0] ?? "CHIRPS"} rainfall since {evidence.rainfall?.firstYear ?? 1981} and AP gauge rainfall. Research authorization and official boundary validation pending.</p><Link href="/readiness">Source readiness <IconArrowRight /></Link></div>
        <div><span className={styles.stepNumber}>02</span><h3>Crop &amp; land</h3><span>Not connected</span><p>Season, crop, sown area, sowing date and irrigation source. APWRIMS already holds crop-sown and crop-stress dashboards behind a login: the ask is read access to mandal-by-crop aggregates from e-Panta / APAIMS, not farmer records.</p><a href="https://ap.nic.in/en/publication/presentation-of-state-centre/" target="_blank" rel="noreferrer">NIC crop-booking context <IconArrowRight /></a></div>
        <div><span className={styles.stepNumber}>03</span><h3>Supply &amp; weather</h3><span className={styles.partial}>Partly connected</span>
          <ul className={styles.sourceChecklist} aria-label="Supply and weather sources">
            <li data-state={evidence.water.rain ? "on" : "off"}>Gauge rainfall<small>{evidence.water.rain ? `to ${day(evidence.water.rain.end)}` : "not in this build"}</small></li>
            <li data-state={evidence.water.soil ? "on" : "off"}>Soil moisture, modelled<small>{evidence.water.soil ? day(evidence.water.soil.asOf) : "not in this build"}</small></li>
            <li data-state={evidence.water.reservoirs ? "on" : "off"}>Reservoir storage and releases<small>{evidence.water.reservoirs ? day(evidence.water.reservoirs.asOf) : "not in this build"}</small></li>
            <li data-state="pending">IMD forecasts and warnings<small>API key pending</small></li>
            <li data-state="off">Canal delivery to mandals<small>command-area map not public</small></li>
          </ul>
          <a href="https://imdagrimet.gov.in/cropAdvisory_3.php" target="_blank" rel="noreferrer">IMD crop advisories <IconArrowRight /></a></div>
        <div><span className={styles.stepNumber}>04</span><h3>Verified action</h3><span>Not issued</span><p>Agronomist review, named authority, validity window and field feedback before a farmer-facing recommendation.</p><Link href="/irrigation">AWARE integration preview <IconArrowRight /></Link></div>
      </div>
      <p className={styles.privacyNote}><IconShield />Public view: no farmer identities or personal parcel records. No crop-loss, income-loss or safe-pumping claims. Illustrations are not evidence of actual field conditions.</p>
    </section>
  </div>;
}
