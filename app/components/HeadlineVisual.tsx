import type { CSSProperties } from "react";

/* One small picture under each Overview headline figure, drawn from the same data as the
   figure and animated once as the page opens (ChartReveal, data-draw="always"): lines draw, bars
   grow, keys fade in. Bars and keys
   are HTML so their text stays readable on a phone; only the season lines are drawn. */

type Trajectory = { year: number; current: boolean; points: { month: number; changeM: number }[] }[];

const W = 220, H = 46;
// Each card starts a little after the one before it.
const wipe = (delay: number): CSSProperties => ({ "--d": `${delay}ms` } as CSSProperties);

/** This season's water table since May against every past season: past years rose, this one did not.
    A fall in depth (negative change) is drawn as a rise in the water table. */
export function SeasonRise({ trajectory, delay = 0 }: { trajectory: Trajectory; delay?: number }) {
  const rises = trajectory.flatMap(t => t.points.map(p => -p.changeM));
  const top = Math.max(0.5, ...rises), bottom = Math.min(0, ...rises);
  const x = (month: number) => 4 + ((month - 5) / 7) * (W - 30);
  const y = (rise: number) => 4 + ((top - rise) / (top - bottom)) * (H - 10);
  const line = (t: Trajectory[number]) => t.points.map((p, i) => `${i ? "L" : "M"}${x(p.month).toFixed(1)},${y(-p.changeM).toFixed(1)}`).join("");
  const current = trajectory.find(t => t.current);
  const end = current?.points[current.points.length - 1];
  return (
    <div className="headlineVisual" data-draw="always" style={wipe(delay)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Water table change since May: past seasons rose up to ${top.toFixed(1)} m; this season ${end ? `${(-end.changeM).toFixed(1)} m` : "has no reading yet"}.`}>
        <line x1={4} x2={W - 26} y1={y(0)} y2={y(0)} className="hvBase" />
        {trajectory.filter(t => !t.current && t.points.length > 2).map((t, i) => <path key={t.year} d={line(t)} className="hvPast" pathLength={1} style={{ "--i": i } as CSSProperties} />)}
        {current ? <path d={line(current)} className="hvNow" pathLength={1} /> : null}
        {end ? <circle cx={x(end.month)} cy={y(-end.changeM)} r={2.8} className="hvNowDot" /> : null}
      </svg>
      <span className="hvKey"><span><i className="hvSwatch hvPart-past" />past seasons rose</span><span><i className="hvSwatch hvPart-now" />{current?.year ?? "this year"}</span></span>
    </div>
  );
}

/** The median sensor's depth below ground, a year ago and today, as two bars from the surface. */
export function DepthPair({ yearAgo, today, delay = 0 }: { yearAgo: number; today: number; delay?: number }) {
  const most = Math.max(today, yearAgo, 1);
  const row = (label: string, value: number, tone: string) => (
    <span className="hvRow"><span>{label}</span><span className="hvTrack"><i className={`hvPart-${tone}`} style={{ width: `${(value / most) * 100}%`, "--i": tone === "now" ? 1 : 0 } as CSSProperties} /></span><b>{value.toFixed(1)} m</b></span>
  );
  return (
    <div className="headlineVisual" data-draw="always" style={wipe(delay)} role="img"
      aria-label={`Median depth to water: ${yearAgo.toFixed(1)} m a year ago, ${today.toFixed(1)} m today.`}>
      {row("a year ago", yearAgo, "then")}
      {row("today", today, "now")}
    </div>
  );
}

/** Every mandal in one bar, split by where it stands, with a small key; the numbers are the ones
    the card's sentence quotes, so the picture and the words never disagree. */
export function ShareBar({ parts, delay = 0, label }: { parts: { name: string; value: number; tone: "now" | "warn" | "ok" | "none" }[]; delay?: number; label: string }) {
  return (
    <div className="headlineVisual" data-draw="always" style={wipe(delay)} role="img"
      aria-label={`${label}: ${parts.map(p => `${p.value} ${p.name}`).join(", ")}.`}>
      <span className="hvShare">{parts.map((p, i) => <i key={p.name} className={`hvPart-${p.tone}`} style={{ flexGrow: p.value, "--i": i } as CSSProperties} />)}</span>
      <span className="hvKey">{parts.filter(p => p.tone !== "none").map(p => <span key={p.name}><i className={`hvSwatch hvPart-${p.tone}`} />{p.name}</span>)}</span>
    </div>
  );
}
