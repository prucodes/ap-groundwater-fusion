"use client";

import { useEffect, useMemo, useState } from "react";
import { IconCopy, IconDownload, IconFile, IconPin } from "./icons";
import styles from "./FieldReport.module.css";

/* A field report with no server: written on the phone, kept there as a draft,
   and shared as plain text that ends in one machine-readable line (#APWR1:...).
   A collector pastes the shared messages (a WhatsApp chat export works) or
   drops the downloaded files to read every report in one table, each beside
   what the site called for that mandal in the week it was written. */

export type SiteCall = { i: number; d: string; m: string; lit: number; known: number; short: number | null; of: number; vci: number | null; irr: number | null };

const CROPS = ["Maize", "Groundnut", "Cotton", "Chilli", "Red gram", "Bengal gram", "Jowar", "Paddy", "Other"] as const;
const STAGES = ["Sowing", "Growing", "Flowering", "Harvest"] as const;
const CONDITIONS = ["Good", "Mild wilting", "Severe wilting", "Failed"] as const;
const WATER = ["Rainfed", "Canal", "Bore well", "Tank"] as const;
const BORES = ["Working", "Some dry", "Most dry"] as const;
const TAG = "#APWR1:";
const DRAFT_KEY = "ap-field-report-draft-v1";
const SHORT_MIN = 4;

type Crop = { c: string; s: string; k: string; w: string };
type Report = {
  v: 1; i: number; d: string; m: string; date: string; crops: Crop[]; bores: string; tankers: boolean; villages: number; note: string;
  site: { week: string | null; lit: number; known: number; short: number | null; of: number; vci: number | null } | null;
};

const today = () => new Date().toISOString().slice(0, 10);
const blankCrop = (): Crop => ({ c: "Maize", s: "Growing", k: "Good", w: "Rainfed" });
const human = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function encode(report: Report) {
  const bytes = new TextEncoder().encode(JSON.stringify(report));
  let binary = "";
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decode(token: string): Report | null {
  try {
    const binary = atob(token.replace(/-/g, "+").replace(/_/g, "/"));
    const value = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, ch => ch.charCodeAt(0))));
    return value && value.v === 1 && typeof value.i === "number" && Array.isArray(value.crops) ? value as Report : null;
  } catch {
    return null;
  }
}

/** The report as a message: readable first, then the line a collector's page reads back. */
function message(report: Report) {
  const lines = [`AP field report · ${report.m}, ${report.d} · ${human(report.date)}`];
  for (const crop of report.crops) lines.push(`${crop.c} (${crop.s.toLowerCase()}, ${crop.w.toLowerCase()}): ${crop.k.toLowerCase()}`);
  lines.push(`Drinking water: bore wells ${report.bores.toLowerCase()}; ${report.tankers ? "tankers running" : "no tankers"}`);
  if (report.villages) lines.push(`Villages visited: ${report.villages}`);
  if (report.site) lines.push(`Site said${report.site.week ? ` (week of ${human(report.site.week)})` : ""}: ${report.site.lit} of ${report.site.known} signals lit${report.site.short !== null ? `; ${report.site.short} of ${report.site.of} crops short of water` : ""}`);
  if (report.note.trim()) lines.push(`Note: ${report.note.trim()}`);
  lines.push(`${TAG}${encode(report)}`);
  return lines.join("\n");
}

/** Short of water in the field: a rainfed crop severely wilting or failed, or half of them wilting. */
function fieldShort(report: Report): boolean | null {
  const rainfed = report.crops.filter(c => c.w === "Rainfed");
  if (!rainfed.length) return null;
  if (rainfed.some(c => c.k === "Severe wilting" || c.k === "Failed")) return true;
  return rainfed.filter(c => c.k === "Mild wilting").length * 2 >= rainfed.length;
}
const siteShort = (report: Report) => (report.site && report.site.short !== null ? report.site.short >= SHORT_MIN : null);
function agreement(report: Report) {
  const field = fieldShort(report), site = siteShort(report);
  if (field === null) return { key: "na", label: "Irrigated crops only" };
  if (site === null) return { key: "na", label: "No site call" };
  if (field && site) return { key: "agree", label: "Agrees: short" };
  if (!field && !site) return { key: "agree", label: "Agrees: not short" };
  return site ? { key: "differ", label: "Site said short; field fine" } : { key: "differ", label: "Field short; site did not say" };
}

function Chips<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: T | string; onChange: (value: T) => void }) {
  return <div className={styles.chips} role="radiogroup" aria-label={label}>
    {options.map(option => <button key={option} type="button" role="radio" aria-checked={value === option} onClick={() => onChange(option)}>{option}</button>)}
  </div>;
}

export function FieldReport({ calls, week }: { calls: SiteCall[]; week: string | null }) {
  const [tab, setTab] = useState<"write" | "collect">("write");
  const [index, setIndex] = useState<number>(calls[0]?.i ?? 0);
  const [date, setDate] = useState(today);
  const [crops, setCrops] = useState<Crop[]>([blankCrop()]);
  const [bores, setBores] = useState<string>("Working");
  const [tankers, setTankers] = useState(false);
  const [villages, setVillages] = useState(1);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [restored, setRestored] = useState(false);

  // The mandal from the link on This Week (?m=<boundary index>), else the saved draft.
  useEffect(() => {
    const fromLink = Number(new URLSearchParams(window.location.search).get("m"));
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
      if (draft && typeof draft.i === "number" && (!fromLink || draft.i === fromLink)) {
        setIndex(draft.i); setDate(draft.date ?? today()); setCrops(draft.crops?.length ? draft.crops : [blankCrop()]);
        setBores(draft.bores ?? "Working"); setTankers(!!draft.tankers); setVillages(draft.villages ?? 1); setNote(draft.note ?? "");
      }
    } catch { /* no saved draft, or storage unavailable */ }
    if (fromLink && calls.some(c => c.i === fromLink)) setIndex(fromLink);
    setRestored(true);
  }, [calls]);

  const call = calls.find(c => c.i === index) ?? null;
  const report: Report | null = call ? {
    v: 1, i: call.i, d: call.d, m: call.m, date, crops, bores, tankers, villages, note: note.slice(0, 300),
    site: { week, lit: call.lit, known: call.known, short: call.short, of: call.of, vci: call.vci },
  } : null;

  useEffect(() => {
    if (!restored || !report) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(report)); } catch { /* storage unavailable: the report still shares */ }
  }, [restored, report]);

  const districts = useMemo(() => {
    const out = new Map<string, SiteCall[]>();
    for (const c of calls) out.set(c.d, [...(out.get(c.d) ?? []), c]);
    return [...out.entries()];
  }, [calls]);

  async function share() {
    if (!report) return;
    const text = message(report);
    if (navigator.share) {
      try { await navigator.share({ title: `Field report · ${report.m}`, text }); return; } catch { /* cancelled: fall through to copy */ }
    }
    await copy();
  }
  async function copy() {
    if (!report) return;
    try { await navigator.clipboard.writeText(message(report)); setCopied(true); setTimeout(() => setCopied(false), 2200); } catch { setCopied(false); }
  }
  function download() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 1)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `field-report-${report.m.replace(/\W+/g, "-").toLowerCase()}-${report.date}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  const setCrop = (at: number, patch: Partial<Crop>) => setCrops(crops.map((c, i) => (i === at ? { ...c, ...patch } : c)));

  return <section className={styles.wrap} data-testid="field-report">
    <div className={styles.tabs} role="tablist" aria-label="Field report">
      <button type="button" role="tab" aria-selected={tab === "write"} onClick={() => setTab("write")}><IconPin /> Write a report</button>
      <button type="button" role="tab" aria-selected={tab === "collect"} onClick={() => setTab("collect")}><IconFile /> Collected reports</button>
    </div>

    {tab === "write" ? <div className={styles.grid}>
      <form className={styles.form} onSubmit={event => { event.preventDefault(); share(); }}>
        <label className={styles.field}><span>Mandal</span>
          <select value={index} onChange={event => setIndex(Number(event.target.value))} aria-label="Mandal visited">
            {districts.map(([district, rows]) => <optgroup key={district} label={district}>
              {rows.map(c => <option key={c.i} value={c.i}>{c.m}</option>)}
            </optgroup>)}
          </select>
        </label>
        <label className={styles.field}><span>Date of the visit</span><input type="date" value={date} max={today()} onChange={event => setDate(event.target.value)} /></label>

        <fieldset className={styles.crops}>
          <legend>Crops seen</legend>
          {crops.map((crop, at) => <div key={at} className={styles.crop} data-testid="field-report-crop">
            <div className={styles.cropHead}>
              <select aria-label={`Crop ${at + 1}`} value={crop.c} onChange={event => setCrop(at, { c: event.target.value })}>{CROPS.map(c => <option key={c}>{c}</option>)}</select>
              {crops.length > 1 ? <button type="button" className={styles.remove} onClick={() => setCrops(crops.filter((_, i) => i !== at))} aria-label={`Remove crop ${at + 1}`}>Remove</button> : null}
            </div>
            <Chips label={`Stage of crop ${at + 1}`} options={STAGES} value={crop.s} onChange={s => setCrop(at, { s })} />
            <Chips label={`Condition of crop ${at + 1}`} options={CONDITIONS} value={crop.k} onChange={k => setCrop(at, { k })} />
            <Chips label={`Water for crop ${at + 1}`} options={WATER} value={crop.w} onChange={w => setCrop(at, { w })} />
          </div>)}
          {crops.length < 3 ? <button type="button" className={styles.add} onClick={() => setCrops([...crops, blankCrop()])}>+ Add a crop</button> : null}
        </fieldset>

        <fieldset className={styles.crops}>
          <legend>Drinking water</legend>
          <Chips label="Bore wells" options={BORES} value={bores} onChange={setBores} />
          <Chips label="Tankers" options={["No tankers", "Tankers running"] as const} value={tankers ? "Tankers running" : "No tankers"} onChange={value => setTankers(value === "Tankers running")} />
        </fieldset>

        <label className={styles.field}><span>Villages visited</span><input type="number" min={1} max={40} value={villages} onChange={event => setVillages(Math.max(1, Math.min(40, Number(event.target.value) || 1)))} /></label>
        <label className={styles.field}><span>Note <small>no names or phone numbers · {300 - note.length} left</small></span>
          <textarea rows={3} maxLength={300} value={note} onChange={event => setNote(event.target.value)} placeholder="What the fields and wells showed" />
        </label>

        <div className={styles.actions}>
          <button type="submit" className={styles.primary}>Share report</button>
          <button type="button" className={styles.secondary} onClick={copy}><IconCopy /> {copied ? "Copied" : "Copy text"}</button>
          <button type="button" className={styles.secondary} onClick={download}><IconDownload /> Save file</button>
        </div>
      </form>

      <aside className={styles.side}>
        {call ? <div className={styles.called} data-testid="field-report-site">
          <span className={styles.kicker}>What the site called{week ? `, week of ${human(week)}` : ""}</span>
          <h3>{call.m}<small>{call.d}</small></h3>
          <dl>
            <div><dt>Stress signals lit</dt><dd><b>{call.lit}</b> of {call.known}</dd></div>
            <div><dt>Crops short of water</dt><dd>{call.short === null ? "—" : <><b>{call.short}</b> of {call.of}</>}<small>mid-season, FAO-56 check</small></dd></div>
            <div><dt>Crop vegetation</dt><dd>{call.vci === null ? "—" : <b>{call.vci}</b>}<small>VCI · under 40 is severe</small></dd></div>
            <div><dt>Cropland irrigated</dt><dd>{call.irr === null ? "—" : <b>{call.irr}%</b>}<small>ESA WorldCereal</small></dd></div>
          </dl>
          <p>Note what you see, not what the site says: a report that disagrees is the most useful one.</p>
        </div> : null}
        {report ? <pre className={styles.preview} aria-label="The message that will be shared">{message(report).split("\n").slice(0, -1).join("\n")}</pre> : null}
      </aside>
    </div> : <Collector />}
  </section>;
}

function Collector() {
  const [text, setText] = useState("");
  const reports = useMemo(() => {
    const seen = new Set<string>(), out: Report[] = [];
    for (const match of text.matchAll(/#APWR1:([A-Za-z0-9_-]+)/g)) {
      const report = decode(match[1]);
      const key = report ? `${report.i}|${report.date}|${JSON.stringify(report.crops)}` : "";
      if (report && !seen.has(key)) { seen.add(key); out.push(report); }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date) || a.d.localeCompare(b.d));
  }, [text]);
  const judged = reports.map(agreement);
  const comparable = judged.filter(a => a.key !== "na").length, agree = judged.filter(a => a.key === "agree").length;

  async function readFiles(files: FileList | null) {
    if (!files) return;
    const parts: string[] = [];
    for (const file of Array.from(files)) {
      const body = await file.text();
      try {
        const value = JSON.parse(body);
        parts.push(...(Array.isArray(value) ? value : [value]).filter(v => v && v.v === 1).map(v => `${TAG}${encode(v as Report)}`));
      } catch { parts.push(body); }
    }
    setText(current => [current, ...parts].filter(Boolean).join("\n"));
  }
  function exportCsv() {
    const rows = [["date", "district", "mandal", "crops", "bore wells", "tankers", "villages", "site signals lit", "site crops short", "agreement", "note"]];
    reports.forEach((r, i) => rows.push([r.date, r.d, r.m, r.crops.map(c => `${c.c} (${c.s}, ${c.w}): ${c.k}`).join("; "), r.bores, r.tankers ? "yes" : "no",
      String(r.villages), r.site ? `${r.site.lit}/${r.site.known}` : "", r.site?.short !== null && r.site ? `${r.site.short}/${r.site.of}` : "", judged[i].label, r.note]));
    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `field-reports-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return <div className={styles.collect} data-testid="field-report-collect">
    <div className={styles.paste}>
      <label className={styles.field}><span>Paste the shared reports <small>a WhatsApp chat export works; only the report lines are read</small></span>
        <textarea rows={6} value={text} onChange={event => setText(event.target.value)} placeholder="AP field report · …" aria-label="Shared reports" />
      </label>
      <label className={styles.fileDrop}><input type="file" accept=".json,.txt,application/json,text/plain" multiple onChange={event => readFiles(event.target.files)} />Or choose saved report files</label>
    </div>
    {reports.length ? <>
      <p className={styles.summary} data-testid="field-report-summary">
        <b>{reports.length}</b> report{reports.length === 1 ? "" : "s"} from <b>{new Set(reports.map(r => r.i)).size}</b> mandal{new Set(reports.map(r => r.i)).size === 1 ? "" : "s"}.
        {comparable ? <> Where rainfed crops were seen, the field and the site&rsquo;s crop water call agree in <b>{agree} of {comparable}</b>.</> : null}
        <button type="button" className={styles.secondary} onClick={exportCsv}><IconDownload /> CSV</button>
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Visit</th><th>Mandal</th><th>Crops seen</th><th>Drinking water</th><th>Site called</th><th>Field and site</th></tr></thead>
          <tbody>
            {reports.map((r, i) => <tr key={`${r.i}-${r.date}-${i}`}>
              <td>{human(r.date)}</td>
              <td><b>{r.m}</b><small>{r.d}</small></td>
              <td>{r.crops.map((c, k) => <span key={k} className={styles.cropTag} data-k={c.k}>{c.c} · {c.k.toLowerCase()}{c.w !== "Rainfed" ? ` · ${c.w.toLowerCase()}` : ""}</span>)}</td>
              <td>Bores {r.bores.toLowerCase()}{r.tankers ? " · tankers" : ""}</td>
              <td>{r.site ? <>{r.site.lit} of {r.site.known} lit{r.site.short !== null ? <small>{r.site.short} of {r.site.of} crops short</small> : null}</> : "—"}</td>
              <td><span className={styles.verdict} data-key={judged[i].key}>{judged[i].label}</span></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </> : <p className={styles.empty}>Shared reports appear here as a table, each beside what the site called for that mandal in the week it was written. Nothing pasted here leaves this browser.</p>}
  </div>;
}
